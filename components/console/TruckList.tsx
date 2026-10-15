'use client';

import { StatusPill } from '@/components/StatusPill';
import { isStale } from '@/lib/exceptions';
import { formatWhen, secondsSince } from '@/lib/format';
import type { AppConfig } from '@/lib/config';
import type { DeliveryListItem, Truck, TruckStatus } from '@/lib/types';
import { useNow } from '@/lib/useNow';
import { chipCls } from './ui';

export type TruckFilter = 'all' | TruckStatus;

const FILTERS: [TruckFilter, string][] = [
  ['all', 'All'],
  ['available', 'Available'],
  ['on_delivery', 'On delivery'],
  ['maintenance', 'Maintenance'],
  ['offline', 'Offline'],
];
const RANK: Record<TruckStatus, number> = { on_delivery: 1, available: 2, maintenance: 3, offline: 4 };

interface Props {
  trucks: Truck[];
  config: AppConfig;
  /** Trucks only carry a driver_id: names come from /drivers. */
  driverName: (driverId: string | null) => string | null;
  /** Trucks carry no delivery id: the active delivery comes from the list. */
  deliveryOf: (truckId: string) => DeliveryListItem | undefined;
  filter: TruckFilter;
  onFilter: (f: TruckFilter) => void;
  isSelected: (t: Truck) => boolean;
  onSelect: (id: string) => void;
}

/** Live operations only: no add or edit here (that's Fleet). Sorted stale first. */
export function TruckList({ trucks, config, driverName, deliveryOf, filter, onFilter, isSelected, onSelect }: Props) {
  const now = useNow(1000);
  const list = trucks
    .filter((t) => filter === 'all' || t.status === filter)
    .map((t) => ({ t, stale: isStale(t, config, now) }))
    .sort((a, b) => (a.stale ? 0 : RANK[a.t.status]) - (b.stale ? 0 : RANK[b.t.status]) || a.t.plate_number.localeCompare(b.t.plate_number));

  return (
    <>
      <div className="flex items-baseline justify-between gap-2 px-3 pt-3">
        <span className="t-h3">Trucks · {trucks.length}</span>
        <span className="t-body-sm text-ink-muted">Select to filter deliveries</span>
      </div>
      <div role="group" aria-label="Filter trucks" className="flex gap-2 overflow-x-auto border-b border-divider px-3 py-2.5 [&>*]:flex-none">
        {FILTERS.map(([k, label]) => (
          <button key={k} type="button" aria-pressed={filter === k} onClick={() => onFilter(k)} className={chipCls(filter === k)}>
            {label}
            <span className="t-mono-sm">{k === 'all' ? trucks.length : trucks.filter((t) => t.status === k).length}</span>
          </button>
        ))}
      </div>
      <ul aria-label="Truck list" className="m-0 min-h-0 flex-1 list-none overflow-auto p-0">
        {list.map(({ t, stale }) => {
          const sel = isSelected(t);
          let sub: string;
          let dot = { color: 'var(--status-completed)', style: 'solid', fill: 'var(--status-completed)' };
          let bold = false;
          if (stale && t.last_seen_at) {
            sub = `No position for ${Math.floor(secondsSince(t.last_seen_at, now) / 60)} min${deliveryOf(t.id) ? ` · ${deliveryOf(t.id)!.reference}` : ''}`;
            dot = { color: 'var(--marker-stale)', style: 'dashed', fill: 'transparent' };
            bold = true;
          } else if (t.status === 'on_delivery') {
            sub = `${deliveryOf(t.id)?.reference ?? 'No delivery'} · ${t.last_seen_at ? `ping ${secondsSince(t.last_seen_at, now)} s ago` : 'no position yet'}`;
          } else if (t.status === 'available') {
            sub = t.last_seen_at ? `Free · ping ${secondsSince(t.last_seen_at, now)} s ago` : 'Free · no position yet';
          } else if (t.status === 'maintenance') {
            sub = 'In the workshop';
            dot = { color: 'var(--ink-muted)', style: 'solid', fill: 'var(--ink-muted)' };
          } else {
            sub = t.last_seen_at ? `Last position ${formatWhen(t.last_seen_at, config.timezone, config.locale)}` : 'No position reported today';
            dot = { color: 'var(--ink-muted)', style: 'solid', fill: 'transparent' };
          }
          return (
            <li key={t.id} className="border-b border-divider">
              <button
                type="button"
                onClick={() => onSelect(t.id)}
                aria-pressed={sel}
                className="flex w-full flex-col gap-1 border-0 px-3 py-2.5 text-start text-ink"
                style={{ background: sel ? 'var(--accent-bg)' : 'transparent', boxShadow: sel ? 'inset 0 0 0 2px var(--accent)' : 'none' }}
              >
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                  <span className="t-mono font-bold">{t.plate_number}</span>
                  <span className="t-body-sm min-w-[6em] flex-1">{driverName(t.driver_id) ?? 'No driver'}</span>
                  <StatusPill status={t.status} size="sm" />
                </span>
                <span className="t-body-sm flex items-center gap-1.5 text-ink-muted" style={{ fontWeight: bold ? 700 : 400 }}>
                  <span
                    aria-hidden="true"
                    className="h-2.5 w-2.5 flex-none rounded-full"
                    style={{ border: `2px ${dot.style} ${dot.color}`, background: dot.fill }}
                  />
                  {sub}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}
