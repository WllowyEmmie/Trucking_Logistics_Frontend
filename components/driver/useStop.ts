'use client';

import { useParams } from 'next/navigation';
import { useRef } from 'react';
import type { DeliveryListItem } from '@/lib/types';
import { useDriver, type DriverStop } from './DriverProvider';

/**
 * The stop named by the route's [n], from the active delivery. When the delivery ends from this
 * screen (completed or failed), it keeps the last stop it had, so the page can show what happened.
 */
export function useStop() {
  const ctx = useDriver();
  const { n } = useParams<{ n: string }>();
  const seq = Number(n);
  const { active, stops, current } = ctx;
  const last = useRef<{ delivery: DeliveryListItem; stop: DriverStop; total: number } | null>(null);

  if (active) {
    const i = stops.findIndex((s) => s.seq === seq);
    const stop = stops[i] ?? null;
    if (stop) last.current = { delivery: active, stop, total: stops.length };
    return { ...ctx, delivery: active, stop, index: i, isCurrent: i === current, total: stops.length };
  }
  const kept = last.current;
  return {
    ...ctx,
    delivery: kept ? { ...kept.delivery, status: ctx.ended?.id === kept.delivery.id ? ctx.ended.status : kept.delivery.status } : null,
    stop: kept?.stop ?? null,
    index: kept ? kept.total - 1 : -1,
    isCurrent: false,
    total: kept?.total ?? 0,
  };
}

export const kindLabel = (k: DriverStop['kind']) => (k === 'pickup' ? 'Pickup' : 'Drop-off');
