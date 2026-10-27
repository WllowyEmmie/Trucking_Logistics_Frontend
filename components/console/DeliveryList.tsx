'use client';

import Link from 'next/link';

import { Plus, Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { AppConfig } from '@/lib/config';
import { hasLatLng } from '@/lib/deliveries';
import { hasPosition, isActive, isStale, type FailedInfo } from '@/lib/exceptions';
import { formatDuration, formatTime, haversineKm, minutesSince } from '@/lib/format';
import { failReasonLabel } from '@/lib/labels';
import type { CreateDeliveryResponse, DeliveryDetailResponse, DeliveryListItem, DeliveryStatus, Truck } from '@/lib/types';
import type { Candidate } from './AssignPanel';
import { DeliveryRow, type RowError } from './DeliveryRow';
import { dueLine } from '@/lib/due';
import type { ReopenMode } from '@/lib/reopen';
import { NewDeliveryForm } from './NewDeliveryForm';
import { btnPrimary, btnSecondary } from './ui';

/** Trucks offered in the assign panel: room for every available truck in a small fleet. */
const MAX_CANDIDATES = 8;

export type DeliveryFilter = 'all' | 'active' | 'attention' | DeliveryStatus;

// Every list filter lives here, above the list it changes. The header counts only show numbers.
const CHIPS: [DeliveryFilter, string][] = [
  ['all', 'All'],
  ['pending', 'Pending'],
  ['assigned', 'Assigned'],
  ['in_transit', 'In transit'],
  ['failed', 'Failed'],
  ['completed', 'Completed'],
  ['cancelled', 'Cancelled'],
];
/** Filters with no chip of their own, reachable by URL (?f=active); shown as a removable chip. */
const HEADER_FILTERS: Partial<Record<DeliveryFilter, string>> = { active: 'Active' };

export const DELIVERY_FILTERS = new Set<DeliveryFilter>(['active', 'attention', ...CHIPS.map(([k]) => k)]);

const RANK: Record<DeliveryStatus, number> = { pending: 0, in_transit: 1, assigned: 2, failed: 3, completed: 4, cancelled: 5 };

export interface AssignError extends RowError {
  truckId: string;
  /** Set when it was a send-again (reopen) that failed. */
  mode?: ReopenMode;
}

interface Props {
  deliveries: DeliveryListItem[];
  trucks: Truck[];
  driverName: (driverId: string | null) => string | null;
  /** Stops, events and the customer link, for the selected or expanded row only. */
  detailOf: (id: string) => DeliveryDetailResponse | undefined;
  failed: FailedInfo;
  config: AppConfig;
  now: number;
  loading: boolean;
  error: Error | null;
  onRetryLoad: () => void;
  attentionIds: Set<string>;
  filter: DeliveryFilter;
  truckSel: string | null;
  sel: string | null;
  exp: string | null;
  hover: string | null;
  notes: Record<string, string>;
  errors: Record<string, AssignError>;
  assigningId: string | null;
  creating: boolean;
  onFilter: (f: DeliveryFilter) => void;
  onClearTruck: () => void;
  onClearAll: () => void;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
  onHover: (truckId: string | null) => void;
  onAssign: (deliveryId: string, truckId: string) => void;
  onReopen: (deliveryId: string, truckId: string, mode: ReopenMode) => void;
  onCancel: (deliveryId: string) => void;
  cancellingId: string | null;
  cancelErrors: Record<string, string>;
  onCreating: (open: boolean) => void;
  onCreated: (r: CreateDeliveryResponse) => void;
}

export function DeliveryList(p: Props) {
  const { deliveries, trucks, config, now } = p;
  const time = (iso: string) => formatTime(iso, config.timezone, config.locale);
  const T = new Map(trucks.map((t) => [t.id, t]));
  const truckName = (id: string | null) => {
    const t = id ? T.get(id) : undefined;
    return t ? `${t.plate_number} · ${p.driverName(t.driver_id) ?? 'no driver'}` : 'Truck not found';
  };
  const plate = (id: string | null) => (id ? (T.get(id)?.plate_number ?? 'Truck not found') : 'No truck');
  // Every available truck can be assigned. Distance needs a fresh position, so those trucks are
  // ranked by it; the rest still show, without a distance (the dispatcher may know where they are).
  const available = trucks.filter((t) => t.status === 'available');
  const located = available.filter((t) => hasPosition(t) && !isStale(t, config, now));
  const unlocated = available
    .filter((t) => !located.includes(t))
    // Most recent position first; trucks that have never reported go last.
    .sort((a, b) => (b.last_seen_at ? Date.parse(b.last_seen_at) : 0) - (a.last_seen_at ? Date.parse(a.last_seen_at) : 0));

  const byTruck = deliveries.filter((d) => !p.truckSel || d.truck_id === p.truckSel);
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  let list = needle
    ? byTruck.filter((d) =>
        [d.reference, d.customer_name, d.truck_id ? (T.get(d.truck_id)?.plate_number ?? '') : '', d.truck_id ? (p.driverName(T.get(d.truck_id)?.driver_id ?? null) ?? '') : '']
          .join(' ')
          .toLowerCase()
          .includes(needle),
      )
    : byTruck;
  if (p.filter === 'active') list = list.filter(isActive);
  else if (p.filter === 'attention') list = list.filter((d) => p.attentionIds.has(d.id));
  else if (p.filter !== 'all') list = list.filter((d) => d.status === p.filter);
  // Oldest pending first; everything else newest first.
  list = [...list].sort(
    (a, b) =>
      RANK[a.status] - RANK[b.status] ||
      (a.status === 'pending' ? Date.parse(a.created_at) - Date.parse(b.created_at) : Date.parse(b.created_at) - Date.parse(a.created_at)),
  );

  // The list carries no stops, so the second line is what the list itself knows.
  function line2(d: DeliveryListItem): string {
    switch (d.status) {
      case 'pending':
        return `Waiting ${formatDuration(minutesSince(d.created_at, now))} · booked ${time(d.created_at)}`;
      case 'assigned':
        return `${truckName(d.truck_id)} · heading to pickup`;
      case 'in_transit':
        return `${truckName(d.truck_id)} · on the way`;
      case 'failed': {
        const f = p.failed[d.id];
        return `${plate(d.truck_id)} · failed${f ? ` ${time(f.at)} · ${failReasonLabel(f.reason)}` : ''}`;
      }
      case 'completed':
        return `${plate(d.truck_id)} · completed`;
      case 'cancelled':
        return `Cancelled · booked ${time(d.created_at)}`;
    }
  }

  /** The nearest located trucks first, then the ones without a usable position. At most MAX_CANDIDATES. */
  function candidates(detail: DeliveryDetailResponse | undefined): Candidate[] {
    const pk = detail?.stops[0];
    const near: Candidate[] =
      pk && hasLatLng(pk)
        ? located
            .map((t) => ({ truck: t, km: haversineKm(pk, { lat: t.lat!, lng: t.lng! }), seenAgo: null, driver: p.driverName(t.driver_id) }))
            .sort((a, b) => a.km - b.km)
        : located.map((t) => ({ truck: t, km: null, seenAgo: null, driver: p.driverName(t.driver_id) }));
    const rest: Candidate[] = unlocated.map((t) => ({
      truck: t,
      km: null,
      seenAgo: t.last_seen_at ? formatDuration(minutesSince(t.last_seen_at, now)) : null,
      driver: p.driverName(t.driver_id),
    }));
    // Trucks with a driver first: one without can't be assigned until it has one.
    const all = [...near, ...rest];
    return [...all.filter((c) => c.truck.driver_id), ...all.filter((c) => !c.truck.driver_id)].slice(0, MAX_CANDIDATES);
  }

  // Bring the selected row into view when it was picked from elsewhere (map, header, answer card).
  // `loaded` reruns this once the rows exist, for a selection that came from the URL.
  const listRef = useRef<HTMLUListElement>(null);
  const loaded = deliveries.length > 0;
  useEffect(() => {
    if (!p.sel || !loaded) return;
    listRef.current?.querySelector(`[data-id="${CSS.escape(p.sel)}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [p.sel, loaded]);

  const truckChip = p.truckSel ? (T.get(p.truckSel)?.plate_number ?? 'Unknown truck') : null;
  const headerChip = HEADER_FILTERS[p.filter];

  // The form takes the pane's place while it's open: one scroll for the pane, none inside the form.
  if (p.creating) {
    return (
      <div className="min-h-0 flex-1 overflow-auto">
        <NewDeliveryForm config={config} onCreated={p.onCreated} onCancel={() => p.onCreating(false)} />
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-none flex-col gap-3.5 px-[18px] pt-[22px] pb-1">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="m-0 text-[22px] font-semibold tracking-[-0.01em]">Deliveries</h2>
          <span className="text-[12px] text-ink-muted">{deliveries.length} on the board</span>
        </div>
        <label className="flex h-11 items-center gap-2.5 rounded-[14px] border border-border bg-surface-100 px-3.5">
          <Search size={17} strokeWidth={1.8} className="flex-none text-ink-muted" aria-hidden="true" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search delivery, customer, truck or driver"
            aria-label="Search deliveries"
            className="min-w-0 flex-1 border-0 bg-transparent text-[13px] text-ink outline-none"
          />
        </label>
        <div role="group" aria-label="Filter deliveries" className="flex gap-0.5 overflow-x-auto rounded-[14px] border border-border bg-surface-100 p-1 [&>*]:flex-none">
          {truckChip && (
            <button
              type="button"
              onClick={p.onClearTruck}
              aria-label={`Remove truck filter ${truckChip}`}
              className="flex items-center gap-1.5 rounded-[10px] border-0 bg-ink px-2.5 text-[12.5px] font-medium text-surface-100"
              style={{ minHeight: 34 }}
            >
              {truckChip} <span aria-hidden="true">×</span>
            </button>
          )}
          {headerChip && (
            <button type="button" onClick={() => p.onFilter('all')} aria-label={`Remove filter ${headerChip}`} className="flex items-center gap-1.5 rounded-[10px] border-0 bg-brand px-2.5 text-[12.5px] font-medium text-brand-ink" style={{ minHeight: 34 }}>
              {headerChip} <span aria-hidden="true">×</span>
            </button>
          )}
          {CHIPS.map(([k, label]) => {
            const on = p.filter === k;
            const n = k === 'all' ? byTruck.length : byTruck.filter((d) => d.status === k).length;
            if (k !== 'all' && n === 0 && !on) return null;
            return (
              <button
                key={k}
                type="button"
                aria-pressed={on}
                onClick={() => p.onFilter(k)}
                className="flex items-center gap-1.5 rounded-[10px] border-0 px-2.5 text-[12.5px] font-medium whitespace-nowrap"
                style={{ background: on ? 'var(--brand)' : 'transparent', color: on ? 'var(--brand-ink)' : 'var(--ink)', minHeight: 34, minWidth: 0 }}
              >
                {label}
                <span className="rounded-md px-1.5 text-[10.5px]" style={{ background: on ? 'rgb(0 0 0 / .1)' : 'var(--surface-200)' }}>
                  {n}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <ul ref={listRef} aria-label="Delivery list" className="scroll-pad m-0 flex min-h-0 flex-1 list-none flex-col gap-2.5 overflow-auto px-3 py-3">
        {list.map((d) => {
          const ex = p.exp === d.id;
          const detail = ex ? p.detailOf(d.id) : undefined;
          const err = p.errors[d.id] ?? null;
          return (
            <DeliveryRow
              key={d.id}
              d={d}
              detail={detail}
              line2={line2(d)}
              due={dueLine(d, config.timezone, config.locale, now)}
              dueState={null}
              flag={null}
              selected={p.sel === d.id}
              expanded={ex}
              config={config}
              now={now}
              onSelect={() => p.onSelect(d.id)}
              onToggle={() => p.onToggle(d.id)}
              candidates={ex && (d.status === 'pending' || d.status === 'failed') ? candidates(detail) : []}
              availableCount={available.length}
              hover={p.hover}
              assigning={p.assigningId === d.id}
              onHover={p.onHover}
              onAssign={(truckId) => p.onAssign(d.id, truckId)}
              note={p.notes[d.id] ?? null}
              error={err}
              onRetry={() => err && (err.mode ? p.onReopen(d.id, err.truckId, err.mode) : p.onAssign(d.id, err.truckId))}
              onReopen={(truckId, mode) => p.onReopen(d.id, truckId, mode)}
              oldTruck={d.status === 'failed' && d.truck_id ? (T.get(d.truck_id) ?? null) : null}
              oldDriver={d.status === 'failed' && d.truck_id ? p.driverName(T.get(d.truck_id)?.driver_id ?? null) : null}
              onCancel={() => p.onCancel(d.id)}
              cancelling={p.cancellingId === d.id}
              cancelError={p.cancelErrors[d.id] ?? null}
              noDriver={(d.status === 'assigned' || d.status === 'in_transit') && !!d.truck_id && !T.get(d.truck_id)?.driver_id}
            />
          );
        })}

        {p.error && (
          <li role="alert" className="flex flex-col items-start gap-2.5 px-4 py-6">
            <span className="t-body font-semibold">Couldn&apos;t load deliveries</span>
            <span className="t-mono">{p.error.message}</span>
            <button type="button" onClick={p.onRetryLoad} className={btnSecondary}>
              Retry
            </button>
          </li>
        )}
        {!p.loading && !p.error && deliveries.length === 0 && (
          <li className="flex flex-col items-start gap-3 px-5 py-8">
            <span className="t-h2">No deliveries yet today</span>
            <span className="t-body text-ink-muted">
              Deliveries you create appear here, oldest pending first. {available.length}{' '}
              {available.length === 1 ? 'truck is' : 'trucks are'} available.
            </span>
            {!p.creating && (
              <button type="button" onClick={() => p.onCreating(true)} className={btnPrimary}>
                New delivery
              </button>
            )}
          </li>
        )}
        {deliveries.length > 0 && (
          <li className="t-body-sm px-4 py-3 text-ink-muted">
            Completed and cancelled deliveries leave this list {config.board_hours === 1 ? 'an hour' : `${config.board_hours} hours`} after they finish.{' '}
            <Link href="/console/history">See all in History</Link>
          </li>
        )}
        {deliveries.length > 0 && list.length === 0 && (
          <li className="flex flex-col items-start gap-2.5 px-4 py-6">
            <span className="t-body text-ink-muted">No deliveries match these filters.</span>
            <button type="button" onClick={p.onClearAll} className={btnSecondary}>
              Clear filters
            </button>
          </li>
        )}
      </ul>
      <div className="flex-none px-[18px] pt-2 pb-[18px]">
        <button
          type="button"
          onClick={() => p.onCreating(true)}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-[14px] border-0 bg-ink text-[14px] font-medium text-surface-100 hover:opacity-90"
        >
          <Plus size={17} strokeWidth={1.8} aria-hidden="true" />
          New delivery
        </button>
      </div>
    </>
  );
}
