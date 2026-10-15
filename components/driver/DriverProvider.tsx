'use client';

import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { inServiceArea, useConfig, type AppConfig } from '@/lib/config';
import { DELIVERIES_KEY, detailKey, useDeliveries, useDeliveryDetail, useDrivers } from '@/lib/deliveries';
import { formatTime } from '@/lib/format';
import { FAIL_REASONS } from '@/lib/labels';
import { offlineQueue, type DroppedItem, type QueueItem, type QueueSnapshot } from '@/lib/offlineQueue';
import { usePositions } from '@/lib/positions';
import type { DeliveryDetailResponse, DeliveryListItem, DeliveryStatus, FailReason, LocationPing, StopKind, StopStatus, Truck } from '@/lib/types';

// Demo session: a constant, not a login flow. A plate number or the truck's uuid.
export const DEMO_TRUCK = process.env.NEXT_PUBLIC_DEMO_TRUCK_ID ?? 'KF-12';
/** A gap in location longer than this gets the paused notice. */
const GAP_MS = 2 * 60_000;
const CACHE_KEY = 'driver-cache';

export type GpsState = 'starting' | 'live' | 'denied' | 'unsupported';

/** A stop with the driver's queued (not yet confirmed) arrive/complete merged in. */
export interface DriverStop {
  id: string;
  seq: number;
  kind: StopKind;
  address: string;
  lat: number | null;
  lng: number | null;
  status: StopStatus;
  arrivedAt: string | null;
  doneAt: string | null;
  arrived: boolean;
  done: boolean;
  /** The arrive or complete for this stop is still waiting in the queue. */
  unsent: boolean;
  /** The site contact for this stop, when one was given; otherwise the delivery's customer is who to call. */
  contactName: string | null;
  contactPhone: string | null;
}

/** Kept on the phone per delivery: when the driver confirmed each step, quick messages, POD. */
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
  config: AppConfig;
  truck: Truck | undefined;
  truckLabel: string;
  driverName: string | null;
  loading: boolean;
  loadError: Error | null;
  /** The delivery to work on: in transit, or assigned. */
  active: DeliveryListItem | null;
  /** Stops, events and the customer phone of the active delivery. */
  detail: DeliveryDetailResponse | undefined;
  /** The most recent ended delivery, for the summary screen. */
  ended: DeliveryListItem | null;
  stops: DriverStop[];
  /** Index of the first stop not done, or -1. */
  current: number;
  progressFor: (deliveryId: string) => Progress;
  /** When a status change was made on this phone (for the summary while it's still queued). */
  localStatusAt: (deliveryId: string) => string | null;
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
const path = (deliveryId: string, rest = '') => `/deliveries/${encodeURIComponent(deliveryId)}${rest}`;

interface Cache {
  truck: Truck | null;
  deliveries: DeliveryListItem[];
  detail: DeliveryDetailResponse | null;
}

