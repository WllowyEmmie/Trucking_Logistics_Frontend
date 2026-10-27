'use client';

import { useCallback, useSyncExternalStore } from 'react';

// Notifications (Needs attention) a dispatcher has read or dismissed. Kept per browser, keyed by
// the exception's key, which changes when the situation does: a truck that goes silent again after
// reporting is a new key, so it comes back unread. A read mark also lapses after a day. One store
// for the page, so the sidebar's unread count and the Notifications page agree; other console
// tabs catch up through the storage event.

const KEY = 'console-acks';
const LAPSE_MS = 24 * 60 * 60_000;

type Acks = Record<string, number>;

function read(): Acks {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Acks;
    const now = Date.now();
    return Object.fromEntries(Object.entries(raw).filter(([, at]) => now - at < LAPSE_MS));
  } catch {
    return {};
  }
}

let state: Acks | null = null;
const EMPTY: Acks = {};
const listeners = new Set<() => void>();
const current = () => (state ??= read());

function set(next: Acks) {
  state = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage blocked: read marks last until reload.
  }
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      state = read();
      l();
    }
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(l);
    window.removeEventListener('storage', onStorage);
  };
}

export function useAcks() {
  const acks = useSyncExternalStore(subscribe, current, () => EMPTY);
  const ack = useCallback((key: string) => set({ ...current(), [key]: Date.now() }), []);
  const ackAll = useCallback((keys: string[]) => {
    const t = Date.now();
    set({ ...current(), ...Object.fromEntries(keys.map((k) => [k, t])) });
  }, []);
  const restore = useCallback((key: string) => {
    const { [key]: _gone, ...rest } = current();
    set(rest);
  }, []);
  return { has: (key: string) => key in acks, ack, ackAll, restore };
}
