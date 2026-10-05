'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { api } from '@/lib/api';
import { useConfig } from '@/lib/config';
import { formatTime } from '@/lib/format';
import { FAIL_REASONS } from '@/lib/labels';
import { offlineQueue, type QueueItem, type QueueSnapshot } from '@/lib/offlineQueue';
import { usePositions } from '@/lib/positions';
import type { Config, Delivery, DeliveryStatus, FailReason, LocationPing, Stop, Truck } from '@/lib/types';

// Demo session: a constant, not a login flow.
export const DEMO_TRUCK_ID = process.env.NEXT_PUBLIC_DEMO_TRUCK_ID ?? 'KF-12';
/** A gap in location longer than this gets the paused notice. */
const GAP_MS = 2 * 60_000;
const CACHE_KEY = 'driver-deliveries';

export type GpsState = 'starting' | 'live' | 'denied' | 'unsupported';

/** A stop with the driver's local progress merged in. TODO(stops-api): per-stop events aren't sent yet. */
export interface DriverStop extends Stop {
  arrivedAt: string | null;
  doneAt: string | null;
  done: boolean;
  /** The arrive or complete event is still waiting in the queue. */
  unsent: boolean;
}

interface Progress {
  arrived: Record<number, string>;
  done: Record<number, string>;
  /** Quick messages sent, per stop: message index → time. */
  msgs: Record<number, Record<number, string>>;
  /** TODO(pod-api): proof of delivery isn't sent; kept for the summary only. */
  podName?: string;
  failReason?: FailReason;
}
const EMPTY_PROGRESS: Progress = { arrived: {}, done: {}, msgs: {} };

interface DriverCtx {
  config: Config;
  truckId: string;
  truck: Truck | undefined;
  loading: boolean;
  loadError: Error | null;
  /** The delivery to work on: in transit, or assigned. */
  active: Delivery | null;
  /** The most recent ended delivery, for the summary screen. */
  ended: Delivery | null;
  stops: DriverStop[];
  /** Index of the first stop not done, or -1. */
  current: number;
  progressFor: (deliveryId: string) => Progress;
  start: () => void;
  arrive: (seq: number) => void;
  completeStop: (seq: number) => void;
  completeDelivery: (podName: string) => void;
  fail: (reason: FailReason) => void;
  markMessage: (seq: number, i: number) => void;
  gps: { state: GpsState; lastFixAt: number | null; pos: { lat: number; lng: number } | null };
  gap: { from: number; to: number } | null;
  dismissGap: () => void;
  keepScreenOn: () => void;
  queue: QueueSnapshot;
  online: boolean;
  time: (iso: string | Date) => string;
}

const Ctx = createContext<DriverCtx | null>(null);

export function useDriver(): DriverCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useDriver outside DriverProvider');
  return c;
}

const readJson = <T,>(key: string): T | null => {
  try {
    const s = localStorage.getItem(key);
    return s ? (JSON.parse(s) as T) : null;
  } catch {
    return null;
  }
};
const writeJson = (key: string, v: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    // Storage full or blocked: progress stays in memory for this session.
  }
};

function useOnline(): boolean {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener('online', cb);
      window.addEventListener('offline', cb);
      return () => {
        window.removeEventListener('online', cb);
        window.removeEventListener('offline', cb);
      };
    },
    () => navigator.onLine,
    () => true,
  );
}

const ENDED = new Set<DeliveryStatus>(['completed', 'failed', 'cancelled']);

