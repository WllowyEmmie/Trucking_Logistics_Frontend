'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Fragment, useState, type ReactNode } from 'react';
import { AccountMenu } from '@/components/auth/AccountMenu';
import { DispatchNav } from '@/components/console/DispatchNav';
import { StatusPill } from '@/components/StatusPill';
import { post } from '@/lib/api';
import { useConfig } from '@/lib/config';
import { formatWhen } from '@/lib/format';
import { DRIVERS_KEY, useDrivers } from '@/lib/deliveries';
import { TRUCKS_KEY, usePositions } from '@/lib/positions';
import type { Driver, Truck } from '@/lib/types';
import { AddDriverForm } from './AddDriverForm';
import { AddTruckForm } from './AddTruckForm';
import { DriverPinEdit } from './DriverPinEdit';
import { TruckEdit } from './TruckEdit';

type Tab = 'trucks' | 'drivers';

const TRUCK_COLS = 'minmax(90px,.7fr) minmax(0,1.4fr) minmax(110px,.8fr) minmax(0,1fr) 72px';
const DRIVER_COLS = 'minmax(0,1.3fr) minmax(0,1fr) minmax(0,1fr) minmax(0,.8fr) 88px';

interface Row {
  key: string;
  fresh: boolean;
  cells: ReactNode[];
  /** Shown under the row: the truck editor while it's open. */
  below?: ReactNode;
}

