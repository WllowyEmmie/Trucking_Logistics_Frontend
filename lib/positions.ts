'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import type { Truck } from './types';

export const TRUCKS_KEY = ['trucks'] as const;

/**
 * The ONLY place that knows how truck positions arrive. Polls GET /trucks every 10 s.
 * TODO(ws): swap to a position socket; nothing else changes.
 */
export function usePositions() {
  return useQuery({
    queryKey: TRUCKS_KEY,
    queryFn: () => api<Truck[]>('/trucks'),
    refetchInterval: 10_000,
  });
}
