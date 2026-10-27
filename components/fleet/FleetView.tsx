'use client';

import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Plus, Search, Settings, Trash2, Truck as TruckIcon } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { SidePanel } from '@/components/console/SidePanel';
import { StatusPill } from '@/components/StatusPill';
import { del } from '@/lib/api';
import { useConfig } from '@/lib/config';
import { useDeliveries, useDrivers } from '@/lib/deliveries';
import { activeByTruck } from '@/lib/exceptions';
import { formatSince } from '@/lib/format';
import { TRUCKS_KEY, usePositions } from '@/lib/positions';
import type { Truck } from '@/lib/types';
import { useNow } from '@/lib/useNow';
import { AddTruckForm } from './AddTruckForm';
import { TruckEdit } from './TruckEdit';
import { confirmDialog } from '@/components/Confirm';

/**
 * Fleet → manage trucks, in the console design: a grid of truck cells (plate, driver, status);
 * click one for its details, settings (status and driver) and Remove. Drivers are managed on the
 * Drivers page.
 */

type Panel = { kind: 'add' } | { kind: 'details'; id: string } | { kind: 'settings'; id: string } | null;

export const panelBtn =
  'flex h-11 items-center justify-center gap-2 rounded-xl border border-border bg-surface-100 px-3 text-[13px] font-medium text-ink no-underline hover:border-ink-subtle disabled:opacity-45';

