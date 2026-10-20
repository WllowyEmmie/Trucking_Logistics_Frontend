'use client';

import Link from 'next/link';

import { useEffect, useRef } from 'react';
import type { AppConfig } from '@/lib/config';
import { hasLatLng } from '@/lib/deliveries';
import { hasPosition, isActive, isStale, type FailedInfo } from '@/lib/exceptions';
import { formatDuration, formatTime, haversineKm, minutesSince } from '@/lib/format';
import { failReasonLabel } from '@/lib/labels';
import type { CreateDeliveryResponse, DeliveryDetailResponse, DeliveryListItem, DeliveryStatus, Truck } from '@/lib/types';
import { AskBox } from './AskBox';
import type { Candidate } from './AssignPanel';
import { DeliveryRow, type RowError } from './DeliveryRow';
import { dueLine, dueState } from '@/lib/due';
import type { ReopenMode } from '@/lib/reopen';
import { NewDeliveryForm } from './NewDeliveryForm';
import { btnPrimary, btnSecondary, chipCls } from './ui';

/** Trucks offered in the assign panel: room for every available truck in a small fleet. */
const MAX_CANDIDATES = 8;

export type DeliveryFilter = 'all' | 'active' | 'attention' | DeliveryStatus;

// Every list filter lives here, above the list it changes. The header counts only show numbers.
const CHIPS: [DeliveryFilter, string][] = [
  ['all', 'All'],
  ['attention', 'Needs attention'],
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
  let list = byTruck;
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
      {config.agent_enabled && <AskBox />}
      <div className="flex items-center justify-between gap-2 px-3 pt-2.5">
        <h2 className="t-h3 m-0">Deliveries · {deliveries.length}</h2>
        <button type="button" onClick={() => p.onCreating(true)} className={btnPrimary}>
          New delivery
        </button>
      </div>
      <div role="group" aria-label="Filter deliveries" className="flex gap-2 overflow-x-auto border-b border-divider px-3 py-2.5 [&>*]:flex-none">
        {truckChip && (
          <button
            type="button"
            onClick={p.onClearTruck}
            aria-label={`Remove truck filter ${truckChip}`}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full border-2 border-accent bg-accent-bg px-3 text-[13px] font-semibold text-ink"
          >
            Truck {truckChip} <span aria-hidden="true">×</span>
          </button>
        )}
        {headerChip && (
          <button type="button" onClick={() => p.onFilter('all')} aria-label={`Remove filter ${headerChip}`} className={chipCls(true)}>
            {headerChip} <span aria-hidden="true">×</span>
          </button>
        )}
        {CHIPS.map(([k, label]) => (
          <button key={k} type="button" aria-pressed={p.filter === k} onClick={() => p.onFilter(k)} className={chipCls(p.filter === k)}>
            {label}
            <span className="t-mono-sm">
              {k === 'all' ? byTruck.length : k === 'attention' ? byTruck.filter((d) => p.attentionIds.has(d.id)).length : byTruck.filter((d) => d.status === k).length}
            </span>
          </button>
        ))}
      </div>
      <ul ref={listRef} aria-label="Delivery list" className="scroll-pad m-0 min-h-0 flex-1 list-none overflow-auto p-0">
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
              dueState={dueState(d, now)}
              flag={p.attentionIds.has(d.id) ? 'Needs attention' : null}
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
    </>
  );
}
