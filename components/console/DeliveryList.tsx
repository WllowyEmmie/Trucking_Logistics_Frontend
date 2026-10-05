'use client';

import { useEffect, useRef } from 'react';
import { currentStopIndex, hasPosition, isActive, isStale, lateMinutes } from '@/lib/exceptions';
import { formatDuration, formatTime, haversineKm, minutesSince } from '@/lib/format';
import { failReasonLabel } from '@/lib/labels';
import type { Config, Delivery, DeliveryStatus, Truck } from '@/lib/types';
import { AskBox } from './AskBox';
import type { Candidate } from './AssignPanel';
import { DeliveryRow, type RowError } from './DeliveryRow';
import { NewDeliveryForm } from './NewDeliveryForm';
import { btnPrimary, btnSecondary, chipCls } from './ui';

export type DeliveryFilter = 'all' | 'active' | 'attention' | DeliveryStatus;

const CHIPS: [DeliveryFilter, string][] = [
  ['all', 'All'],
  ['pending', 'Pending'],
  ['assigned', 'Assigned'],
  ['in_transit', 'In transit'],
  ['failed', 'Failed'],
  ['completed', 'Completed'],
  ['cancelled', 'Cancelled'],
];
/** Filters set from the header counts; shown as a removable chip. */
const HEADER_FILTERS: Partial<Record<DeliveryFilter, string>> = { active: 'Active', attention: 'Needs attention' };

export const DELIVERY_FILTERS = new Set<DeliveryFilter>(['active', 'attention', ...CHIPS.map(([k]) => k)]);

const RANK: Record<DeliveryStatus, number> = { pending: 0, in_transit: 1, assigned: 2, failed: 3, completed: 4, cancelled: 5 };

export interface AssignError extends RowError {
  truckId: string;
}

interface Props {
  deliveries: Delivery[];
  trucks: Truck[];
  config: Config;
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
  defaultPickup: string;
  onFilter: (f: DeliveryFilter) => void;
  onClearTruck: () => void;
  onClearAll: () => void;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
  onHover: (truckId: string | null) => void;
  onAssign: (deliveryId: string, truckId: string) => void;
  onCreating: (open: boolean) => void;
  onCreated: (d: Delivery) => void;
  onAskDelivery: (id: string) => void;
  onAskTruck: (id: string) => void;
}

