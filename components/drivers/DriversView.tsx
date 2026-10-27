'use client';

import { useQueryClient } from '@tanstack/react-query';
import { KeyRound, MessageSquare, Phone, Plus, Search, Settings, Trash2, Truck as TruckIcon, X } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { FloatCard } from '@/components/console/FloatCard';
import { AddDriverForm } from '@/components/fleet/AddDriverForm';
import { DriverPinEdit } from '@/components/fleet/DriverPinEdit';
import { StatusPill } from '@/components/StatusPill';
import { telHref } from '@/components/tracking/TrackingPhone';
import { del, post } from '@/lib/api';
import { useConfig } from '@/lib/config';
import { DRIVERS_KEY, useDeliveries, useDrivers } from '@/lib/deliveries';
import { activeByTruck } from '@/lib/exceptions';
import { formatDuration, formatWhen, minutesSince } from '@/lib/format';
import { useThreads } from '@/lib/messages';
import { TRUCKS_KEY, usePositions } from '@/lib/positions';
import type { DeliveryListItem, Driver, Truck } from '@/lib/types';
import { useNow } from '@/lib/useNow';
import { confirmDialog } from '@/components/Confirm';

/**
 * Drivers, laid out like Fleet: the drivers on the left (search, state tabs, a card each with its
 * settings gear, Add driver at the bottom) and a board on the right. With nobody picked it's the
 * team at a glance (counts, who needs a look, longest on shift); with a driver picked it's them:
 * truck, current delivery, shift, messages, and Message / Call. Settings (PIN, end shift, remove)
 * open in a small card beside the list. Which truck someone drives is set on the truck, in Fleet.
 */

type State = 'Driving' | 'On shift' | 'Off duty';
type Filter = 'all' | State;
const STATES: State[] = ['Driving', 'On shift', 'Off duty'];
/** A guide for the shift bar, not a legal limit. */
const SHIFT_GUIDE_MIN = 12 * 60;
const LONG_SHIFT_MIN = 10 * 60;
const AV = ['#FFCF33', '#B9D7FF', '#C9F2D6', '#FFD6C2', '#E4D7FF', '#F2F2EF'];
const TONE: Record<State, { fg: string; bg: string }> = {
  Driving: { fg: 'var(--status-transit)', bg: 'var(--status-transit-bg)' },
  'On shift': { fg: 'var(--status-completed)', bg: 'var(--status-completed-bg)' },
  'Off duty': { fg: 'var(--ink-muted)', bg: 'var(--surface-200)' },
};

const initials = (n: string) =>
  n
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');

function Badge({ state }: { state: State }) {
  const t = TONE[state];
  return (
    <span className="flex-none rounded-[7px] border px-2 py-0.5 text-[11.5px] font-medium whitespace-nowrap" style={{ color: t.fg, background: t.bg, borderColor: `color-mix(in srgb, ${t.fg} 35%, transparent)` }}>
      {state}
    </span>
  );
}

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

const bigBtn =
  'flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-surface-100 px-3 text-[13px] font-medium no-underline hover:border-ink-subtle disabled:opacity-45';
const panelBtn =
  'flex h-11 items-center justify-center gap-2 rounded-xl border border-border bg-surface-100 px-3 text-[13px] font-medium text-ink hover:border-ink-subtle disabled:opacity-45';

interface Row {
  d: Driver;
  i: number;
  truck: Truck | undefined;
  delivery: DeliveryListItem | undefined;
  state: State;
  shiftMin: number;
}

