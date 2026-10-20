'use client';

import { useCallback, useEffect, useState } from 'react';

// Exceptions a dispatcher has looked at and dismissed from Needs attention. Kept per browser, keyed
// by the exception's key, which changes when the situation does: a truck that goes silent again
// after reporting is a new key, so it comes back. A dismissal also lapses after a day.

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

function write(a: Acks) {
  try {
    localStorage.setItem(KEY, JSON.stringify(a));
  } catch {
    // Storage blocked: dismissals last until reload.
  }
}

export function useAcks() {
  const [acks, setAcks] = useState<Acks>(read);
  // Another console tab dismissed or restored something.
  useEffect(() => {
    const on = (e: StorageEvent) => {
      if (e.key === KEY) setAcks(read());
    };
    window.addEventListener('storage', on);
    return () => window.removeEventListener('storage', on);
  }, []);

  const update = useCallback((fn: (a: Acks) => Acks) => {
    setAcks((a) => {
      const next = fn(a);
      write(next);
      return next;
    });
  }, []);

  return {
    has: (key: string) => key in acks,
    ack: (key: string) => update((a) => ({ ...a, [key]: Date.now() })),
    restore: (key: string) => update(({ [key]: _gone, ...rest }) => rest),
  };
}
