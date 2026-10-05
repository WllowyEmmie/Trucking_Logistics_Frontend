'use client';

import { useParams } from 'next/navigation';
import { useDriver, type DriverStop } from './DriverProvider';

/**
 * The stop named by the route's [n], from the active delivery. After the delivery ends (completed
 * or failed from this screen), it falls back to the ended delivery so the page can show what happened.
 */
export function useStop() {
  const ctx = useDriver();
  const { n } = useParams<{ n: string }>();
  const seq = Number(n);
  const { active, ended, stops, current } = ctx;
  if (active) {
    const i = stops.findIndex((s) => s.seq === seq);
    return { ...ctx, delivery: active, stop: stops[i] ?? null, index: i, isCurrent: i === current, total: stops.length };
  }
  const s = ended?.stops.find((x) => x.seq === seq);
  const stop: DriverStop | null = s ? { ...s, arrivedAt: null, doneAt: s.completed_at, done: s.status === 'done', unsent: false } : null;
  return { ...ctx, delivery: ended, stop, index: -1, isCurrent: false, total: ended?.stops.length ?? 0 };
}

export const kindLabel = (k: DriverStop['kind']) => (k === 'pickup' ? 'Pickup' : 'Drop-off');

/** "Dele Harrow · yard office" → ["Dele Harrow", "yard office"]. */
export function splitContact(c: string | null): [string | null, string | null] {
  if (!c) return [null, null];
  const [name, ...rest] = c.split(' · ');
  return [name ?? null, rest.join(' · ') || null];
}