export function FleetView() {
  const config = useConfig();
  const qc = useQueryClient();
  const now = useNow(60_000);
  const [q, setQ] = useState('');
  const [panel, setPanel] = useState<Panel>(null);
  const [fresh, setFresh] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const trucksQ = usePositions();
  const drivers = useDrivers().data ?? [];
  const onTruck = activeByTruck(useDeliveries().data ?? []);
  const trucks = trucksQ.data ?? [];
  const driverName = (id: string | null) => (id ? (drivers.find((d) => d.id === id)?.name ?? null) : null);
  const truckOf = (driverId: string) => trucks.find((t) => t.driver_id === driverId)?.plate_number ?? null;
  const needle = q.trim().toLowerCase();
  const list = (fresh ? [...trucks.filter((t) => t.id === fresh), ...trucks.filter((t) => t.id !== fresh)] : trucks).filter(
    (t) => !needle || `${t.plate_number} ${t.model ?? ''} ${driverName(t.driver_id) ?? ''}`.toLowerCase().includes(needle),
  );
  const open = panel && panel.kind !== 'add' ? trucks.find((t) => t.id === panel.id) : undefined;
  const close = () => {
    setPanel(null);
    setError(null);
  };

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
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove the truck.');
    } finally {
      setBusy(false);
      void qc.invalidateQueries({ queryKey: TRUCKS_KEY });
    }
  }

  return (
    <div className="flex min-h-full flex-col gap-5 bg-surface-100 p-5 text-ink sm:p-[26px]">
      <div className="flex flex-wrap items-center justify-between gap-3.5">
        <div className="flex items-center gap-3">
          <Link href="/console/fleet" aria-label="Back to the fleet map" className="grid h-10 w-10 place-items-center rounded-xl border border-border no-underline hover:border-ink-subtle" style={{ color: 'var(--ink)' }}>
            <ArrowLeft size={18} strokeWidth={2.2} aria-hidden="true" />
          </Link>
          <div className="flex flex-col gap-0.5">
            <h1 className="m-0 text-[22px] font-semibold tracking-[-0.01em]">Manage trucks</h1>
            <span className="text-[12px] text-ink-muted">
              {trucks.length} trucks · {config.operator_name} · drivers are on the Drivers page
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex h-[42px] min-w-[220px] items-center gap-2 rounded-[14px] border border-border px-3">
            <Search size={16} strokeWidth={2.2} className="text-ink" aria-hidden="true" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Plate, model or driver" aria-label="Search trucks" className="min-w-0 flex-1 border-0 bg-transparent text-[13px] text-ink outline-none" />
          </label>
          <button type="button" onClick={() => setPanel({ kind: 'add' })} className="flex h-[42px] items-center gap-2 rounded-[14px] border-0 bg-ink px-4 text-[13px] font-medium text-surface-100 hover:opacity-90">
            <Plus size={17} strokeWidth={2.4} aria-hidden="true" />
            Add truck
          </button>
        </div>
      </div>

      {trucksQ.error && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-2xl border border-status-failed bg-status-failed-bg px-4 py-3 text-[13px]">
          Couldn&apos;t load trucks: {trucksQ.error.message}
        </div>
      )}

      <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
        {list.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setPanel({ kind: 'details', id: t.id })}
            className="flex flex-col items-start gap-2.5 rounded-[18px] border bg-surface-200 p-3.5 text-start text-ink transition-shadow hover:bg-surface-100 hover:shadow-[var(--shadow-card)]"
            style={{ borderColor: fresh === t.id ? 'var(--status-completed)' : 'var(--divider)' }}
          >
            <span className="flex w-full items-center justify-between gap-2">
              <span className="grid h-9 w-9 flex-none place-items-center rounded-[11px] border border-border bg-surface-100 text-ink">
                <TruckIcon size={18} strokeWidth={2.2} aria-hidden="true" />
              </span>
              <StatusPill status={t.status} size="sm" />
            </span>
            <span className="flex w-full min-w-0 flex-col leading-tight">
              <span className="t-mono truncate text-[14px] font-semibold">{t.plate_number}</span>
              <span className="truncate text-[11.5px] text-ink-muted">{driverName(t.driver_id) ?? 'No driver'}</span>
            </span>
          </button>
        ))}
      </div>
      {!trucksQ.isPending && list.length === 0 && (
        <div className="rounded-[20px] border border-dashed border-border p-10 text-center text-[13px] text-ink-muted">{needle ? 'Nothing matches that search.' : 'No trucks yet. Add the first one.'}</div>
      )}

      {panel?.kind === 'add' && (
        <SidePanel title="Add a truck" onClose={close}>
          <AddTruckForm
            trucks={trucks}
            onAdded={(t) => {
              qc.setQueryData<Truck[]>(TRUCKS_KEY, (ts) => [t, ...(ts ?? []).filter((x) => x.id !== t.id)]);
              void qc.invalidateQueries({ queryKey: TRUCKS_KEY });
              setFresh(t.id);
              setQ('');
            }}
          />
        </SidePanel>
      )}

      {open && panel?.kind === 'details' && (
        <SidePanel title={open.plate_number} onClose={close}>
          <div className="flex flex-col gap-4 p-5">
            <div className="flex items-center gap-3">
              <span className="grid h-12 w-12 flex-none place-items-center rounded-[14px] border border-border bg-surface-200 text-ink">
                <TruckIcon size={22} strokeWidth={2.2} aria-hidden="true" />
              </span>
              <div className="flex min-w-0 flex-1 flex-col leading-tight">
                <span className="t-mono text-[16px] font-semibold">{open.plate_number}</span>
                <span className="text-[12.5px] text-ink-muted">{open.model || 'Model not given'}</span>
              </div>
              <button
                type="button"
                onClick={() => setPanel({ kind: 'settings', id: open.id })}
                aria-label={`Settings for ${open.plate_number}`}
                title="Status and driver"
                className="grid h-10 w-10 place-items-center rounded-xl border border-border bg-surface-100 text-ink hover:border-ink-subtle"
              >
                <Settings size={18} strokeWidth={2.2} aria-hidden="true" />
              </button>
            </div>
            <div className="flex">
              <StatusPill status={open.status} />
            </div>
            <dl className="m-0 grid grid-cols-2 gap-3 rounded-2xl border border-divider bg-surface-200 p-4">
              {(
                [
                  ['Usual driver', driverName(open.driver_id) ?? 'No driver'],
                  ['Delivery', onTruck.get(open.id)?.reference ?? '—'],
                  ['Last position', open.last_seen_at ? `${formatSince(open.last_seen_at, now)} ago` : 'None yet'],
                  ['Driver on shift', open.driver_id ? (open.driver_on_shift ? 'Yes' : 'No') : '—'],
                ] as const
              ).map(([k, v]) => (
                <div key={k} className="flex min-w-0 flex-col gap-0.5">
                  <dt className="text-[11px] text-ink-muted">{k}</dt>
                  <dd className="m-0 truncate text-[13px] font-medium">{v}</dd>
                </div>
              ))}
            </dl>
            {error && (
              <span role="alert" className="text-[12.5px] font-medium text-attention">
                {error}
              </span>
            )}
            <div className="flex flex-col gap-2">
              {onTruck.get(open.id) && (
                <Link href={`/console?d=${onTruck.get(open.id)!.id}`} className={panelBtn} style={{ color: 'var(--ink)' }}>
                  Open delivery
                </Link>
              )}
              <button type="button" onClick={() => void remove(open)} disabled={busy} className={panelBtn} style={{ color: 'var(--attention)' }}>
                <Trash2 size={16} strokeWidth={2.2} aria-hidden="true" />
                Remove from fleet
              </button>
            </div>
          </div>
        </SidePanel>
      )}

      {open && panel?.kind === 'settings' && (
        <SidePanel title={`${open.plate_number} · settings`} onClose={() => setPanel({ kind: 'details', id: open.id })}>
          <TruckEdit
            truck={open}
            drivers={drivers}
            usualTruckOf={truckOf}
            onSaved={(u) => {
              qc.setQueryData<Truck[]>(TRUCKS_KEY, (ts) => ts?.map((x) => (x.id === u.id ? { ...x, status: u.status, driver_id: u.driver_id } : x)));
              void qc.invalidateQueries({ queryKey: TRUCKS_KEY });
            }}
            onClose={() => setPanel({ kind: 'details', id: open.id })}
          />
        </SidePanel>
      )}
    </div>
  );
}