export function DriversView() {
  const config = useConfig();
  const qc = useQueryClient();
  const now = useNow(60_000);
  const driversQ = useDrivers();
  const drivers = driversQ.data ?? [];
  const trucks = usePositions().data ?? [];
  const deliveries = useDeliveries().data ?? [];
  const threads = useThreads().data ?? [];
  const onTruck = useMemo(() => activeByTruck(deliveries), [deliveries]);

  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [selId, setSelId] = useState<string | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);
  const [panel, setPanel] = useState<{ kind: 'add' | 'settings' | 'pin'; id?: string; at: DOMRect } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Cards open just right of the list, at its bottom (like Fleet).
  const listPane = useRef<HTMLElement>(null);
  const at = (e: ReactMouseEvent) => (listPane.current ?? (e.currentTarget as HTMLElement)).getBoundingClientRect();

  const rows: Row[] = drivers.map((d, i) => {
    const truck = trucks.find((t) => t.driver_id === d.id);
    const delivery = truck ? onTruck.get(truck.id) : undefined;
    const state: State = d.on_shift ? (delivery?.status === 'in_transit' ? 'Driving' : 'On shift') : 'Off duty';
    const shiftMin = d.on_shift && d.shift_since ? minutesSince(d.shift_since, now) : 0;
    return { d, i, truck, delivery, state, shiftMin };
  });
  const needle = q.trim().toLowerCase();
  const list = rows
    .filter((r) => filter === 'all' || r.state === filter)
    .filter((r) => !needle || `${r.d.name} ${r.d.phone} ${r.truck?.plate_number ?? ''}`.toLowerCase().includes(needle))
    .sort((a, b) => Number(b.d.id === fresh) - Number(a.d.id === fresh) || STATES.indexOf(a.state) - STATES.indexOf(b.state) || a.d.name.localeCompare(b.d.name));
  const sel = selId ? rows.find((r) => r.d.id === selId) : undefined;
  const panelDriver = panel?.id ? drivers.find((d) => d.id === panel.id) : undefined;

  const closePanel = () => {
    setPanel(null);
    setError(null);
  };
  async function act(what: () => Promise<unknown>, after?: () => void) {
    setBusy(true);
    setError(null);
    try {
      await what();
      after?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
      void qc.invalidateQueries({ queryKey: DRIVERS_KEY });
      void qc.invalidateQueries({ queryKey: TRUCKS_KEY });
    }
  }
  const endShift = async (d: Driver) => {
    const ok = await confirmDialog({ title: `End ${d.name}'s shift?`, body: 'Their phone stops sharing its location.', confirm: 'End shift' });
    if (ok) void act(() => post(`/drivers/${encodeURIComponent(d.id)}/shift/end`));
  };
  const removeDriver = async (d: Driver) => {
    const ok = await confirmDialog({
      title: `Remove ${d.name}?`,
      body: "They're signed out, their truck is left without a driver, and their messages are deleted. This can't be undone.",
      confirm: 'Remove driver',
      danger: true,
    });
    if (ok)
      void act(
        () => del(`/drivers/${encodeURIComponent(d.id)}`),
        () => {
          closePanel();
          setSelId(null);
        },
      );
  };

  // ---- The board with nobody picked ----
  const look = rows
    .map((r) => {
      if (r.d.on_shift && r.shiftMin > LONG_SHIFT_MIN) return { r, why: `On shift ${formatDuration(r.shiftMin)}`, tone: 'var(--status-failed)' };
      if (r.d.on_shift && !r.truck) return { r, why: 'On shift with no truck', tone: 'var(--status-assigned)' };
      if (!r.d.has_pin) return { r, why: "Can't sign in: no PIN yet", tone: 'var(--status-assigned)' };
      const unread = threads.find((t) => t.driver_id === r.d.id)?.unread ?? 0;
      if (unread) return { r, why: `${unread} unread message${unread === 1 ? '' : 's'}`, tone: 'var(--brand)' };
      return null;
    })
    .filter((x): x is NonNullable<typeof x> => !!x);
  const longest = rows.filter((r) => r.d.on_shift).sort((a, b) => b.shiftMin - a.shiftMin).slice(0, 6);
  const maxShift = Math.max(SHIFT_GUIDE_MIN, ...longest.map((r) => r.shiftMin));

  const overview = (
    <div className="flex flex-col gap-3.5">
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
        {STATES.map((s) => (
          <button key={s} type="button" onClick={() => setFilter(s)} className="flex flex-col items-start gap-1.5 rounded-[20px] border border-divider bg-surface-100 p-4 text-start text-ink hover:border-ink-subtle">
            <span className="text-[40px] leading-none font-light tracking-[-0.03em] tabular-nums">{rows.filter((r) => r.state === s).length}</span>
            <Badge state={s} />
          </button>
        ))}
      </div>
      <div className="grid gap-3.5 min-[1100px]:grid-cols-2">
        <Card title={`Needs a look · ${look.length}`}>
          {look.length === 0 && <span className="text-[13px] text-ink-muted">Everyone&apos;s fine.</span>}
          <div className="flex flex-col gap-1">
            {look.slice(0, 8).map(({ r, why, tone }) => (
              <button key={r.d.id} type="button" onClick={() => setSelId(r.d.id)} className="flex items-center gap-2.5 rounded-xl px-2 py-2 text-start text-ink hover:bg-surface-200" style={{ minHeight: 0 }}>
                <i className="h-2 w-2 flex-none rounded-full" style={{ background: tone }} />
                <span className="w-[130px] flex-none truncate text-[13px] font-medium">{r.d.name}</span>
                <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-muted">{why}</span>
              </button>
            ))}
          </div>
        </Card>
        <Card title="Longest on shift">
          {longest.length === 0 && <span className="text-[13px] text-ink-muted">Nobody is on shift.</span>}
          <div className="flex flex-col gap-2.5">
            {longest.map((r) => (
              <div key={r.d.id} className="flex items-center gap-2.5 text-[12.5px]">
                <span className="w-[110px] flex-none truncate font-medium">{r.d.name}</span>
                <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-300">
                  <span className="block h-full rounded-full" style={{ width: `${(r.shiftMin / maxShift) * 100}%`, background: r.shiftMin > LONG_SHIFT_MIN ? 'var(--status-failed)' : 'var(--brand)' }} />
                </span>
                <span className="flex-none text-end whitespace-nowrap tabular-nums">{formatDuration(r.shiftMin)}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );

  // ---- The board with a driver picked ----
  const detail = (r: Row) => {
    const { d, truck, delivery, state, shiftMin } = r;
    const th = threads.find((t) => t.driver_id === d.id);
    const pct = Math.min(100, Math.round((shiftMin / SHIFT_GUIDE_MIN) * 100));
    return (
      <div className="flex flex-col gap-3.5">
        <div className="flex flex-wrap items-center gap-3 rounded-[20px] border border-divider bg-surface-100 p-4">
          <span className="grid h-12 w-12 flex-none place-items-center rounded-[14px] text-[15px] font-semibold text-[#151515]" style={{ background: AV[r.i % AV.length] }}>
            {initials(d.name)}
          </span>
          <div className="flex min-w-0 flex-1 flex-col leading-tight">
            <span className="truncate text-[20px] font-semibold">{d.name}</span>
            <span className="t-mono text-[12.5px] text-ink-muted">{d.phone}</span>
          </div>
          <Badge state={state} />
          <button type="button" onClick={(e) => setPanel({ kind: 'settings', id: d.id, at: at(e) })} aria-label={`Settings for ${d.name}`} title="PIN, shift, remove" className="grid h-10 w-10 place-items-center rounded-xl border border-border bg-surface-100 text-ink hover:border-ink-subtle">
            <Settings size={18} strokeWidth={2.2} aria-hidden="true" />
          </button>
          <button type="button" onClick={() => setSelId(null)} aria-label="Back to all drivers" className="grid h-10 w-10 place-items-center rounded-xl border-0 bg-transparent text-ink hover:bg-surface-200">
            <X size={18} strokeWidth={2.2} aria-hidden="true" />
          </button>
        </div>

        {/* Contact first: what a dispatcher reaches for. */}
        <div className="flex gap-2.5">
          <Link href={`/console/messages?driver=${d.id}`} className={`${bigBtn} border-0 bg-brand`} style={{ color: 'var(--brand-ink)' }}>
            <MessageSquare size={18} strokeWidth={2.2} aria-hidden="true" />
            Message
            {th && th.unread > 0 && <span className="rounded-md bg-black/15 px-1.5 text-[11px]">{th.unread} new</span>}
          </Link>
          <a href={telHref(d.phone)} className={bigBtn} style={{ color: 'var(--ink)' }}>
            <Phone size={18} strokeWidth={2.2} aria-hidden="true" />
            Call {d.phone}
          </a>
        </div>

        <div className="grid gap-3.5 min-[1100px]:grid-cols-3">
          <Card title="Truck">
            {truck ? (
              <Link href="/console/fleet" className="flex items-center gap-2.5 rounded-xl border border-divider bg-surface-200 p-3 no-underline hover:border-ink-subtle" style={{ color: 'var(--ink)' }}>
                <span className="grid h-9 w-9 flex-none place-items-center rounded-[11px] border border-border bg-surface-100 text-ink">
                  <TruckIcon size={17} strokeWidth={2.2} aria-hidden="true" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col leading-tight">
                  <span className="t-mono truncate text-[13.5px] font-medium">{truck.plate_number}</span>
                  <span className="truncate text-[11.5px] text-ink-muted">{truck.model || 'Model not given'}</span>
                </span>
              </Link>
            ) : (
              <span className="text-[13px] text-ink-muted">No truck. Give them one from a truck&apos;s settings on Fleet.</span>
            )}
          </Card>
          <Card title="Now">
            {delivery ? (
              <Link href={`/console?d=${delivery.id}`} className="flex flex-col gap-1.5 rounded-xl border border-divider bg-surface-200 p-3 no-underline hover:border-ink-subtle" style={{ color: 'var(--ink)' }}>
                <span className="flex items-center justify-between gap-2">
                  <span className="t-mono truncate text-[13px] font-medium whitespace-nowrap">{delivery.reference}</span>
                  <StatusPill status={delivery.status} size="sm" />
                </span>
                <span className="truncate text-[12.5px] text-ink-muted">{delivery.customer_name}</span>
              </Link>
            ) : (
              <span className="text-[13px] text-ink-muted">No active delivery.</span>
            )}
          </Card>
          <Card
            title="Shift"
            action={
              d.on_shift ? (
                <button type="button" onClick={() => endShift(d)} disabled={busy} className="h-8 rounded-lg border border-border bg-surface-100 px-2.5 text-[12px] font-medium text-ink hover:border-ink-subtle" style={{ minHeight: 32 }}>
                  End shift
                </button>
              ) : undefined
            }
          >
            {d.on_shift ? (
              <>
                <div className="flex justify-between text-[12.5px]">
                  <span className="text-ink-muted">Since {d.shift_since ? formatWhen(d.shift_since, config.timezone, config.locale) : '—'}</span>
                  <span className="font-medium">{formatDuration(shiftMin)}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-surface-300">
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, background: shiftMin > LONG_SHIFT_MIN ? 'var(--status-failed)' : 'var(--brand)' }} />
                </div>
              </>
            ) : (
              <span className="text-[13px] text-ink-muted">Off shift. They start one in the driver app.</span>
            )}
          </Card>
        </div>

        <Card
          title="Messages"
          action={
            <Link href={`/console/messages?driver=${d.id}`} className="text-[12px] font-medium no-underline hover:underline" style={{ color: 'var(--ink)' }}>
              Open thread →
            </Link>
          }
        >
          {th ? (
            <div className="flex flex-col gap-1 rounded-xl bg-surface-200 p-3">
              <span className="text-[13px]">
                <b className="font-semibold">{th.last.from_driver ? d.name.split(' ')[0] : 'You'}:</b> {th.last.body}
              </span>
              <span className="text-[11px] text-ink-muted">{formatWhen(th.last.created_at, config.timezone, config.locale, new Date(now))}</span>
            </div>
          ) : (
            <span className="text-[13px] text-ink-muted">No messages yet.</span>
          )}
        </Card>
      </div>
    );
  };

  return (
    <div className="flex h-full min-h-[560px] flex-col bg-surface-100 text-ink min-[900px]:flex-row min-[900px]:overflow-hidden">
      {/* ---- The drivers ---- */}
      <section ref={listPane} className="flex min-h-0 flex-col min-[900px]:w-[380px] min-[900px]:flex-none">
        <div className="flex flex-none flex-col gap-3.5 px-[18px] pt-[22px] pb-1">
          <div className="flex items-baseline justify-between gap-2">
            <h1 className="m-0 text-[22px] font-semibold tracking-[-0.01em]">Drivers</h1>
            <span className="text-[12px] text-ink-muted">
              {drivers.length} drivers · {rows.filter((r) => r.d.on_shift).length} on shift
            </span>
          </div>
          <label className="flex h-11 items-center gap-2.5 rounded-[14px] border border-border bg-surface-100 px-3.5">
            <Search size={17} strokeWidth={2.2} className="flex-none text-ink" aria-hidden="true" />
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, phone or truck" aria-label="Search drivers" className="min-w-0 flex-1 border-0 bg-transparent text-[13px] text-ink outline-none" />
          </label>
          <div className="flex gap-0.5 overflow-x-auto rounded-[14px] border border-border bg-surface-100 p-1 [&>*]:flex-none">
            {(['all', ...STATES] as const).map((k) => {
              const on = filter === k;
              const n = k === 'all' ? rows.length : rows.filter((r) => r.state === k).length;
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
                  {k === 'all' ? 'All' : k}
                  <span className="rounded-md px-1.5 text-[10.5px]" style={{ background: on ? 'rgb(0 0 0 / .1)' : 'var(--surface-200)' }}>
                    {n}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <ul className="m-0 flex min-h-0 flex-1 list-none flex-col gap-2.5 overflow-y-auto px-3 py-3">
          {list.map((r) => {
            const on = r.d.id === selId;
            const unread = threads.find((t) => t.driver_id === r.d.id)?.unread ?? 0;
            return (
              <li
                key={r.d.id}
                className="flex flex-none flex-col gap-3 rounded-[18px] border p-3.5 transition-shadow"
                style={{
                  borderColor: on ? 'var(--ink)' : fresh === r.d.id ? 'var(--status-completed)' : 'var(--divider)',
                  background: on ? 'var(--surface-100)' : 'var(--surface-200)',
                  boxShadow: on ? 'var(--shadow-card)' : 'none',
                }}
              >
                <div className="flex items-center gap-2.5">
                  <button type="button" onClick={() => setSelId(on ? null : r.d.id)} aria-pressed={on} className="flex min-w-0 flex-1 items-center gap-2.5 border-0 bg-transparent p-0 text-start text-ink" style={{ minHeight: 0 }}>
                    <span className="grid h-9 w-9 flex-none place-items-center rounded-[11px] text-[12.5px] font-semibold text-[#151515]" style={{ background: AV[r.i % AV.length] }}>
                      {initials(r.d.name)}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col leading-tight">
                      <span className="truncate text-[14.5px] font-medium">{r.d.name}</span>
                      <span className="t-mono truncate text-[11.5px] text-ink-muted">{r.d.phone}</span>
                    </span>
                    <Badge state={r.state} />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => setPanel({ kind: 'settings', id: r.d.id, at: at(e) })}
                    aria-label={`Settings for ${r.d.name}`}
                    title="PIN, shift, remove"
                    className="grid h-8 w-8 flex-none place-items-center rounded-lg border border-border bg-surface-100 text-ink hover:border-ink-subtle"
                    style={{ minHeight: 32, minWidth: 32 }}
                  >
                    <Settings size={16} strokeWidth={2.2} aria-hidden="true" />
                  </button>
                </div>
                <button type="button" onClick={() => setSelId(on ? null : r.d.id)} className="flex items-center gap-2.5 border-0 border-t border-divider bg-transparent p-0 pt-2.5 text-start text-[12px] text-ink" style={{ minHeight: 0 }}>
                  <TruckIcon size={15} strokeWidth={2.2} className="flex-none" aria-hidden="true" />
                  <span className="t-mono min-w-0 flex-1 truncate">{r.truck?.plate_number ?? 'No truck'}</span>
                  {unread > 0 && (
                    <span className="flex flex-none items-center gap-1 rounded-md bg-brand px-1.5 text-[11px] font-medium text-brand-ink">
                      <MessageSquare size={11} strokeWidth={2.4} aria-hidden="true" />
                      {unread}
                    </span>
                  )}
                  <span className="flex-none text-ink-muted">{r.delivery ? r.delivery.reference : r.d.on_shift ? formatDuration(r.shiftMin) : 'Off'}</span>
                </button>
              </li>
            );
          })}
          {drivers.length > 0 && list.length === 0 && <li className="p-6 text-center text-[13px] text-ink-muted">No drivers match.</li>}
          {!driversQ.isPending && drivers.length === 0 && <li className="p-6 text-center text-[13px] text-ink-muted">No drivers yet. Add the first one.</li>}
        </ul>

        <div className="flex-none px-[18px] pt-2 pb-[18px]">
          <button type="button" onClick={(e) => setPanel({ kind: 'add', at: at(e) })} className="flex h-12 w-full items-center justify-center gap-2 rounded-[14px] border-0 bg-ink text-[14px] font-medium text-surface-100 hover:opacity-90">
            <Plus size={18} strokeWidth={2.4} aria-hidden="true" />
            Add driver
          </button>
        </div>
      </section>

      {/* ---- The board ---- */}
      <section className="min-h-0 min-w-0 flex-1 p-3 min-[900px]:ps-0">
        <div className="h-full overflow-y-auto rounded-[18px] border border-divider bg-surface-200 p-4 pb-24 sm:p-5 sm:pb-24">{sel ? detail(sel) : overview}</div>
      </section>

      {panel?.kind === 'add' && (
        <FloatCard place="beside" anchor={panel.at} title="Add a driver" onClose={closePanel}>
          <AddDriverForm
            trucks={trucks}
            onAdded={(nd, truck) => {
              qc.setQueryData<Driver[]>(DRIVERS_KEY, (ds) => [nd, ...(ds ?? []).filter((x) => x.id !== nd.id)]);
              void qc.invalidateQueries({ queryKey: DRIVERS_KEY });
              if (truck) void qc.invalidateQueries({ queryKey: TRUCKS_KEY });
              setFresh(nd.id);
              setSelId(nd.id);
              setFilter('all');
              setQ('');
            }}
          />
        </FloatCard>
      )}
      {panel?.kind === 'pin' && panelDriver && (
        <FloatCard place="beside" anchor={panel.at} title={`${panelDriver.has_pin ? 'Reset' : 'Set'} ${panelDriver.name}'s PIN`} onClose={() => setPanel({ kind: 'settings', id: panelDriver.id, at: panel.at })}>
          <DriverPinEdit driver={panelDriver} onSaved={() => void qc.invalidateQueries({ queryKey: DRIVERS_KEY })} onClose={() => setPanel({ kind: 'settings', id: panelDriver.id, at: panel.at })} />
        </FloatCard>
      )}
      {panel?.kind === 'settings' && panelDriver && (
        <FloatCard place="beside" anchor={panel.at} title={`${panelDriver.name} · settings`} onClose={closePanel}>
          <div className="flex flex-col gap-2.5 p-4">
            <div className="flex justify-between text-[12.5px]">
              <span className="text-ink-muted">Driver app</span>
              <span className="font-medium" style={{ color: panelDriver.has_pin ? undefined : 'var(--attention)' }}>
                {panelDriver.has_pin ? 'Can sign in' : 'No PIN yet'}
              </span>
            </div>
            {error && (
              <span role="alert" className="text-[12.5px] font-medium text-attention">
                {error}
              </span>
            )}
            <button type="button" onClick={() => setPanel({ kind: 'pin', id: panelDriver.id, at: panel.at })} className={panelBtn}>
              <KeyRound size={16} strokeWidth={2.2} aria-hidden="true" />
              {panelDriver.has_pin ? 'Reset PIN' : 'Set PIN'}
            </button>
            <button type="button" onClick={() => endShift(panelDriver)} disabled={!panelDriver.on_shift || busy} className={panelBtn}>
              End shift
            </button>
            <button type="button" onClick={() => removeDriver(panelDriver)} disabled={busy} className={panelBtn} style={{ color: 'var(--attention)' }}>
              <Trash2 size={16} strokeWidth={2.2} aria-hidden="true" />
              Remove driver
            </button>
            <span className="text-[11.5px] text-ink-muted">Which truck they drive is set on the truck, in Fleet.</span>
          </div>
        </FloatCard>
      )}
    </div>
  );
}
