'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageSquare, Phone, Plus, Search, Settings, Trash2, TriangleAlert, Truck as TruckIcon, X } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { FloatCard } from '@/components/console/FloatCard';
import { StatusPill } from '@/components/StatusPill';
import { telHref } from '@/components/tracking/TrackingPhone';
import { api, del } from '@/lib/api';
import { useConfig } from '@/lib/config';
import { useDeliveries, useDrivers } from '@/lib/deliveries';
import { activeByTruck, isStale } from '@/lib/exceptions';
import { formatSince, formatWhen } from '@/lib/format';
import { zonedDay } from '@/lib/history';
import { STATUS_LABEL } from '@/lib/labels';
import { TRUCKS_KEY, usePositions } from '@/lib/positions';
import type { DeliveryStatus, Truck, TruckStatus } from '@/lib/types';
import { useNow } from '@/lib/useNow';
import { AddTruckForm } from './AddTruckForm';
import { TruckHistory } from './TruckHistory';
import { TruckEdit } from './TruckEdit';
import { confirmDialog } from '@/components/Confirm';

/**
 * Fleet, laid out like Deliveries but about the trucks: the list on the left (search, status
 * tabs, a card per truck with its settings gear, Add truck at the bottom) and, instead of a map,
 * a board on the right. With no truck picked it's the fleet at a glance (status counts, trucks
 * that need a look, the busiest of the last 7 days); with one picked it's that truck: driver,
 * current delivery, position, its last 7 days and recent deliveries. The map stays on Deliveries.
 */

type Filter = 'all' | TruckStatus;
const ORDER: Record<TruckStatus, number> = { on_delivery: 0, available: 1, maintenance: 2, offline: 3 };
const TABS: [Filter, string][] = [
  ['all', 'All'],
  ['on_delivery', 'On delivery'],
  ['available', 'Available'],
  ['maintenance', 'Maintenance'],
  ['offline', 'Offline'],
];

interface ReportRow {
  reference: string;
  customer_name: string;
  status: DeliveryStatus;
  created_at: string;
  finished_at: string | null;
  plate: string | null;
}
interface Report {
  by_truck: { plate: string; completed: number; failed: number; cancelled: number; open: number }[];
  deliveries: ReportRow[];
}

const initials = (n: string) =>
  n
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('') || '–';

