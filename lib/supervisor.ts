// Auto mode: what the agent did on its own (GET /supervisor/actions), newest first.

import { useQuery } from '@tanstack/react-query';
import { api } from './api';

export const SUPERVISOR_KEY = ['supervisor'] as const;

export interface SupervisorAction {
  id: string;
  /** pair: gave a driver a truck. assign: gave a delivery a truck. */
  kind: 'pair' | 'assign';
  driver_id: string | null;
  truck_id: string | null;
  delivery_id: string | null;
  /** "Assigned DLV-0142 to KF-03 (Musa)" */
  summary: string;
  reason: string;
  /** model: the AI chose. rule: the nearest-truck rule did (no real choice, or the AI was unavailable). */
  decided_by: 'model' | 'rule';
  created_at: string;
}

export function useSupervisorActions(enabled: boolean) {
  return useQuery({
    queryKey: SUPERVISOR_KEY,
    queryFn: () => api<SupervisorAction[]>('/supervisor/actions?limit=30'),
    enabled,
    // The socket's "supervisor" topic refreshes it as it happens; this is the fallback.
    refetchInterval: 60_000,
  });
}
