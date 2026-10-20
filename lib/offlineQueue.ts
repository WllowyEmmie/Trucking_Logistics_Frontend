'use client';

// Driver offline queue. Every state-changing action is written to IndexedDB first, then sent.
// Flushes strictly in order: on enqueue, on `online`, and when the app opens.
// A 4xx (including 409) drops the item and keeps its message to show; a 5xx, a 401/408/429 or a
// network error keeps it at the head of the queue and stops the flush. A 401 is a lapsed sign-in:
// the driver signs in again and the queue carries on from where it was.

import { ApiError, post } from './api';

export type QueueKind = 'start' | 'complete' | 'fail' | 'locations' | 'stop' | 'shift' | 'proof';

export interface QueueItem {
  id?: number;
  kind: QueueKind;
  /** POST target. Null for a purely local item (none at present; kept so old queued items still drain). */
  path: string | null;
  body?: unknown;
  /** What the driver did, e.g. "Arrived at stop 2". */
  label: string;
  /** When it happened, not when it sends. */
  at: string;
  deliveryId?: string;
  stopSeq?: number;
  /** For stop events: which step, so a refused one can be rolled back. */
  stopAction?: 'arrived' | 'done';
  /** For location batches: how many pings. */
  pings?: number;
}

export interface DroppedItem {
  item: QueueItem;
  /** Shown word for word, e.g. "Arrived at stop 2: 409 · stop is already arrived". */
  message: string;
}

export interface QueueSnapshot {
  items: QueueItem[];
  /** The last send attempt failed for lack of a connection. */
  networkDown: boolean;
  /** Items the server refused (4xx), with the message to show, newest last. */
  dropped: DroppedItem[];
  /** Bumps each time an item leaves the queue, so readers can refetch. */
  sentCount: number;
  lastSent: QueueItem | null;
  lastLocationSentAt: number | null;
}

const DB = 'dispatch-driver';
const STORE = 'queue';

let dbp: Promise<IDBDatabase | null> | null = null;
function db(): Promise<IDBDatabase | null> {
  if (dbp) return dbp;
  dbp = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') return resolve(null);
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
    req.onsuccess = () => resolve(req.result);
    // Private mode or blocked storage: fall back to memory only.
    req.onerror = () => resolve(null);
  });
  return dbp;
}

function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  return db().then(
    (d) =>
      new Promise<T | null>((resolve) => {
        if (!d) return resolve(null);
        try {
          const req = fn(d.transaction(STORE, mode).objectStore(STORE));
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => resolve(null);
        } catch {
          resolve(null);
        }
      }),
  );
}

let memId = 1;
let snap: QueueSnapshot = { items: [], networkDown: false, dropped: [], sentCount: 0, lastSent: null, lastLocationSentAt: null };
const listeners = new Set<() => void>();
const set = (p: Partial<QueueSnapshot>) => {
  snap = { ...snap, ...p };
  listeners.forEach((l) => l());
};

let loaded: Promise<void> | null = null;
let flushing = false;

function load(): Promise<void> {
  loaded ??= tx<QueueItem[]>('readonly', (s) => s.getAll() as IDBRequest<QueueItem[]>).then((rows) => {
    const items = (rows ?? []).sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
    memId = Math.max(memId, ...items.map((x) => (x.id ?? 0) + 1));
    set({ items: [...items, ...snap.items] });
  });
  return loaded;
}

async function flush(): Promise<void> {
  await load();
  if (flushing) return;
  flushing = true;
  try {
    while (snap.items.length) {
      const it = snap.items[0]!;
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        set({ networkDown: true });
        return;
      }
      let dropped: DroppedItem | null = null;
      if (it.path) {
        try {
          await post(it.path, it.body);
        } catch (e) {
          const status = e instanceof ApiError ? e.status : 0;
          // 401, 408 and 429 mean "try again later", not "refused": dropping them would lose a step.
          if (status >= 400 && status < 500 && status !== 401 && status !== 408 && status !== 429) {
            dropped = { item: it, message: `${it.label}: ${(e as Error).message}` };
          } else {
            set({ networkDown: status === 0 });
            return;
          }
        }
      }
      // An item with no path is local only: it leaves the queue once there's a connection.
      if (it.id != null) await tx('readwrite', (s) => s.delete(it.id!));
      set({
        items: snap.items.slice(1),
        networkDown: false,
        dropped: dropped ? [...snap.dropped, dropped] : snap.dropped,
        sentCount: snap.sentCount + 1,
        lastSent: it,
        lastLocationSentAt: it.kind === 'locations' && !dropped ? Date.now() : snap.lastLocationSentAt,
      });
    }
  } finally {
    flushing = false;
  }
}

export const offlineQueue = {
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  getSnapshot: () => snap,

  /** Load what a previous session left behind and try to send it. */
  open(): Promise<void> {
    return flush();
  },

  async enqueue(item: QueueItem): Promise<void> {
    await load();
    const id = (await tx<IDBValidKey>('readwrite', (s) => s.add({ ...item }))) as number | null;
    set({ items: [...snap.items, { ...item, id: id ?? memId++ }] });
    void flush();
  },

  flush,

  clearDropped() {
    set({ dropped: [] });
  },
};

/** One line per action, plus one aggregated line for GPS batches: what the queue card lists. */
export function queueLines(items: QueueItem[], time: (iso: string) => string): string[] {
  const out: string[] = [];
  let gps = 0;
  let gpsFrom: string | null = null;
  for (const it of items) {
    if (it.kind === 'locations') {
      gps += it.pings ?? 0;
      gpsFrom ??= it.at;
    } else out.push(`${it.label} — ${time(it.at)}`);
  }
  if (gps && gpsFrom) out.push(`${gps} GPS position${gps === 1 ? '' : 's'} since ${time(gpsFrom)}`);
  return out;
}