function Card({ title, action, children, className = '' }: { title: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={`flex min-w-0 flex-col gap-3 rounded-[20px] border border-divider bg-surface-100 p-4 ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-semibold">{title}</span>
        {action}
      </div>
      {children}
    </div>
  );
}

const smallBtn =
  'flex h-9 items-center justify-center gap-1.5 rounded-xl border border-border bg-surface-100 px-3 text-[12.5px] font-medium text-ink no-underline hover:border-ink-subtle disabled:opacity-45';

export function FleetMapView() {
  const config = useConfig();
  const qc = useQueryClient();
  const now = useNow(30_000);
  const trucksQ = usePositions();
  const trucks = trucksQ.data ?? [];
  const deliveries = useDeliveries().data ?? [];
  const drivers = useDrivers().data ?? [];
  const byId = useMemo(() => new Map(drivers.map((d) => [d.id, d])), [drivers]);
  const onTruck = useMemo(() => activeByTruck(deliveries), [deliveries]);
  const tz = config.timezone;
  const today = zonedDay(tz, 0, now);
  const week = useQuery({
    queryKey: ['report', zonedDay(tz, 6, now), today],
    queryFn: () => api<Report>(`/reports/deliveries?from=${zonedDay(tz, 6, now)}&to=${today}`),
    staleTime: 5 * 60_000,
  });

  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [selId, setSelId] = useState<string | null>(null);
  // The small card for adding or a truck's settings, beside the button that opened it.
  const [panel, setPanel] = useState<{ kind: 'add'; at: DOMRect } | { kind: 'settings'; id: string; at: DOMRect } | null>(null);
  // The card sits just right of the trucks list, at the bottom.
  const listPane = useRef<HTMLElement>(null);
  const at = (e: ReactMouseEvent) => (listPane.current ?? (e.currentTarget as HTMLElement)).getBoundingClientRect();
  const [fresh, setFresh] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const name = (id: string | null) => (id ? (byId.get(id)?.name ?? null) : null);
  const needle = q.trim().toLowerCase();
  const list = trucks
    .filter((t) => filter === 'all' || t.status === filter)
    .filter((t) => !needle || `${t.plate_number} ${t.model ?? ''} ${name(t.driver_id) ?? ''}`.toLowerCase().includes(needle))
    .sort((a, b) => Number(b.id === fresh) - Number(a.id === fresh) || ORDER[a.status] - ORDER[b.status] || a.plate_number.localeCompare(b.plate_number));
  // The board shows a truck: the one picked, else the first in the list.
  const sel = (selId ? trucks.find((t) => t.id === selId) : undefined) ?? list[0];
  const settingsTruck = panel?.kind === 'settings' ? trucks.find((t) => t.id === panel.id) : undefined;
  const truckOf = (driverId: string) => trucks.find((t) => t.driver_id === driverId)?.plate_number ?? null;
  const seen = (t: Truck) => (t.last_seen_at ? `${formatSince(t.last_seen_at, now)} ago` : 'Never');
  const silent = (t: Truck) => t.status === 'on_delivery' && isStale(t, config, now);

  async function remove(t: Truck) {
    const ok = await confirmDialog({
      title: `Remove ${t.plate_number}?`,
      body: "It's taken out of the fleet for good. Its past deliveries stay in History.",
      confirm: 'Remove truck',
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      await del(`/trucks/${encodeURIComponent(t.id)}`);
      setSelId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove the truck.');
    } finally {
      setBusy(false);
      void qc.invalidateQueries({ queryKey: TRUCKS_KEY });
    }
  }

  // ---- The board ----
  const stats = week.data?.by_truck ?? [];
  const statOf = (plate: string) => stats.find((x) => x.plate === plate);
  const attention = trucks
    .map((t) => {
      if (silent(t)) return { t, why: `No position for ${formatSince(t.last_seen_at!, now)}`, tone: 'var(--status-failed)' };
      if (t.status === 'available' && !t.driver_id) return { t, why: 'Free but has no driver', tone: 'var(--status-assigned)' };
      if (t.status === 'available' && t.driver_id && t.driver_on_shift === false) return { t, why: `${name(t.driver_id)} is off shift`, tone: 'var(--ink-muted)' };
      if (t.status === 'maintenance') return { t, why: 'In the workshop', tone: 'var(--status-transit)' };
      return null;
    })
    .filter((x): x is NonNullable<typeof x> => !!x);
  const busiest = [...stats].sort((a, b) => b.completed - a.completed).slice(0, 6);
  const maxDone = Math.max(1, ...busiest.map((b) => b.completed));

  const overview = (
    <div className="flex flex-col gap-3.5">
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
        {(['on_delivery', 'available', 'maintenance', 'offline'] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setFilter(s)}
            className="flex flex-col items-start gap-1 rounded-[20px] border border-divider bg-surface-100 p-4 text-start text-ink hover:border-ink-subtle"
          >
            <span className="text-[40px] leading-none font-light tracking-[-0.03em] tabular-nums">{trucks.filter((t) => t.status === s).length}</span>
            <StatusPill status={s} size="sm" />
          </button>
        ))}
      </div>
      <div className="grid gap-3.5 min-[1100px]:grid-cols-2">
        <Card title={`Needs a look · ${attention.length}`}>
          {attention.length === 0 && <span className="text-[13px] text-ink-muted">Every truck is fine.</span>}
          <div className="flex flex-col gap-1.5">
            {attention.slice(0, 8).map(({ t, why, tone }) => (
              <button key={t.id} type="button" onClick={() => setSelId(t.id)} className="flex items-center gap-2.5 rounded-xl px-2 py-2 text-start text-ink hover:bg-surface-200" style={{ minHeight: 0 }}>
                <i className="h-2 w-2 flex-none rounded-full" style={{ background: tone }} />
                <span className="t-mono w-[84px] flex-none text-[13px] font-medium">{t.plate_number}</span>
                <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-muted">{why}</span>
              </button>
            ))}
          </div>
        </Card>
        <Card title="Busiest · last 7 days">
          {week.isError && <span className="text-[13px] text-ink-muted">Couldn&apos;t load the last 7 days.</span>}
          {!week.isError && busiest.length === 0 && <span className="text-[13px] text-ink-muted">No deliveries in the last 7 days.</span>}
          <div className="flex flex-col gap-2.5">
            {busiest.map((b) => (
              <div key={b.plate} className="flex items-center gap-2.5 text-[12.5px]">
                <span className="t-mono w-[84px] flex-none font-medium">{b.plate}</span>
                <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-300">
                  <span className="block h-full rounded-full bg-brand" style={{ width: `${(b.completed / maxDone) * 100}%` }} />
                </span>
                <span className="w-8 flex-none text-end tabular-nums">{b.completed}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );

  const detail = (t: Truck) => (
    <TruckHistory
      key={t.id}
      truck={t}
      driver={t.driver_id ? byId.get(t.driver_id) : undefined}
      current={onTruck.get(t.id)}
      config={config}
      now={now}
      silent={silent(t)}
      busy={busy}
      error={error}
      onSettings={(e) => setPanel({ kind: 'settings', id: t.id, at: at(e) })}
      onRemove={() => void remove(t)}
    />
  );

  return (
    <div className="flex h-full min-h-[560px] flex-col bg-surface-100 text-ink min-[900px]:flex-row min-[900px]:overflow-hidden">
      {/* ---- The trucks ---- */}
      <section ref={listPane} className="flex min-h-0 flex-col min-[900px]:w-[380px] min-[900px]:flex-none">
        <div className="flex flex-none flex-col gap-3.5 px-[18px] pt-[22px] pb-1">
          <div className="flex items-baseline justify-between gap-2">
            <h1 className="m-0 text-[22px] font-semibold tracking-[-0.01em]">Fleet</h1>
            <span className="text-[12px] text-ink-muted">
              {trucks.length} trucks · {trucks.filter((t) => t.status === 'available').length} free
            </span>
          </div>
          <label className="flex h-11 items-center gap-2.5 rounded-[14px] border border-border bg-surface-100 px-3.5">
            <Search size={17} strokeWidth={2.2} className="flex-none text-ink" aria-hidden="true" />
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search plate, model or driver" aria-label="Search trucks" className="min-w-0 flex-1 border-0 bg-transparent text-[13px] text-ink outline-none" />
          </label>
          <div className="flex gap-0.5 overflow-x-auto rounded-[14px] border border-border bg-surface-100 p-1 [&>*]:flex-none">
            {TABS.map(([k, label]) => {
              const on = filter === k;
              const n = k === 'all' ? trucks.length : trucks.filter((t) => t.status === k).length;
              if (k !== 'all' && n === 0 && !on) return null;
              return (
                <button
                  key={k}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setFilter(k)}
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

        <ul className="m-0 flex min-h-0 flex-1 list-none flex-col gap-2.5 overflow-y-auto px-3 py-3">
          {list.map((t) => {
            const on = t.id === sel?.id;
            const d = onTruck.get(t.id);
            const drv = name(t.driver_id);
            return (
              <li
                key={t.id}
                className="flex flex-none flex-col gap-3 rounded-[18px] border p-3.5 transition-shadow"
                style={{
                  borderColor: on ? 'var(--ink)' : fresh === t.id ? 'var(--status-completed)' : 'var(--divider)',
                  background: on ? 'var(--surface-100)' : 'var(--surface-200)',
                  boxShadow: on ? 'var(--shadow-card)' : 'none',
                }}
              >
                <div className="flex items-center gap-2.5">
                  <button type="button" onClick={() => setSelId(on ? null : t.id)} aria-pressed={on} className="flex min-w-0 flex-1 items-center gap-2.5 border-0 bg-transparent p-0 text-start text-ink" style={{ minHeight: 0 }}>
                    <span className="grid h-9 w-9 flex-none place-items-center rounded-[11px] border border-border bg-surface-100 text-ink">
                      <TruckIcon size={18} strokeWidth={2.2} aria-hidden="true" />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col leading-tight">
                      <span className="t-mono text-[15px] font-medium">{t.plate_number}</span>
                      <span className="truncate text-[12px] text-ink-muted">{t.model || 'Model not given'}</span>
                    </span>
                    <StatusPill status={t.status} size="sm" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => setPanel({ kind: 'settings', id: t.id, at: at(e) })}
                    aria-label={`Settings for ${t.plate_number}`}
                    title="Status and usual driver"
                    className="grid h-8 w-8 flex-none place-items-center rounded-lg border border-border bg-surface-100 text-ink hover:border-ink-subtle"
                    style={{ minHeight: 32, minWidth: 32 }}
                  >
                    <Settings size={16} strokeWidth={2.2} aria-hidden="true" />
                  </button>
                </div>
                <button type="button" onClick={() => setSelId(on ? null : t.id)} className="flex items-center gap-2.5 border-0 border-t border-divider bg-transparent p-0 pt-2.5 text-start text-[12px] text-ink" style={{ minHeight: 0 }}>
                  <span className="grid h-7 w-7 flex-none place-items-center rounded-lg text-[10.5px] font-semibold" style={{ background: drv ? 'var(--brand)' : 'var(--surface-300)', color: 'var(--brand-ink)' }}>
                    {drv ? initials(drv) : '–'}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{drv ?? 'No driver'}</span>
                  <span className="flex-none" style={{ color: silent(t) ? 'var(--attention)' : 'var(--ink-muted)' }}>
                    {d ? d.reference : seen(t)}
                  </span>
                </button>
              </li>
            );
          })}
          {trucks.length > 0 && list.length === 0 && <li className="p-6 text-center text-[13px] text-ink-muted">No trucks match.</li>}
          {!trucksQ.isPending && trucks.length === 0 && <li className="p-6 text-center text-[13px] text-ink-muted">No trucks yet. Add the first one.</li>}
        </ul>

        <div className="flex-none px-[18px] pt-2 pb-[18px]">
          <button type="button" onClick={(e) => setPanel({ kind: 'add', at: at(e) })} className="flex h-12 w-full items-center justify-center gap-2 rounded-[14px] border-0 bg-ink text-[14px] font-medium text-surface-100 hover:opacity-90">
            <Plus size={18} strokeWidth={2.4} aria-hidden="true" />
            Add truck
          </button>
        </div>
      </section>

      {/* ---- The board ---- */}
      <section className="min-h-0 min-w-0 flex-1 p-3 min-[900px]:ps-0">
        <div className="h-full overflow-y-auto rounded-[18px] border border-divider bg-surface-200 p-4 pb-24 sm:p-5 sm:pb-24">{sel ? detail(sel) : overview}</div>
      </section>

      {panel?.kind === 'add' && (
        <FloatCard place="beside" anchor={panel.at} title="Add a truck" onClose={() => setPanel(null)}>
          <AddTruckForm
            trucks={trucks}
            onAdded={(t) => {
              qc.setQueryData<Truck[]>(TRUCKS_KEY, (ts) => [t, ...(ts ?? []).filter((x) => x.id !== t.id)]);
              void qc.invalidateQueries({ queryKey: TRUCKS_KEY });
              setFresh(t.id);
              setSelId(t.id);
              setFilter('all');
              setQ('');
            }}
          />
        </FloatCard>
      )}
      {settingsTruck && panel?.kind === 'settings' && (
        <FloatCard place="beside" anchor={panel.at} title={`${settingsTruck.plate_number} · settings`} onClose={() => setPanel(null)}>
          <TruckEdit
            truck={settingsTruck}
            drivers={drivers}
            usualTruckOf={truckOf}
            onSaved={(u) => {
              qc.setQueryData<Truck[]>(TRUCKS_KEY, (ts) => ts?.map((x) => (x.id === u.id ? { ...x, status: u.status, driver_id: u.driver_id } : x)));
              void qc.invalidateQueries({ queryKey: TRUCKS_KEY });
            }}
            onClose={() => setPanel(null)}
          />
        </FloatCard>
      )}
    </div>
  );
}