export function DriverProvider({ children }: { children: ReactNode }) {
  const config = useConfig();
  const qc = useQueryClient();
  const truckId = DEMO_TRUCK_ID;
  const online = useOnline();
  const queue = useSyncExternalStore(offlineQueue.subscribe, offlineQueue.getSnapshot, offlineQueue.getSnapshot);
  const time = useCallback((iso: string | Date) => formatTime(iso, config.timezone, config.locale), [config.timezone, config.locale]);

  // ---- Data. The last answer is cached so the app opens offline. ----
  const key = useMemo(() => ['driver-deliveries', truckId] as const, [truckId]);
  const q = useQuery({
    queryKey: key,
    queryFn: async () => {
      const ds = await api<Delivery[]>(`/deliveries?truck_id=${encodeURIComponent(truckId)}`);
      writeJson(CACHE_KEY, ds);
      return ds;
    },
    initialData: () => readJson<Delivery[]>(CACHE_KEY) ?? undefined,
    initialDataUpdatedAt: 0,
    refetchInterval: 15_000,
  });
  const truck = usePositions().data?.find((t) => t.id === truckId);

  // Refetch once something has reached the server.
  useEffect(() => {
    if (queue.lastSent && queue.lastSent.kind !== 'locations') void qc.invalidateQueries({ queryKey: key });
  }, [queue.sentCount, queue.lastSent, qc, key]);

  // ---- Local state: optimistic statuses and per-stop progress ----
  const [overrides, setOverrides] = useState<Record<string, { status: DeliveryStatus; at: string }>>({});
  const [progress, setProgress] = useState<Record<string, Progress>>({});
  const progressFor = useCallback(
    (id: string): Progress => progress[id] ?? readJson<Progress>(`driver-progress:${id}`) ?? EMPTY_PROGRESS,
    [progress],
  );
  const updateProgress = (id: string, fn: (p: Progress) => Progress) => {
    const next = fn(progressFor(id));
    writeJson(`driver-progress:${id}`, next);
    setProgress((all) => ({ ...all, [id]: next }));
  };

  const deliveries = useMemo(() => {
    // Queued actions that haven't reached the server still count, even after a reload.
    const pending: Record<string, DeliveryStatus> = {};
    for (const it of queue.items) {
      if (!it.deliveryId) continue;
      if (it.kind === 'start') pending[it.deliveryId] ??= 'in_transit';
      if (it.kind === 'complete') pending[it.deliveryId] = 'completed';
      if (it.kind === 'fail') pending[it.deliveryId] = 'failed';
    }
    return (q.data ?? []).map((d) => {
      const o = overrides[d.id];
      const status = ENDED.has(d.status) ? d.status : (pending[d.id] ?? o?.status ?? d.status);
      if (status === d.status) return d;
      return { ...d, status, ended_at: ENDED.has(status) ? (o?.at ?? new Date().toISOString()) : d.ended_at, started_at: d.started_at ?? o?.at ?? null };
    });
  }, [q.data, overrides, queue.items]);

  const active =
    deliveries.find((d) => d.status === 'in_transit') ?? deliveries.find((d) => d.status === 'assigned') ?? null;
  const ended =
    deliveries
      .filter((d) => (d.status === 'completed' || d.status === 'failed') && d.ended_at)
      .sort((a, b) => Date.parse(b.ended_at!) - Date.parse(a.ended_at!))[0] ?? null;

  const stops: DriverStop[] = useMemo(() => {
    if (!active) return [];
    const p = progressFor(active.id);
    const unsent = new Set(queue.items.filter((x) => x.kind === 'stop' && x.deliveryId === active.id).map((x) => x.stopSeq));
    return active.stops.map((s) => {
      const doneAt = p.done[s.seq] ?? (s.status === 'done' ? s.completed_at : null);
      return { ...s, arrivedAt: p.arrived[s.seq] ?? null, doneAt, done: s.status === 'done' || !!p.done[s.seq], unsent: unsent.has(s.seq) };
    });
  }, [active, progressFor, queue.items]);
  const current = stops.findIndex((s) => !s.done);

  // ---- Actions: written to the queue first, then sent ----
  const enqueue = (item: QueueItem) => void offlineQueue.enqueue(item);
  const now = () => new Date().toISOString();

  const start = () => {
    if (!active) return;
    const at = now();
    setOverrides((o) => ({ ...o, [active.id]: { status: 'in_transit', at } }));
    enqueue({ kind: 'start', path: `/deliveries/${encodeURIComponent(active.id)}/start`, label: 'Started the delivery', at, deliveryId: active.id });
  };
  const stopEvent = (seq: number, what: 'arrived' | 'done') => {
    if (!active) return;
    const at = now();
    const s = active.stops.find((x) => x.seq === seq);
    updateProgress(active.id, (p) => ({ ...p, [what]: { ...p[what], [seq]: at } }));
    setGap(null);
    const verb = what === 'arrived' ? 'Arrived at' : s?.kind === 'pickup' ? 'Collected at' : 'Delivered at';
    // TODO(stops-api): no per-stop endpoint yet; queued so the driver sees it, never sent.
    enqueue({ kind: 'stop', path: null, label: `${verb} stop ${seq}`, at, deliveryId: active.id, stopSeq: seq });
  };
  const completeDelivery = (podName: string) => {
    if (!active) return;
    const last = active.stops[active.stops.length - 1];
    if (last) stopEvent(last.seq, 'done');
    const at = now();
    // TODO(pod-api): the receiver's name needs a field on /complete; kept locally for the summary.
    updateProgress(active.id, (p) => ({ ...p, podName }));
    setOverrides((o) => ({ ...o, [active.id]: { status: 'completed', at } }));
    enqueue({ kind: 'complete', path: `/deliveries/${encodeURIComponent(active.id)}/complete`, label: 'Completed the delivery', at, deliveryId: active.id });
  };
  const fail = (reason: FailReason) => {
    if (!active) return;
    const at = now();
    updateProgress(active.id, (p) => ({ ...p, failReason: reason }));
    setOverrides((o) => ({ ...o, [active.id]: { status: 'failed', at } }));
    const label = FAIL_REASONS.find((r) => r.key === reason)?.label ?? 'Problem';
    enqueue({ kind: 'fail', path: `/deliveries/${encodeURIComponent(active.id)}/fail`, body: { reason }, label: `Reported: ${label}`, at, deliveryId: active.id });
  };
  const markMessage = (seq: number, i: number) => {
    if (!active) return;
    updateProgress(active.id, (p) => ({ ...p, msgs: { ...p.msgs, [seq]: { ...p.msgs[seq], [i]: now() } } }));
  };

  // ---- Queue: send what a previous session left, and again whenever the connection returns ----
  useEffect(() => {
    void offlineQueue.open();
    const on = () => void offlineQueue.flush();
    window.addEventListener('online', on);
    return () => window.removeEventListener('online', on);
  }, []);

  // ---- GPS: watchPosition, batched into POST /locations every ping interval ----
  const [gpsState, setGpsState] = useState<GpsState>('starting');
  const [lastFixAt, setLastFixAt] = useState<number | null>(null);
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  const buffer = useRef<LocationPing[]>([]);
  const lastPing = useRef<LocationPing | null>(null);
  const watchOk = useRef(false);
  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setGpsState('unsupported');
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (p) => {
        const ping: LocationPing = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy ?? null, at: new Date(p.timestamp).toISOString() };
        buffer.current.push(ping);
        lastPing.current = ping;
        watchOk.current = true;
        setPos({ lat: ping.lat, lng: ping.lng });
        setLastFixAt(p.timestamp);
        setGpsState('live');
      },
      (e) => {
        watchOk.current = false;
        if (e.code === e.PERMISSION_DENIED) setGpsState('denied');
      },
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 30_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);
  useEffect(() => {
    const iv = setInterval(() => {
      let pings = buffer.current;
      // A parked phone gets no new fixes; while the watch is healthy, repeat the last one so a
      // stationary truck keeps reporting instead of going silent on the console.
      if (!pings.length && watchOk.current && lastPing.current) {
        pings = [{ ...lastPing.current, at: new Date().toISOString() }];
      }
      if (!pings.length) return;
      buffer.current = [];
      enqueue({
        kind: 'locations',
        path: '/locations',
        body: { truck_id: truckId, pings },
        label: 'GPS positions',
        at: pings[0]!.at,
        pings: pings.length,
      });
    }, config.ping_seconds * 1000);
    return () => clearInterval(iv);
  }, [config.ping_seconds, truckId]);

  // ---- Wake Lock while a delivery is active; paused notice for gaps over 2 minutes ----
  const lock = useRef<WakeLockSentinel | null>(null);
  const requestLock = useCallback(async () => {
    try {
      if (!('wakeLock' in navigator) || document.visibilityState !== 'visible' || (lock.current && !lock.current.released)) return;
      lock.current = await navigator.wakeLock.request('screen');
    } catch {
      // Battery saver or no permission: the paused notice covers the consequence.
    }
  }, []);
  const hasActive = !!active;
  useEffect(() => {
    if (!hasActive) {
      void lock.current?.release().catch(() => undefined);
      lock.current = null;
      return;
    }
    void requestLock();
  }, [hasActive, requestLock]);

  const [gap, setGap] = useState<{ from: number; to: number } | null>(null);
  const hiddenAt = useRef<number | null>(null);
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt.current = Date.now();
        return;
      }
      const from = hiddenAt.current;
      hiddenAt.current = null;
      // Shown once per gap: each unlock is a new gap.
      if (from && hasActive && Date.now() - from > GAP_MS) setGap({ from, to: Date.now() });
      void (hasActive && requestLock());
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [hasActive, requestLock]);

  const value: DriverCtx = {
    config,
    truckId,
    truck,
    loading: q.isPending,
    loadError: q.error,
    active,
    ended,
    stops,
    current,
    progressFor,
    start,
    arrive: (seq) => stopEvent(seq, 'arrived'),
    completeStop: (seq) => stopEvent(seq, 'done'),
    completeDelivery,
    fail,
    markMessage,
    gps: { state: gpsState, lastFixAt, pos },
    gap,
    dismissGap: () => setGap(null),
    keepScreenOn: () => {
      void requestLock();
      setGap(null);
    },
    queue,
    online,
    time,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
