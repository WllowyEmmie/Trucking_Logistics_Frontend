'use client';

import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect, useSyncExternalStore } from 'react';
import { API_URL, api } from './api';
import type { Truck, TruckStatus } from './types';

export const TRUCKS_KEY = ['trucks'] as const;

/**
 * The position socket (GET /ws on the Go API). Same origin by default, through the /api rewrite like
 * every other call; NEXT_PUBLIC_WS_URL points it elsewhere (the API accepts localhost:3000/3471 only).
 */
export function positionsSocketUrl(): string {
  const env = process.env.NEXT_PUBLIC_WS_URL;
  if (env) return env;
  const url = new URL(`${API_URL}/ws`, window.location.href);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
}

/** Frames as `internal/api/hub.go` sends them. */
interface WsTruck {
  id: string;
  lng: number | null;
  lat: number | null;
  last_seen_at: string | null;
  /** Set on snapshot only (omitempty): ingestLocations doesn't look the status up. */
  status?: TruckStatus;
}
export type WsMessage = { type: 'snapshot'; trucks: WsTruck[] } | { type: 'position'; truck: WsTruck };

type Fix = Pick<Truck, 'lat' | 'lng' | 'last_seen_at'>;

// ---- One socket per tab, shared by every usePositions() caller ----

/** The newest fix seen per truck, so a slower GET /trucks can't move a truck back. */
const fixes = new Map<string, Fix>();
let socket: WebSocket | null = null;
let users = 0;
let live = false;
let retry: ReturnType<typeof setTimeout> | null = null;
let backoff = 1_000;
const listeners = new Set<() => void>();

function setLive(v: boolean) {
  if (live === v) return;
  live = v;
  listeners.forEach((l) => l());
}
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};

const isNewer = (a: string | null, b: string | null) => !!a && (!b || Date.parse(a) > Date.parse(b));

/**
 * Keeps a fix only if it's newer. The API only pushes fixes that moved the truck, but a snapshot after
 * a reconnect and a slow GET /trucks can still arrive out of order.
 */
function remember({ id, lat, lng, last_seen_at }: WsTruck) {
  if (isNewer(last_seen_at, fixes.get(id)?.last_seen_at ?? null)) fixes.set(id, { lat, lng, last_seen_at });
}

/** A truck with the newest known fix laid over it. */
function withFix(t: Truck): Truck {
  const f = fixes.get(t.id);
  return f && isNewer(f.last_seen_at, t.last_seen_at) ? { ...t, ...f } : t;
}

function onMessage(qc: QueryClient, raw: unknown) {
  let m: WsMessage;
  try {
    m = JSON.parse(String(raw)) as WsMessage;
  } catch {
    return;
  }
  if (m.type === 'snapshot') {
    m.trucks.forEach(remember);
    const status = new Map(m.trucks.map((t) => [t.id, t.status]));
    const cur = qc.getQueryData<Truck[]>(TRUCKS_KEY);
    qc.setQueryData<Truck[]>(TRUCKS_KEY, (ts) => ts?.map((t) => withFix({ ...t, status: status.get(t.id) || t.status })));
    // A truck the list hasn't got (added elsewhere): only GET /trucks has its plate and model.
    if (cur && m.trucks.some((t) => !cur.some((x) => x.id === t.id))) void qc.invalidateQueries({ queryKey: TRUCKS_KEY });
  } else if (m.type === 'position') {
    remember(m.truck);
    qc.setQueryData<Truck[]>(TRUCKS_KEY, (ts) => ts?.map((t) => (t.id === m.truck.id ? withFix(t) : t)));
  }
}

function connect(qc: QueryClient) {
  if (socket || users === 0) return;
  let ws: WebSocket;
  try {
    ws = new WebSocket(positionsSocketUrl());
  } catch {
    return schedule(qc);
  }
  socket = ws;
  ws.onopen = () => {
    backoff = 1_000;
    setLive(true);
  };
  ws.onmessage = (e) => onMessage(qc, e.data);
  ws.onclose = () => {
    if (socket !== ws) return; // closed by release()
    socket = null;
    setLive(false);
    schedule(qc);
  };
}

function schedule(qc: QueryClient) {
  if (retry || users === 0) return;
  retry = setTimeout(() => {
    retry = null;
    connect(qc);
  }, backoff);
  backoff = Math.min(backoff * 2, 30_000);
}

function release() {
  if (--users > 0) return;
  if (retry) clearTimeout(retry);
  retry = null;
  const ws = socket;
  socket = null;
  ws?.close();
  setLive(false);
}

/**
 * The ONLY place that knows how truck positions arrive.
 *
 * Positions come over the socket. GET /trucks gives everything else (plate, model, driver, status)
 * and is refetched every 30 s while the socket is up, because the API doesn't push status changes.
 * With the socket down it polls every 10 s instead, and reconnects with backoff (1 s up to 30 s).
 */
export function usePositions() {
  const qc = useQueryClient();
  const isLive = usePositionsLive();

  useEffect(() => {
    users++;
    connect(qc);
    return release;
  }, [qc]);

  return useQuery({
    queryKey: TRUCKS_KEY,
    queryFn: async () => (await api<Truck[]>('/trucks')).map(withFix),
    refetchInterval: isLive ? 30_000 : 10_000,
  });
}

/** Whether positions are arriving live over the socket rather than by polling. */
export function usePositionsLive(): boolean {
  return useSyncExternalStore(subscribe, () => live, () => false);
}
