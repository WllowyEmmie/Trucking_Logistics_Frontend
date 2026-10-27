'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { MessageSquare, Phone, Settings, Trash2, Truck as TruckIcon } from 'lucide-react';
import Link from 'next/link';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { StatusPill } from '@/components/StatusPill';
import { telHref } from '@/components/tracking/TrackingPhone';
import { api } from '@/lib/api';
import type { AppConfig } from '@/lib/config';
import { formatDuration, formatSince, formatTime } from '@/lib/format';
import { journey } from '@/lib/history';
import type { DeliveryListItem, Driver, HistoryItem, HistoryPage, Truck } from '@/lib/types';

/**
 * One truck's history: what it's doing now, then every delivery it finished, newest first, by day
 * (GET /deliveries/history?truck=<plate>, a page at a time), with totals for what's loaded.
 */

interface Props {
  truck: Truck;
  driver: Driver | undefined;
  current: DeliveryListItem | undefined;
  config: AppConfig;
  now: number;
  silent: boolean;
  busy: boolean;
  error?: string | null;
  onSettings: (e: ReactMouseEvent) => void;
  onRemove: () => void;
}

const PAGE = 40;

export function TruckHistory({ truck, driver, current, config, now, silent, busy, error, onSettings, onRemove }: Props) {
  const tz = config.timezone;
  const q = useInfiniteQuery({
    queryKey: ['history', 'truck', truck.plate_number],
    queryFn: ({ pageParam }) =>
      api<HistoryPage>(`/deliveries/history?truck=${encodeURIComponent(truck.plate_number)}&limit=${PAGE}${pageParam ? `&before=${encodeURIComponent(pageParam)}` : ''}`),
    initialPageParam: '' as string,
    getNextPageParam: (p) => p.next ?? undefined,
  });
  // The API filters by plate; checked here too, so an API from before that filter can't show other trucks' rows.
  const items: HistoryItem[] = (q.data?.pages.flatMap((p) => p.items) ?? []).filter((h) => h.plate === truck.plate_number);

  const done = items.filter((h) => h.status === 'completed');
  const late = done.filter((h) => h.late).length;
  const failed = items.filter((h) => h.status === 'failed' || h.failures > 0).length;
  const cancelled = items.filter((h) => h.status === 'cancelled').length;
  const mins = done.map((h) => (Date.parse(h.finished_at) - Date.parse(h.created_at)) / 60_000).filter((m) => m > 0);
  const avg = mins.length ? Math.round(mins.reduce((a, b) => a + b, 0) / mins.length) : null;

  // Grouped by the day it finished, in the operator's time zone.
  const dayOf = (iso: string) => new Intl.DateTimeFormat(config.locale, { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso));
  const days: { day: string; rows: HistoryItem[] }[] = [];
  for (const h of items) {
    const d = dayOf(h.finished_at);
    const last = days[days.length - 1];
    if (last?.day === d) last.rows.push(h);
    else days.push({ day: d, rows: [h] });
  }

  const stat = (n: string | number, label: string, color?: string) => (
    <div className="flex flex-col gap-1 rounded-2xl border border-divider bg-surface-100 px-4 py-3">
      <span className="text-[26px] leading-none font-light tabular-nums" style={{ color }}>
        {n}
      </span>
      <span className="text-[11.5px] text-ink-muted">{label}</span>
    </div>
  );

  return (
    <div className="flex flex-col gap-3.5">
      {/* ---- The truck, and what it's doing now ---- */}
      <div className="flex flex-wrap items-center gap-3 rounded-[20px] border border-divider bg-surface-100 p-4">
        <span className="grid h-12 w-12 flex-none place-items-center rounded-[14px] border border-border bg-surface-200 text-ink">
          <TruckIcon size={22} strokeWidth={2.2} aria-hidden="true" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col leading-tight">
          <span className="t-mono text-[20px] font-semibold">{truck.plate_number}</span>
          <span className="text-[12.5px] text-ink-muted">
            {truck.model || 'Model not given'} · position {truck.last_seen_at ? `${formatSince(truck.last_seen_at, now)} ago` : 'not yet'}
            {silent && <b className="font-medium text-attention"> · silent</b>}
          </span>
        </div>
        <StatusPill status={truck.status} />
        <button type="button" onClick={onSettings} aria-label={`Settings for ${truck.plate_number}`} title="Status and usual driver" className="grid h-10 w-10 place-items-center rounded-xl border border-border bg-surface-100 text-ink hover:border-ink-subtle">
          <Settings size={18} strokeWidth={2.2} aria-hidden="true" />
        </button>
        <button type="button" onClick={onRemove} disabled={busy} aria-label={`Remove ${truck.plate_number}`} title="Remove from the fleet" className="grid h-10 w-10 place-items-center rounded-xl border border-border bg-surface-100 hover:border-ink-subtle disabled:opacity-45" style={{ color: 'var(--attention)' }}>
          <Trash2 size={18} strokeWidth={2.2} aria-hidden="true" />
        </button>
        {error && (
          <span role="alert" className="basis-full text-[12.5px] font-medium text-attention">
            {error}
          </span>
        )}
        <div className="flex basis-full flex-wrap items-center gap-3 border-t border-divider pt-3">
          {driver ? (
            <>
              <span className="text-[13px]">
                <span className="text-ink-muted">Driver </span>
                <b className="font-semibold">{driver.name}</b>
                <span className="text-[12px]" style={{ color: driver.on_shift ? 'var(--status-completed)' : 'var(--ink-muted)' }}>
                  {' '}
                  · {driver.on_shift ? 'on shift' : 'off shift'}
                </span>
              </span>
              <Link href={`/console/messages?driver=${driver.id}`} aria-label={`Message ${driver.name}`} className="grid h-8 w-8 place-items-center rounded-lg bg-brand no-underline" style={{ color: 'var(--brand-ink)' }}>
                <MessageSquare size={15} strokeWidth={2.4} aria-hidden="true" />
              </Link>
              <a href={telHref(driver.phone)} aria-label={`Call ${driver.name}`} className="grid h-8 w-8 place-items-center rounded-lg border border-border no-underline hover:border-ink-subtle" style={{ color: 'var(--ink)' }}>
                <Phone size={15} strokeWidth={2.4} aria-hidden="true" />
              </a>
            </>
          ) : (
            <button type="button" onClick={onSettings} className="h-8 rounded-lg border-0 bg-brand px-3 text-[12px] font-semibold text-brand-ink" style={{ minHeight: 32 }}>
              Give it a driver
            </button>
          )}
          <span className="ms-auto">
            {current ? (
              <Link href={`/console?d=${current.id}`} className="flex items-center gap-2 rounded-xl border border-divider px-3 py-1.5 text-[12.5px] no-underline hover:border-ink-subtle" style={{ color: 'var(--ink)' }}>
                <span className="text-ink-muted">Now</span>
                <span className="t-mono font-medium whitespace-nowrap">{current.reference}</span>
                <span className="truncate">{current.customer_name}</span>
                <StatusPill status={current.status} size="sm" />
              </Link>
            ) : (
              <span className="text-[12.5px] text-ink-muted">No delivery now</span>
            )}
          </span>
        </div>
      </div>

      {/* ---- Totals for what's loaded ---- */}
      <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))' }}>
        {stat(done.length, 'Completed', 'var(--status-completed)')}
        {stat(late, 'Completed late', late ? 'var(--status-assigned)' : undefined)}
        {stat(failed, 'Failed on the way', failed ? 'var(--status-failed)' : undefined)}
        {stat(cancelled, 'Cancelled')}
        {stat(avg !== null ? formatDuration(avg) : '—', 'Average, booked to delivered')}
      </div>

      {/* ---- The history ---- */}
      <div className="flex flex-col overflow-hidden rounded-[20px] border border-divider bg-surface-100">
        <div className="flex items-center justify-between gap-2 border-b border-divider px-4 py-3.5">
          <span className="text-[14px] font-semibold">Delivery history</span>
          <span className="text-[12px] text-ink-muted">
            {items.length}
            {q.hasNextPage ? '+' : ''} finished
          </span>
        </div>
        {q.isPending && <div className="p-4 text-[13px] text-ink-muted">Loading…</div>}
        {q.isError && <div className="p-4 text-[13px] text-attention">Couldn&apos;t load the history: {q.error.message}</div>}
        {!q.isPending && !q.isError && items.length === 0 && <div className="p-4 text-[13px] text-ink-muted">This truck hasn&apos;t finished a delivery yet.</div>}
        {days.map(({ day, rows }) => (
          <div key={day} className="flex flex-col">
            <div className="sticky top-0 z-[1] border-b border-divider bg-surface-200 px-4 py-1.5 text-[11.5px] font-medium text-ink-muted">{day}</div>
            {rows.map((h) => (
              <Link
                key={h.id}
                href={`/console/history?q=${encodeURIComponent(h.reference)}`}
                className="grid grid-cols-[64px_minmax(120px,auto)_minmax(0,1fr)_auto] items-center gap-3 border-b border-divider px-4 py-2.5 text-[12.5px] no-underline last:border-b-0 hover:bg-surface-200"
                style={{ color: 'var(--ink)' }}
              >
                <span className="text-ink-muted tabular-nums">{formatTime(h.finished_at, tz, config.locale)}</span>
                <span className="t-mono font-medium whitespace-nowrap">{h.reference}</span>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate">{h.customer_name}</span>
                  <span className="truncate text-[11.5px] text-ink-muted">{journey(h)}</span>
                </span>
                <span className="flex items-center gap-1.5">
                  {h.late && <span className="rounded-md bg-status-assigned-bg px-1.5 py-0.5 text-[11px] font-medium text-status-assigned">Late</span>}
                  <StatusPill status={h.status} size="sm" />
                </span>
              </Link>
            ))}
          </div>
        ))}
        {q.hasNextPage && (
          <button type="button" onClick={() => void q.fetchNextPage()} disabled={q.isFetchingNextPage} className="m-3 h-10 rounded-xl border border-border bg-surface-100 text-[13px] font-medium text-ink hover:border-ink-subtle disabled:opacity-45">
            {q.isFetchingNextPage ? 'Loading…' : 'Show older'}
          </button>
        )}
      </div>
    </div>
  );
}
