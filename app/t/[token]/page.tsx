'use client';

import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { useMemo } from 'react';
import { AskDelivery } from '@/components/tracking/AskDelivery';
import { TrackingDesktop } from '@/components/tracking/TrackingDesktop';
import { TrackingPhone } from '@/components/tracking/TrackingPhone';
import { buildTrackingView, NOT_FOUND_VIEW } from '@/components/tracking/view';
import { api, isNotFound } from '@/lib/api';
import { useConfig } from '@/lib/config';
import { viewerTimeZone } from '@/lib/format';
import type { TrackResponse } from '@/lib/types';
import { useMediaQuery } from '@/lib/useMediaQuery';
import { useNow } from '@/lib/useNow';

const ENDED = new Set(['completed', 'failed', 'cancelled']);

// Public, no login. Shows one delivery to whoever has the link, and nothing else.
export default function TrackingPage() {
  const { token } = useParams<{ token: string }>();
  const config = useConfig();
  const desktop = useMediaQuery('(min-width: 900px)');
  const now = useNow(15_000);
  const q = useQuery({
    queryKey: ['track', token],
    queryFn: () => api<TrackResponse>(`/track/${encodeURIComponent(token)}`),
    // Keeps updating in a tab left open for hours while it's visible; ended deliveries stop.
    refetchInterval: (query) => (query.state.data && ENDED.has(query.state.data.status) ? false : 30_000),
    refetchOnWindowFocus: true,
    retry: (n, e) => !isNotFound(e) && n < 2,
  });

  const view = useMemo(() => {
    if (isNotFound(q.error)) return NOT_FOUND_VIEW;
    if (!q.data) return null;
    return buildTrackingView(q.data, {
      now,
      viewerTz: viewerTimeZone(),
      staleMinutes: config.stale_minutes,
      checkedAt: q.dataUpdatedAt,
      units: config.units,
      operator: config.operator_name,
      phone: config.support_phone || null,
      operatorTz: config.timezone,
    });
  }, [q.data, q.error, q.dataUpdatedAt, now, config]);

  if (!view) {
    if (q.isError) {
      return (
        <main className="flex min-h-dvh flex-col items-start gap-3 bg-surface-100 p-6">
          <h1 className="t-h1 m-0">Couldn&apos;t load this delivery</h1>
          <p className="t-body m-0 text-ink-muted">{q.error.message}</p>
          <button
            type="button"
            onClick={() => q.refetch()}
            className="rounded-md border border-border bg-surface-100 px-4 font-semibold text-ink"
          >
            Try again
          </button>
        </main>
      );
    }
    // No spinner: a plain surface until the first answer.
    return <div className="min-h-dvh bg-surface-100" aria-busy="true" />;
  }

  const fitKey = `${token}:${view.state}`;
  // Questions about this delivery, answered by the agent from this link's tracking data only.
  const ask =
    config.agent_enabled && view.state !== 'not_found' ? (
      <AskDelivery token={token} operator={config.operator_name} phone={config.support_phone || null} desktop={desktop} />
    ) : null;
  return desktop ? (
    <TrackingDesktop v={view} fitKey={fitKey} seconds={config.ping_seconds} ask={ask} />
  ) : (
    <TrackingPhone v={view} fitKey={fitKey} seconds={config.ping_seconds} ask={ask} />
  );
}
