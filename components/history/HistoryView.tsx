'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { ChevronDown, Download, Search, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { AccountMenu } from '@/components/auth/AccountMenu';
import { DispatchNav } from '@/components/console/DispatchNav';
import { btnSecondary, chipCls, inputCls } from '@/components/console/ui';
import { ProofView } from '@/components/console/ProofView';
import { StatusPill } from '@/components/StatusPill';
import { api } from '@/lib/api';
import { useConfig } from '@/lib/config';
import { eventText, useDeliveryDetail } from '@/lib/deliveries';
import { formatWhen } from '@/lib/format';
import { dayStartIso, historyCsv, HISTORY_OUTCOMES, journey, nextDay, PERIODS, zonedDay, type Period } from '@/lib/history';
import type { HistoryItem, HistoryOutcome, HistoryPage } from '@/lib/types';

const COLS = 'minmax(0,1.25fr) minmax(0,2fr) minmax(96px,.8fr) minmax(70px,.6fr) 44px';

/** Finished deliveries, newest first: what happened to each, with its full timeline on demand. */
export function HistoryView() {
  const config = useConfig();
  const tz = config.timezone;
  const [outcome, setOutcome] = useState<HistoryOutcome>('');
  const [period, setPeriod] = useState<Period>('7d');
  const [from, setFrom] = useState(() => zonedDay(tz, 6));
  const [to, setTo] = useState(() => zonedDay(tz, 0));
  const [typed, setTyped] = useState('');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  // Search as you type, without a request per key.
  useEffect(() => {
    const t = setTimeout(() => setQ(typed.trim()), 300);
    return () => clearTimeout(t);
  }, [typed]);

  // The window, in the operator's days.
  const range = useMemo(() => {
    const today = zonedDay(tz, 0);
    switch (period) {
      case 'today':
        return { from: dayStartIso(today, tz), to: null };
      case '7d':
        return { from: dayStartIso(zonedDay(tz, 6), tz), to: null };
      case '30d':
        return { from: dayStartIso(zonedDay(tz, 29), tz), to: null };
      case 'custom':
        return { from: from ? dayStartIso(from, tz) : null, to: to ? dayStartIso(nextDay(to), tz) : null };
      default:
        return { from: null, to: null };
    }
  }, [period, from, to, tz]);

  const query = useInfiniteQuery({
    queryKey: ['history', outcome, q, range.from, range.to],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => {
      const p = new URLSearchParams({ limit: '50' });
      if (outcome) p.set('outcome', outcome);
      if (q) p.set('q', q);
      if (range.from) p.set('from', range.from);
      if (range.to) p.set('to', range.to);
      if (pageParam) p.set('before', pageParam);
      return api<HistoryPage>(`/deliveries/history?${p}`);
    },
    getNextPageParam: (last) => last.next,
  });
  const rows = query.data?.pages.flatMap((p) => p.items) ?? [];
  const when = (iso: string) => formatWhen(iso, tz, config.locale);

  function download() {
    const csv = historyCsv(rows, when);
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `deliveries-${outcome || 'all'}-${zonedDay(tz, 0)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex min-h-dvh flex-col bg-surface-200 text-ink">
      <header className="sticky top-0 z-[5] flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-border bg-surface-100 px-6 py-3">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <div className="flex flex-col">
            <span className="t-label text-ink-muted">{config.operator_name} · Dispatch</span>
            <h1 className="t-h1 m-0">History</h1>
          </div>
          <DispatchNav current="/console/history" />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span aria-hidden="true" className="h-6 border-s border-divider" />
          <AccountMenu />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[1180px] flex-col gap-4 px-4 py-6 sm:px-6">
        <p className="t-body-sm m-0 text-ink-muted">
          Every delivery that was completed, cancelled or failed. The console keeps finished ones for{' '}
          {config.board_hours === 1 ? 'an hour' : `${config.board_hours} hours`}; they&apos;re all here.
        </p>

        {/* Filters */}
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface-100 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[220px] flex-1">
              <Search size={16} aria-hidden="true" className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-ink-muted" />
              <input
                type="search"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder="Reference or customer"
                aria-label="Search by reference or customer"
                className={`${inputCls()} w-full ps-9 pe-9`}
              />
              {typed && (
                <button type="button" aria-label="Clear search" onClick={() => setTyped('')} className="absolute end-1.5 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-ink-muted hover:bg-surface-200">
                  <X size={16} aria-hidden="true" />
                </button>
              )}
            </div>
            <select aria-label="Period" value={period} onChange={(e) => setPeriod(e.target.value as Period)} className="min-h-11 rounded-md border border-border bg-surface-100 py-2 ps-3.5 text-[14px] text-ink">
              {PERIODS.map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
            {period === 'custom' && (
              <span className="flex flex-wrap items-center gap-2">
                <input type="date" aria-label="From" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className={inputCls()} />
                <span className="t-body-sm text-ink-muted">to</span>
                <input type="date" aria-label="To" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className={inputCls()} />
              </span>
            )}
            <button type="button" onClick={download} disabled={!rows.length} className={`${btnSecondary} inline-flex items-center gap-1.5`}>
              <Download size={15} aria-hidden="true" />
              CSV
            </button>
          </div>
          <div role="radiogroup" aria-label="Outcome" className="flex flex-wrap gap-1.5">
            {HISTORY_OUTCOMES.map(([k, label]) => (
              <button key={k || 'all'} type="button" role="radio" aria-checked={outcome === k} onClick={() => setOutcome(k)} className={chipCls(outcome === k)}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="overflow-hidden rounded-lg border border-border bg-surface-100">
          <div className="t-label hidden gap-3 border-b border-divider px-4 py-2.5 text-ink-muted md:grid" style={{ gridTemplateColumns: COLS }}>
            <span>Delivery</span>
            <span>What happened</span>
            <span>Finished</span>
            <span>Truck</span>
            <span />
          </div>

          {query.isPending && <p className="t-body m-0 px-4 py-8 text-center text-ink-muted">Loading…</p>}
          {query.isError && (
            <div role="alert" className="flex flex-col items-center gap-2 px-4 py-8">
              <span className="t-body font-semibold">Couldn&apos;t load history</span>
              <button type="button" onClick={() => void query.refetch()} className={btnSecondary}>
                Try again
              </button>
            </div>
          )}
          {query.isSuccess && rows.length === 0 && (
            <p className="t-body m-0 px-4 py-8 text-center text-ink-muted">Nothing finished matches these filters.</p>
          )}

          <ul className="m-0 list-none p-0">
            {rows.map((h) => (
              <HistoryRow key={h.id} h={h} when={when} open={open === h.id} onToggle={() => setOpen(open === h.id ? null : h.id)} />
            ))}
          </ul>

          {query.hasNextPage && (
            <div className="border-t border-divider p-3 text-center">
              <button type="button" disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()} className={btnSecondary}>
                {query.isFetchingNextPage ? 'Loading…' : 'Load more'}
              </button>
            </div>
          )}
        </div>
        {rows.length > 0 && (
          <span className="t-body-sm text-ink-muted">
            Showing {rows.length}
            {query.hasNextPage ? ', more below' : ''}.
          </span>
        )}
      </main>
    </div>
  );
}

function HistoryRow({ h, when, open, onToggle }: { h: HistoryItem; when: (iso: string) => string; open: boolean; onToggle: () => void }) {
  const story = journey(h);
  const troubled = h.failures > 0 || h.late;
  return (
    <li className="border-b border-divider last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="grid w-full items-center gap-x-3 gap-y-1 border-0 bg-transparent px-4 py-3 text-start text-ink hover:bg-surface-200 md:grid-cols-[var(--cols)]"
        style={{ ['--cols' as string]: COLS }}
      >
        <span className="flex min-w-0 flex-col">
          <span className="t-mono font-semibold">{h.reference}</span>
          <span className="t-body-sm wrap-anywhere text-ink-muted">{h.customer_name}</span>
        </span>
        <span className="flex min-w-0 flex-col items-start gap-1">
          <StatusPill status={h.status} size="sm" />
          <span className={`t-body-sm ${troubled ? 'font-semibold' : 'text-ink-muted'}`}>{story}</span>
        </span>
        <span className="t-body-sm">{when(h.finished_at)}</span>
        <span className="t-mono text-[13px]">{h.plate ?? '—'}</span>
        <ChevronDown size={18} aria-hidden="true" className="justify-self-end" style={{ transform: open ? 'rotate(180deg)' : 'none' }} />
      </button>
      {open && <HistoryDetail id={h.id} h={h} when={when} />}
    </li>
  );
}

function HistoryDetail({ id, h, when }: { id: string; h: HistoryItem; when: (iso: string) => string }) {
  const config = useConfig();
  const detail = useDeliveryDetail(id, false);
  const d = detail.data;
  return (
    <div className="flex flex-col gap-3 bg-surface-200 px-4 py-3">
      <dl className="t-body-sm m-0 grid gap-x-4 gap-y-1" style={{ gridTemplateColumns: 'auto minmax(0,1fr)' }}>
        <dt className="text-ink-muted">Booked</dt>
        <dd className="m-0">{when(h.created_at)}</dd>
        {h.due_by && (
          <>
            <dt className="text-ink-muted">Due by</dt>
            <dd className="m-0">
              {when(h.due_by)}
              {h.late ? ' · delivered late' : h.status === 'completed' ? ' · on time' : ''}
            </dd>
          </>
        )}
        {d?.delivery.goods_desc && (
          <>
            <dt className="text-ink-muted">Goods</dt>
            <dd className="m-0 wrap-anywhere">{d.delivery.goods_desc}</dd>
          </>
        )}
      </dl>
      {d && (
        <ol className="m-0 flex list-none flex-col gap-2 p-0">
          {d.stops.map((s) => (
            <li key={s.id} className="flex flex-col">
              <span className="t-body-sm">
                <b>
                  {s.sequence}. {s.stop_type === 'pickup' ? 'Pickup' : 'Drop-off'}
                </b>{' '}
                {s.address}
              </span>
              <ProofView deliveryId={d.delivery.id} stop={s} config={config} />
            </li>
          ))}
        </ol>
      )}
      {detail.isPending && <span className="t-body-sm text-ink-muted">Loading the timeline…</span>}
      {d && (
        <ol className="m-0 flex list-none flex-col p-0">
          {d.events.map((e) => (
            <li key={e.id} className="grid gap-3 border-b border-divider py-1.5 last:border-b-0" style={{ gridTemplateColumns: 'minmax(110px,auto) minmax(0,1fr)' }}>
              <span className="t-mono text-[12px] text-ink-muted">{when(e.created_at)}</span>
              <span className="t-body-sm">{eventText(e, d.stops)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