export function DeliveryList(p: Props) {
  const { deliveries, trucks, config, now } = p;
  const tz = config.timezone;
  const time = (iso: string) => formatTime(iso, tz, config.locale);
  const T = new Map(trucks.map((t) => [t.id, t]));
  const truckName = (id: string | null) => {
    const t = id ? T.get(id) : undefined;
    return t ? `${t.plate_number} · ${t.driver_name ?? 'no driver'}` : (id ?? 'No truck');
  };
  const available = trucks.filter((t) => t.status === 'available' && hasPosition(t) && !isStale(t, config, now));

  const byTruck = deliveries.filter((d) => !p.truckSel || d.truck_id === p.truckSel);
  let list = byTruck;
  if (p.filter === 'active') list = list.filter(isActive);
  else if (p.filter === 'attention') list = list.filter((d) => p.attentionIds.has(d.id));
  else if (p.filter !== 'all') list = list.filter((d) => d.status === p.filter);
  list = list
    .map((d) => ({ d, late: lateMinutes(d) }))
    .sort(
      (a, b) =>
        RANK[a.d.status] - RANK[b.d.status] ||
        (a.d.status === 'pending' ? Date.parse(a.d.created_at) - Date.parse(b.d.created_at) : b.late - a.late),
    )
    .map((x) => x.d);

  function line2(d: Delivery): string {
    const plate = (d.truck_id && T.get(d.truck_id)?.plate_number) || d.truck_id || 'No truck';
    switch (d.status) {
      case 'pending':
        return `Waiting ${formatDuration(minutesSince(d.created_at, now))} · ${d.stops.length} stops · pickup ${d.stops[0]?.address.split(',')[0] ?? 'not set'}`;
      case 'assigned':
        return `${truckName(d.truck_id)} · heading to pickup`;
      case 'in_transit': {
        const i = currentStopIndex(d);
        const eta = d.stops[i]?.eta;
        return `${truckName(d.truck_id)} · stop ${i + 1} of ${d.stops.length}${eta ? ` · ETA ${time(eta)}` : ''}`;
      }
      case 'failed':
        return `${plate} · failed ${d.ended_at ? time(d.ended_at) : ''} · ${failReasonLabel(d.failure_reason)}`;
      case 'completed':
        return `${plate} · delivered ${d.ended_at ? time(d.ended_at) : ''}`;
      case 'cancelled':
        return d.ended_at ? `Cancelled ${time(d.ended_at)}` : 'Cancelled';
    }
  }

  function candidates(d: Delivery): Candidate[] {
    const pk = d.stops[0];
    if (!pk) return [];
    return available
      .map((t) => ({ truck: t, km: haversineKm(pk, { lat: t.lat!, lng: t.lng! }) }))
      .sort((a, b) => a.km - b.km)
      .slice(0, 5);
  }

  // Bring the selected row into view when it was picked from elsewhere (map, header, answer card).
  // `loaded` reruns this once the rows exist, for a selection that came from the URL.
  const listRef = useRef<HTMLUListElement>(null);
  const loaded = deliveries.length > 0;
  useEffect(() => {
    if (!p.sel || !loaded) return;
    listRef.current?.querySelector(`[data-id="${CSS.escape(p.sel)}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [p.sel, loaded]);

  const truckChip = p.truckSel ? (T.get(p.truckSel)?.plate_number ?? p.truckSel) : null;
  const headerChip = HEADER_FILTERS[p.filter];

  return (
    <>
      <AskBox
        deliveries={deliveries}
        trucks={trucks}
        config={config}
        now={now}
        onSelectDelivery={p.onAskDelivery}
        onSelectTruck={p.onAskTruck}
      />
      <div className="flex items-center justify-between gap-2 px-3 pt-2.5">
        <h2 className="t-h3 m-0">Deliveries · {deliveries.length}</h2>
        {!p.creating && (
          <button type="button" onClick={() => p.onCreating(true)} className={btnPrimary}>
            New delivery
          </button>
        )}
      </div>
      {p.creating && (
        <NewDeliveryForm defaultPickup={p.defaultPickup} onCreated={p.onCreated} onCancel={() => p.onCreating(false)} />
      )}
      <div role="group" aria-label="Filter deliveries" className="flex flex-wrap gap-2 border-b border-divider px-3 py-2.5">
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
          <button
            type="button"
            onClick={() => p.onFilter('all')}
            aria-label={`Remove filter ${headerChip}`}
            className={chipCls(true)}
          >
            {headerChip} <span aria-hidden="true">×</span>
          </button>
        )}
        {CHIPS.map(([k, label]) => (
          <button key={k} type="button" aria-pressed={p.filter === k} onClick={() => p.onFilter(k)} className={chipCls(p.filter === k)}>
            {label}
            <span className="t-mono-sm">{k === 'all' ? byTruck.length : byTruck.filter((d) => d.status === k).length}</span>
          </button>
        ))}
      </div>
      <ul ref={listRef} aria-label="Delivery list" className="scroll-pad m-0 min-h-0 flex-1 list-none overflow-auto p-0">
        {list.map((d) => {
          const ex = p.exp === d.id;
          const late = lateMinutes(d);
          const err = p.errors[d.id] ?? null;
          return (
            <DeliveryRow
              key={d.id}
              d={d}
              line2={line2(d)}
              flag={late ? `Late ${late} min` : p.attentionIds.has(d.id) ? 'Needs attention' : null}
              selected={p.sel === d.id}
              expanded={ex}
              config={config}
              now={now}
              onSelect={() => p.onSelect(d.id)}
              onToggle={() => p.onToggle(d.id)}
              candidates={ex && d.status === 'pending' ? candidates(d) : []}
              availableCount={available.length}
              hover={p.hover}
              assigning={p.assigningId === d.id}
              onHover={p.onHover}
              onAssign={(truckId) => p.onAssign(d.id, truckId)}
              note={p.notes[d.id] ?? null}
              error={err}
              onRetry={() => err && p.onAssign(d.id, err.truckId)}
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
