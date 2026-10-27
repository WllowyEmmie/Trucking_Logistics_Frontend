'use client';

import { MessageSquare, Phone, Settings, Trash2 } from 'lucide-react';
import Link from 'next/link';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { StatusPill } from '@/components/StatusPill';
import { telHref } from '@/components/tracking/TrackingPhone';
import { formatSince } from '@/lib/format';
import { BODY_LABEL, FUEL_LABEL, truckPicture, type TruckSpecs } from '@/lib/truckSpecs';
import type { DeliveryListItem, Driver, Truck } from '@/lib/types';

/**
 * One truck, the way a car maker shows a model: a big photo with the name over it, then its
 * numbers in a row (what it carries, how big it is, the year, fuel and body type). Under that, one
 * slim line: who drives it and what it's doing now. The photo is the truck's own when someone has
 * uploaded one, else a free stock photo of its body type, credited as its licence asks.
 */

interface Props {
  truck: Truck;
  specs: TruckSpecs | undefined;
  driver: Driver | undefined;
  current: DeliveryListItem | undefined;
  now: number;
  silent: boolean;
  busy: boolean;
  error?: string | null;
  onSettings: (e: ReactMouseEvent) => void;
  onRemove: () => void;
}

function Spec({ value, unit, label, onAdd }: { value: string | null; unit?: string; label: string; onAdd: (e: ReactMouseEvent) => void }) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-1 px-2 py-4 text-center">
      {value ? (
        <span className="text-[30px] leading-none font-light tracking-[-0.02em] tabular-nums sm:text-[34px]">
          {value}
          {unit && <span className="ms-1 text-[15px] font-normal text-ink-muted">{unit}</span>}
        </span>
      ) : (
        <button type="button" onClick={onAdd} className="h-[34px] rounded-lg border border-dashed border-border bg-transparent px-2.5 text-[12px] text-ink-muted hover:border-ink-subtle hover:text-ink" style={{ minHeight: 34 }}>
          Add
        </button>
      )}
      <span className="text-[12px] text-ink-muted">{label}</span>
    </div>
  );
}