export function DriverProvider({ children }: { children: ReactNode }) {
  const config = useConfig();
  const qc = useQueryClient();
  const online = useOnline();
  const queue = useSyncExternalStore(offlineQueue.subscribe, offlineQueue.getSnapshot, offlineQueue.getSnapshot);
  const time = useCallback((iso: string | Date) => formatTime(iso, config.timezone, config.locale), [config.timezone, config.locale]);
  // The last good answers, so the app opens with no signal.
  const [cache] = useState<Cache | null>(() => readJson<Cache>(CACHE_KEY));

  // ---- Which truck is this phone? The demo id may be a plate or a uuid. ----
  const trucksQ = usePositions();
  const want = DEMO_TRUCK.trim().toLowerCase();
  const truck = trucksQ.data?.find((t) => t.id.toLowerCase() === want || t.plate_number.toLowerCase() === want) ?? cache?.truck ?? undefined;
  const truckId = truck?.id ?? null;
  const driverName = useDrivers().data?.find((d) => d.id === truck?.driver_id)?.name ?? null;

  // ---- Deliveries: the list has no truck filter, so it's filtered here. ----
  const listQ = useDeliveries();
  const mine = useMemo(
    () => (listQ.data ? listQ.data.filter((d) => d.truck_id === truckId) : (cache?.deliveries ?? [])),
    [listQ.data, truckId, cache],
  );

  // ---- Local state: optimistic statuses and per-stop progress ----
  const [overrides, setOverrides] = useState<Record<string, { status: DeliveryStatus; at: string }>>({});
  const [progress, setProgress] = useState<Record<string, Progress>>({});
  // `progress` is the value captured at render, so several updates in one pass (completeDelivery
  // makes three) would each start from it and overwrite each other. The ref is updated
  // synchronously by every write, so the next read sees it; state still drives re-renders.
  const progressRef = useRef<Record<string, Progress>>({});
  const progressFor = useCallback(
    (id: string): Progress =>
      progressRef.current[id] ?? progress[id] ?? readJson<Progress>(`driver-progress:${id}`) ?? EMPTY_PROGRESS,
    [progress],
  );
  const updateProgress = (id: string, fn: (p: Progress) => Progress) => {
    const next = fn(progressFor(id));
    progressRef.current[id] = next;
    writeJson(`driver-progress:${id}`, next);
    setProgress((all) => ({ ...all, [id]: next }));
  };

  // Undo what a refused action wrote optimistically, so the screens fall back to the server.
  // Otherwise a refused step shows as done (across reloads, for stop events), and a stale status
  // picks the wrong `active` delivery: a refused start hides the start button, a refused complete
  // leaves the driver on the summary of a delivery that's still running. Each entry is handled once.
  const rolledBack = useRef(new WeakSet<DroppedItem>());
  useEffect(() => {
    const clearStatus = new Set<string>();
    for (const d of queue.dropped) {
      if (rolledBack.current.has(d)) continue;
      rolledBack.current.add(d);
      const { kind, deliveryId, stopSeq, stopAction, path: p } = d.item;
      if (!deliveryId) continue;
      if (kind === 'stop') {
        if (stopSeq == null) continue;
        // Items queued before stopAction existed: the endpoint says which step it was.
        const what = stopAction ?? (p?.endsWith('/arrive') ? 'arrived' : 'done');
        updateProgress(deliveryId, (pr) => {
          const rec = { ...pr[what] };
          delete rec[stopSeq];
          return { ...pr, [what]: rec };
        });
      } else if (kind === 'start' || kind === 'complete' || kind === 'fail') {
        // Delete, don't restore: overrides is only an optimistic layer, so without the entry
        // `deliveries` falls through to the server's status.
        clearStatus.add(deliveryId);
        // The summary would otherwise keep a receiver's name or a reason for something that never happened.
        if (kind === 'complete') updateProgress(deliveryId, ({ podName: _n, ...pr }) => pr);
        if (kind === 'fail') updateProgress(deliveryId, ({ failReason: _r, ...pr }) => pr);
      }
    }
    if (clearStatus.size)
      setOverrides((o) => Object.fromEntries(Object.entries(o).filter(([id]) => !clearStatus.has(id))));
    // updateProgress is recreated each render; only new dropped entries matter here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue.dropped]);

  const deliveries = useMemo(() => {
    // Queued actions that haven't reached the server still count, even after a reload.
    const pending: Record<string, DeliveryStatus> = {};
    for (const it of queue.items) {
      if (!it.deliveryId) continue;
      if (it.kind === 'start') pending[it.deliveryId] ??= 'in_transit';
      if (it.kind === 'complete') pending[it.deliveryId] = 'completed';
      if (it.kind === 'fail') pending[it.deliveryId] = 'failed';
    }
    return mine.map((d) => {
      const status = ENDED.has(d.status) ? d.status : (pending[d.id] ?? overrides[d.id]?.status ?? d.status);
      return status === d.status ? d : { ...d, status };
    });
  }, [mine, overrides, queue.items]);

  const active = deliveries.find((d) => d.status === 'in_transit') ?? deliveries.find((d) => d.status === 'assigned') ?? null;
  // The list has no end time; newest first by booking is the best order available.
  const ended =
    deliveries
      .filter((d) => d.status === 'completed' || d.status === 'failed')
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0] ?? null;

  const detailQ = useDeliveryDetail(active?.id ?? null);
  const detail = detailQ.data ?? (cache?.detail && cache.detail.delivery.id === active?.id ? cache.detail : undefined);

  useEffect(() => {
    if (listQ.data || detailQ.data) writeJson(CACHE_KEY, { truck: truck ?? null, deliveries: mine, detail: detailQ.data ?? null } satisfies Cache);
  }, [listQ.data, detailQ.data, truck, mine]);

  // Refetch once something has reached the server.
  useEffect(() => {
    const s = queue.lastSent;
    if (!s || s.kind === 'locations') return;
    void qc.invalidateQueries({ queryKey: DELIVERIES_KEY });
    if (s.deliveryId) void qc.invalidateQueries({ queryKey: detailKey(s.deliveryId) });
  }, [queue.sentCount, queue.lastSent, qc]);

  const stops: DriverStop[] = useMemo(() => {
    if (!active || !detail) return [];
    const p = progressFor(active.id);
    const unsent = new Set(queue.items.filter((x) => x.kind === 'stop' && x.deliveryId === active.id).map((x) => x.stopSeq));
    return detail.stops.map((s) => {
      const doneServer = s.status === 'completed' || s.status === 'skipped';
      const done = doneServer || !!p.done[s.sequence];
      return {
        id: s.id,
        seq: s.sequence,
        kind: s.stop_type,
        address: s.address,
        lat: s.lat,
        lng: s.lng,
        status: s.status,
        arrivedAt: s.arrived_at ?? p.arrived[s.sequence] ?? null,
        doneAt: s.completed_at ?? p.done[s.sequence] ?? null,
        arrived: done || s.status === 'arrived' || !!p.arrived[s.sequence],
        done,
        unsent: unsent.has(s.sequence),
        // `?? null`: a detail cached before the API returned contacts has no such fields.
        contactName: s.contact_name ?? null,
        contactPhone: s.contact_phone ?? null,
      };
    });
  }, [active, detail, progressFor, queue.items]);
  const current = stops.findIndex((s) => !s.done);

  // ---- Actions: written to the queue first, then sent in order ----
  const enqueue = (item: QueueItem) => void offlineQueue.enqueue(item);
  const now = () => new Date().toISOString();

  const start = () => {
    if (!active) return;
    const at = now();
    setOverrides((o) => ({ ...o, [active.id]: { status: 'in_transit', at } }));
    enqueue({ kind: 'start', path: path(active.id, '/start'), label: 'Started the delivery', at, deliveryId: active.id });
  };
  const stopEvent = (seq: number, what: 'arrived' | 'done') => {
    if (!active) return;
    const s = stops.find((x) => x.seq === seq);
    if (!s) return;
    const at = now();
    updateProgress(active.id, (p) => ({ ...p, [what]: { ...p[what], [seq]: at } }));
    setGap(null);
    const verb = what === 'arrived' ? 'Arrived at' : s.kind === 'pickup' ? 'Collected at' : 'Delivered at';
    enqueue({
      kind: 'stop',
      path: path(active.id, `/stops/${encodeURIComponent(s.id)}/${what === 'arrived' ? 'arrive' : 'complete'}`),
      label: `${verb} stop ${seq}`,
      at,
      deliveryId: active.id,
      stopSeq: seq,
      stopAction: what,
    });
  };
  const completeDelivery = (podName: string) => {
    if (!active) return;
    const last = stops[stops.length - 1];
    if (last && !last.done) {
      if (!last.arrived) stopEvent(last.seq, 'arrived');
      stopEvent(last.seq, 'done');
    }
    const at = now();
    // TODO(pod-api): the receiver's name needs a field on /complete; kept locally for the summary.
    updateProgress(active.id, (p) => ({ ...p, podName }));
    setOverrides((o) => ({ ...o, [active.id]: { status: 'completed', at } }));
    enqueue({ kind: 'complete', path: path(active.id, '/complete'), label: 'Completed the delivery', at, deliveryId: active.id });
  };
  const fail = (reason: FailReason) => {
    if (!active) return;
    const at = now();
    updateProgress(active.id, (p) => ({ ...p, failReason: reason }));
    setOverrides((o) => ({ ...o, [active.id]: { status: 'failed', at } }));
    const label = FAIL_REASONS.find((r) => r.key === reason)?.label ?? 'Problem';
    enqueue({ kind: 'fail', path: path(active.id, '/fail'), body: { reason }, label: `Reported: ${label}`, at, deliveryId: active.id });
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
  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setGpsState('unsupported');
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (p) => {
        const ping: LocationPing = {
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          recorded_at: new Date(p.timestamp).toISOString(),
          accuracy_m: p.coords.accuracy ?? null,
          // m/s → km/h; null when the phone doesn't know.
          speed_kph: p.coords.speed != null ? Math.round(p.coords.speed * 3.6 * 10) / 10 : null,
        };
        buffer.current.push(ping);
        setPos({ lat: ping.lat, lng: ping.lng });
        setLastFixAt(p.timestamp);
        setGpsState('live');
      },
      (e) => {
        if (e.code === e.PERMISSION_DENIED) setGpsState('denied');
      },
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 30_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);
  useEffect(() => {
    if (!truckId) return;
    const iv = setInterval(() => {
      let pings = buffer.current;
      buffer.current = [];
      pings = pings.filter((p) => inServiceArea(config, p)).slice(-500);
      if (!pings.length) return;
      enqueue({
        kind: 'locations',
        path: '/locations',
        body: { truck_id: truckId, pings },
        label: 'GPS positions',
        at: pings[0]!.recorded_at,
        pings: pings.length,
      });
    }, config.ping_seconds * 1000);
    return () => clearInterval(iv);
  }, [config, truckId]);

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
    truck,
    truckLabel: truck?.plate_number ?? DEMO_TRUCK,
    driverName,
    loading: (listQ.isPending && !cache) || (!!active && !detail && detailQ.isPending),
    loadError: (listQ.error ?? (trucksQ.data && !truck ? new Error(`Truck ${DEMO_TRUCK} isn't on the dispatch server`) : null)) as Error | null,
    active,
    detail,
    ended,
    stops,
    current,
    progressFor,
    localStatusAt: (id) => overrides[id]?.at ?? null,
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
