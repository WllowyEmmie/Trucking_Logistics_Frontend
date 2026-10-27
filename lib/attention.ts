'use client';

import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { api } from './api';
import { useConfig } from './config';
import { endedAt, failReasonOf, useDeliveries, useDeliveryDetails, useDrivers } from './deliveries';
import { deriveExceptions, type FailedInfo } from './exceptions';
import { usePositions } from './positions';
import type { Proposal } from './types';
import { useNow } from './useNow';

export const PROPOSALS_KEY = ['proposals'] as const;
export const fetchProposals = () => api<Proposal[]>('/proposals');

/** Failed deliveries older than this can't be in the exception window; their detail isn't fetched. */
const FAILED_LOOKBACK_MS = 48 * 60 * 60_000;

/**
 * Everything that needs a dispatcher's attention (lib/exceptions.ts), from the same queries the
 * console uses (react-query shares them, so nothing is fetched twice). The sidebar's
 * Notifications count and the Notifications page both read this.
 */
export function useAttention() {
  const config = useConfig();
  const now = useNow(10_000);
  const deliveries = useDeliveries().data ?? [];
  const trucks = usePositions().data ?? [];
  const drivers = useDrivers().data ?? [];
  const proposalsQ = useQuery({ queryKey: PROPOSALS_KEY, queryFn: fetchProposals, refetchInterval: 30_000, enabled: config.agent_enabled });
  const names = useMemo(() => new Map(drivers.map((d) => [d.id, d.name])), [drivers]);
  const driverName = (id: string | null) => (id ? (names.get(id) ?? null) : null);

  const failedIds = useMemo(
    () => deliveries.filter((d) => d.status === 'failed' && now - Date.parse(d.created_at) < FAILED_LOOKBACK_MS).map((d) => d.id),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [deliveries],
  );
  const failedQs = useDeliveryDetails(failedIds);
  const failed: FailedInfo = {};
  failedQs.forEach((q, i) => {
    const at = q.data ? endedAt(q.data.events) : null;
    if (at) failed[failedIds[i]!] = { at, reason: failReasonOf(q.data!.events) };
  });
  const proposals = config.agent_enabled ? (proposalsQ.data ?? []) : [];
  const flags = proposals.filter((p) => p.kind === 'flag');
  const rows = deriveExceptions(deliveries, trucks, driverName, failed, flags, config, now);
  return { rows, failed, proposals, proposalsQ, deliveries, trucks, now };
}