export function FleetView() {
  const config = useConfig();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('trucks');
  const [q, setQ] = useState('');
  // The row just added stays at the top, tinted, until the page is left.
  const [fresh, setFresh] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  const trucksQ = usePositions();
  const driversQ = useDrivers();
  const trucks = trucksQ.data ?? [];
  const drivers = driversQ.data ?? [];
  // The link runs truck → driver (trucks.driver_id); drivers carry no truck.
  const driverName = (id: string | null) => (id ? (drivers.find((d) => d.id === id)?.name ?? null) : null);
  const truckOf = (driverId: string) => trucks.find((t) => t.driver_id === driverId)?.plate_number ?? null;
  const isT = tab === 'trucks';
  const needle = q.trim().toLowerCase();
  const freshFirst = <T,>(list: T[], key: (x: T) => string) =>
    fresh ? [...list.filter((x) => key(x) === fresh), ...list.filter((x) => key(x) !== fresh)] : list;

  const rows: Row[] = isT
    ? freshFirst(trucks, (t) => t.id)
        .filter((t) => !needle || `${t.plate_number} ${t.model ?? ''} ${driverName(t.driver_id) ?? ''}`.toLowerCase().includes(needle))
        .map((t) => ({
          key: t.id,
          fresh: fresh === t.id,
          cells: [
            <span key="p" className="t-mono wrap-anywhere font-bold">
              {t.plate_number}
            </span>,
            <span key="m" className={`t-body-sm wrap-anywhere ${t.model ? '' : 'text-ink-muted'}`}>
              {t.model ?? 'Model not given'}
            </span>,
            <StatusPill key="s" status={t.status} size="sm" />,
            <span key="d" className="t-body-sm wrap-anywhere text-ink-muted">
              {driverName(t.driver_id) ?? 'No usual driver'}
            </span>,
            <button
              key="e"
              type="button"
              aria-expanded={editing === t.id}
              aria-label={`Edit ${t.plate_number}`}
              onClick={() => setEditing(editing === t.id ? null : t.id)}
              className="min-h-11 rounded-md border border-border bg-surface-100 px-3 text-[13px] font-semibold text-ink"
            >
              {editing === t.id ? 'Close' : 'Edit'}
            </button>,
          ],
          below:
            editing === t.id ? (
              <TruckEdit
                truck={t}
                drivers={drivers}
                usualTruckOf={truckOf}
                onSaved={(u) => {
                  qc.setQueryData<Truck[]>(TRUCKS_KEY, (ts) => ts?.map((x) => (x.id === u.id ? { ...x, status: u.status, driver_id: u.driver_id } : x)));
                  void qc.invalidateQueries({ queryKey: TRUCKS_KEY });
                }}
                onClose={() => setEditing(null)}
              />
            ) : undefined,
        }))
    : freshFirst(drivers, (d) => d.id)
        .filter((d) => !needle || `${d.name} ${d.phone} ${truckOf(d.id) ?? ''}`.toLowerCase().includes(needle))
        .map((d) => {
          const plate = truckOf(d.id);
          return {
            key: d.id,
            fresh: fresh === d.id,
            cells: [
              <span key="n" className="t-body-sm wrap-anywhere font-bold">
                {d.name}
              </span>,
              <span key="p" className="t-mono wrap-anywhere">
                {d.phone}
              </span>,
              <span key="t" className={`t-body-sm wrap-anywhere ${plate ? '' : 'text-ink-muted'}`}>
                {plate ?? 'Assigned per delivery'}
              </span>,
              <span key="a" className="flex flex-col items-start gap-1">
                <span className={`t-body-sm ${d.has_pin ? '' : 'font-semibold text-attention'}`}>{d.has_pin ? 'Can sign in' : 'No PIN yet'}</span>
                {d.on_shift ? (
                  <span className="t-body-sm flex flex-wrap items-center gap-x-2 font-semibold">
                    On shift{d.shift_since ? ` since ${formatWhen(d.shift_since, config.timezone, config.locale)}` : ''}
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm(`End ${d.name}'s shift? Their phone stops sharing its location.`))
                          void post(`/drivers/${encodeURIComponent(d.id)}/shift/end`)
                            .catch((e: Error) => window.alert(e.message))
                            .finally(() => void qc.invalidateQueries({ queryKey: DRIVERS_KEY }));
                      }}
                      className="min-h-8 rounded-md border border-border bg-surface-100 px-2 text-[12px] font-semibold text-ink"
                    >
                      End shift
                    </button>
                  </span>
                ) : (
                  <span className="t-body-sm text-ink-muted">Off shift</span>
                )}
              </span>,
              <button
                key="e"
                type="button"
                aria-expanded={editing === d.id}
                aria-label={`${d.has_pin ? 'Reset' : 'Set'} ${d.name}'s PIN`}
                onClick={() => setEditing(editing === d.id ? null : d.id)}
                className="min-h-11 rounded-md border border-border bg-surface-100 px-3 text-[13px] font-semibold text-ink"
              >
                {editing === d.id ? 'Close' : d.has_pin ? 'Reset PIN' : 'Set PIN'}
              </button>,
            ],
            below:
              editing === d.id ? (
                <DriverPinEdit driver={d} onSaved={() => void qc.invalidateQueries({ queryKey: DRIVERS_KEY })} onClose={() => setEditing(null)} />
              ) : undefined,
          };
        });

  const loading = isT ? trucksQ.isPending : driversQ.isPending;
  const loadError = isT ? trucksQ.error : driversQ.error;
  const title = isT ? 'Trucks' : 'Drivers';
  const searchHint = isT ? 'Plate, model or driver' : 'Name, phone or truck';
  const heads = isT ? ['Plate', 'Model', 'Status', 'Usual driver', ''] : ['Name', 'Phone', 'Usual truck', 'Driver app and shift', ''];
  const cols = isT ? TRUCK_COLS : DRIVER_COLS;

  return (
    <div className="flex min-h-dvh flex-col bg-surface-200 text-ink">
      <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-border bg-surface-100 px-6 py-3">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <span className="t-h2">{config.operator_name} · Dispatch</span>
          <DispatchNav current="/console/fleet" />
        </div>
        <div className="flex flex-wrap items-center gap-3">
        <div role="tablist" aria-label="Fleet" className="flex gap-2">
          {(
            [
              ['trucks', 'Trucks', trucks.length],
              ['drivers', 'Drivers', drivers.length],
            ] as const
          ).map(([k, label, n]) => {
            const on = tab === k;
            return (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => {
                  setTab(k);
                  setQ('');
                  setEditing(null);
                }}
                className={`inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-[14px] font-semibold ${
                  on ? 'border-2 border-ink bg-ink text-surface-100' : 'border border-border bg-surface-100 text-ink'
                }`}
              >
                {/* Baseline-aligned: the mono count is a smaller font, so centring the two boxes
                    left the digits sitting off the word's line. */}
                <span className="inline-flex items-baseline gap-2">
                  {label}
                  <span className="font-mono text-[12px] leading-none tabular-nums">{n}</span>
                </span>
              </button>
            );
          })}
        </div>
          <span aria-hidden="true" className="h-6 border-s border-divider" />
          <AccountMenu />
        </div>
      </header>

      <div className="grid items-start gap-6 p-6" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 440px), 1fr))' }}>
        <section
          aria-label={title}
          // Spans two columns only once two fit (2 × 440 + gap + padding); otherwise it would add a phantom column.
          className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-surface-100 min-[952px]:col-span-2"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-divider px-4 py-3.5">
            <h1 className="t-h1 m-0">{title}</h1>
            <label className="flex min-h-11 min-w-[240px] items-center gap-2 rounded-md border border-border px-3" style={{ flex: '0 1 320px' }}>
              <span className="t-label text-ink-muted">Find</span>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={searchHint}
                aria-label={searchHint}
                className="min-h-10 min-w-0 flex-1 border-0 bg-transparent text-[14px] text-ink"
              />
            </label>
          </div>
          <div role="table" aria-label={title} className="scroll-pad flex max-h-[720px] flex-col overflow-auto">
            <div role="row" className="t-label sticky top-0 z-[1] grid gap-3 bg-surface-200 px-4 py-2 text-ink-muted" style={{ gridTemplateColumns: cols }}>
              {heads.map((h, i) => (
                <span key={i} role="columnheader">
                  {h || <span className="sr-only">Edit</span>}
                </span>
              ))}
            </div>
            {rows.map((r) => (
              <Fragment key={r.key}>
                <div
                  role="row"
                  className="grid min-h-[52px] items-center gap-3 border-b border-divider px-4 py-1.5"
                  style={{ gridTemplateColumns: cols, background: r.fresh ? 'var(--status-completed-bg)' : 'transparent' }}
                >
                  {r.cells.map((c, i) => (
                    <span key={i} role="cell" className="flex min-w-0 flex-col">
                      {c}
                      {i === 0 && r.fresh && <span className="t-label text-status-completed">Just added</span>}
                    </span>
                  ))}
                </div>
                {r.below && <div className="border-b border-divider">{r.below}</div>}
              </Fragment>
            ))}
            {loadError && rows.length === 0 && (
              <div role="alert" className="flex flex-col items-start gap-2.5 px-4 py-6">
                <span className="t-body font-semibold">Couldn&apos;t load {title.toLowerCase()}</span>
                <span className="t-mono">{loadError.message}</span>
                <button
                  type="button"
                  onClick={() => void (isT ? trucksQ.refetch() : driversQ.refetch())}
                  className="min-h-11 rounded-md border border-border bg-surface-100 px-3 text-[13px] font-semibold text-ink"
                >
                  Retry
                </button>
              </div>
            )}
            {!loading && !loadError && rows.length === 0 && (
              <div className="t-body px-4 py-6 text-ink-muted">
                {needle
                  ? 'Nothing matches that search.'
                  : isT
                    ? 'No trucks yet. Add the first one with the form.'
                    : 'No drivers yet. Add the first one with the form.'}
              </div>
            )}
          </div>
        </section>

        <aside className="flex min-w-0 flex-col gap-4">
          {isT ? (
            <AddTruckForm
              trucks={trucks}
              onAdded={(t) => {
                qc.setQueryData<Truck[]>(TRUCKS_KEY, (ts) => [t, ...(ts ?? []).filter((x) => x.id !== t.id)]);
                void qc.invalidateQueries({ queryKey: TRUCKS_KEY });
                setFresh(t.id);
                setQ('');
              }}
            />
          ) : (
            <AddDriverForm
              trucks={trucks}
              onAdded={(d, truck) => {
                qc.setQueryData<Driver[]>(DRIVERS_KEY, (ds) => [d, ...(ds ?? []).filter((x) => x.id !== d.id)]);
                void qc.invalidateQueries({ queryKey: DRIVERS_KEY });
                if (truck) {
                  qc.setQueryData<Truck[]>(TRUCKS_KEY, (ts) => ts?.map((x) => (x.id === truck.id ? { ...x, driver_id: truck.driver_id } : x)));
                  void qc.invalidateQueries({ queryKey: TRUCKS_KEY });
                }
                setFresh(d.id);
                setQ('');
              }}
            />
          )}
        </aside>
      </div>
    </div>
  );
}