export function TruckShowcase({ truck, specs, driver, current, now, silent, busy, error, onSettings, onRemove }: Props) {
  const pic = truckPicture(truck.id, specs);
  const t = specs?.capacity_kg != null ? (specs.capacity_kg / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 }) : null;
  const type = specs?.body_type ? BODY_LABEL[specs.body_type] : null;

  return (
    <div className="flex flex-col gap-3.5">
      <div className="overflow-hidden rounded-[22px] border border-divider bg-surface-100">
        {/* ---- The photo, with the name over it ---- */}
        <div className="relative aspect-[16/8] w-full bg-surface-300 sm:aspect-[16/7]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={pic.url} alt={`${truck.model || 'Truck'} ${truck.plate_number}`} className="absolute inset-0 h-full w-full object-cover" />
          <div className="pointer-events-none absolute inset-0" style={{ background: 'linear-gradient(180deg, rgb(0 0 0 / .55) 0%, rgb(0 0 0 / 0) 34%, rgb(0 0 0 / 0) 62%, rgb(0 0 0 / .55) 100%)' }} />
          <div className="absolute start-5 top-5 end-5 flex items-start justify-between gap-3 text-white">
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-[30px] leading-tight font-semibold tracking-[-0.02em] sm:text-[38px]">{truck.model || 'Truck'}</span>
              <span className="t-mono text-[15px] opacity-90">{truck.plate_number}</span>
            </div>
            <div className="flex flex-none gap-2">
              <button
                type="button"
                onClick={onSettings}
                aria-label={`Settings for ${truck.plate_number}`}
                title="Photo, details, status and driver"
                className="grid h-10 w-10 place-items-center rounded-xl border border-white/30 bg-black/35 text-white backdrop-blur hover:bg-black/50"
              >
                <Settings size={18} strokeWidth={2.2} aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={onRemove}
                disabled={busy}
                aria-label={`Remove ${truck.plate_number}`}
                title="Remove from the fleet"
                className="grid h-10 w-10 place-items-center rounded-xl border border-white/30 bg-black/35 text-white backdrop-blur hover:bg-black/50 disabled:opacity-45"
              >
                <Trash2 size={18} strokeWidth={2.2} aria-hidden="true" />
              </button>
            </div>
          </div>
          <div className="absolute start-5 bottom-4 flex items-center gap-2.5">
            <span className="rounded-lg bg-white/90 px-1 py-0.5">
              <StatusPill status={truck.status} size="sm" />
            </span>
            {type && <span className="rounded-lg bg-black/45 px-2.5 py-1 text-[12px] font-medium text-white backdrop-blur">{type}</span>}
          </div>
          {pic.stock && (
            <a href={pic.stock.page} target="_blank" rel="noreferrer" className="absolute end-3 bottom-3 rounded-md bg-black/45 px-2 py-0.5 text-[10.5px] no-underline backdrop-blur" style={{ color: 'rgb(255 255 255 / .85)' }}>
              Stock photo · {pic.stock.credit} · {pic.stock.license}
            </a>
          )}
        </div>

        {/* ---- The numbers ---- */}
        <div className="grid grid-cols-3 divide-x divide-divider border-t border-divider min-[1100px]:grid-cols-6">
          <Spec value={t} unit="t" label="Capacity" onAdd={onSettings} />
          <Spec value={specs?.body_length_m != null ? String(specs.body_length_m) : null} unit="m" label="Body length" onAdd={onSettings} />
          <Spec value={specs?.pallets != null ? String(specs.pallets) : null} label="Pallets" onAdd={onSettings} />
          <Spec value={specs?.year != null ? String(specs.year) : null} label="Year" onAdd={onSettings} />
          <Spec value={specs?.fuel ? FUEL_LABEL[specs.fuel] : null} label="Fuel" onAdd={onSettings} />
          <Spec value={type} label="Body type" onAdd={onSettings} />
        </div>
      </div>

      {error && (
        <span role="alert" className="text-[12.5px] font-medium text-attention">
          {error}
        </span>
      )}

      {/* ---- One line: who drives it, what it's doing ---- */}
      <div className="flex flex-wrap items-center gap-3 rounded-[18px] border border-divider bg-surface-100 px-4 py-3">
        {driver ? (
          <>
            <span className="grid h-9 w-9 flex-none place-items-center rounded-[11px] bg-brand text-[12px] font-semibold text-brand-ink">
              {driver.name
                .split(/\s+/)
                .slice(0, 2)
                .map((w) => w[0])
                .join('')}
            </span>
            <span className="flex min-w-0 flex-col leading-tight">
              <span className="truncate text-[14px] font-semibold">{driver.name}</span>
              <span className="text-[11.5px]" style={{ color: driver.on_shift ? 'var(--status-completed)' : 'var(--ink-muted)' }}>
                {driver.on_shift ? 'On shift' : 'Off shift'}
              </span>
            </span>
            <Link href={`/console/messages?driver=${driver.id}`} aria-label={`Message ${driver.name}`} className="grid h-9 w-9 place-items-center rounded-xl bg-brand no-underline" style={{ color: 'var(--brand-ink)' }}>
              <MessageSquare size={16} strokeWidth={2.4} aria-hidden="true" />
            </Link>
            <a href={telHref(driver.phone)} aria-label={`Call ${driver.name}`} className="grid h-9 w-9 place-items-center rounded-xl border border-border no-underline hover:border-ink-subtle" style={{ color: 'var(--ink)' }}>
              <Phone size={16} strokeWidth={2.4} aria-hidden="true" />
            </a>
          </>
        ) : (
          <button type="button" onClick={onSettings} className="h-9 rounded-xl border-0 bg-brand px-3 text-[12.5px] font-semibold text-brand-ink">
            Give it a driver
          </button>
        )}
        <span className="ms-auto flex flex-wrap items-center gap-3 text-[12.5px]">
          {current ? (
            <Link href={`/console?d=${current.id}`} className="flex items-center gap-2 rounded-xl border border-divider px-3 py-1.5 no-underline hover:border-ink-subtle" style={{ color: 'var(--ink)' }}>
              <span className="t-mono font-medium whitespace-nowrap">{current.reference}</span>
              <StatusPill status={current.status} size="sm" />
            </Link>
          ) : (
            <span className="text-ink-muted">No delivery now</span>
          )}
          <span style={{ color: silent ? 'var(--attention)' : 'var(--ink-muted)' }}>Position {truck.last_seen_at ? `${formatSince(truck.last_seen_at, now)} ago` : 'not yet'}</span>
        </span>
      </div>
    </div>
  );
}
