'use client';

import { MessageSquare, Phone, Settings, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useMemo } from 'react';
import { DispatchMap, type LatLng, type MapStop } from '@/components/map';
import { StatusPill } from '@/components/StatusPill';
import { telHref } from '@/components/tracking/TrackingPhone';
import type { AppConfig } from '@/lib/config';
import { hasLatLng, stopDone, useDeliveryDetail } from '@/lib/deliveries';
import { formatSince, formatTime, formatWhen } from '@/lib/format';
import { STATUS_LABEL } from '@/lib/labels';
import type { DeliveryListItem, DeliveryStatus, Driver, Truck } from '@/lib/types';
import { useDark } from '@/lib/useDark';

/**
 * One truck, as a picture: the truck drawn side on with its trailer split into cells, one per
 * delivery (the current one in yellow, then the last 7 days), floating tags for the driver and the
 * week, and its specs beside the cab. Underneath: the current delivery's route on a small map with
 * its stops as a timeline, and the truck's delivery list. (Layout after a reference the operator
 * liked; the truck drawing is our own.)
 */

export interface TruckRow {
  reference: string;
  customer_name: string;
  status: DeliveryStatus;
  created_at: string;
  finished_at: string | null;
}

interface Props {
  truck: Truck;
  driver: Driver | undefined;
  current: DeliveryListItem | undefined;
  recent: TruckRow[];
  week: { completed: number; failed: number; cancelled: number } | undefined;
  config: AppConfig;
  now: number;
  silent: boolean;
  busy: boolean;
  /** A refused remove or change, word for word. */
  error?: string | null;
  onSettings: (e: React.MouseEvent) => void;
  onRemove: () => void;
}

const CELLS = 10;

/**
 * Our own side-on truck in one drawing (viewBox 1000×400): tractor on the left, the trailer's
 * outline on the right (its cells are HTML laid over it, see TRAILER), chassis and wheels.
 * The top quarter is left empty for the floating tags.
 */
const TRAILER = { left: '29%', top: '27.5%', width: '70%', height: '50%' };

function TruckDrawing({ dark }: { dark: boolean }) {
  const body = dark ? '#e9e9e5' : '#f6f6f3';
  const edge = dark ? '#8a8a86' : '#b9b9b4';
  const glass = dark ? '#2b3440' : '#3a4654';
  const steel = dark ? '#3a3a3a' : '#2a2a2a';
  const hub = dark ? '#9a9a96' : '#c9c9c4';
  const wheel = (cx: number) => (
    <g key={cx}>
      <circle cx={cx} cy="352" r="36" fill="#161616" />
      <circle cx={cx} cy="352" r="18" fill={hub} />
      <circle cx={cx} cy="352" r="6" fill="#161616" />
    </g>
  );
  return (
    <svg viewBox="0 0 1000 400" className="absolute inset-0 h-full w-full" aria-hidden="true">
      <ellipse cx="510" cy="390" rx="480" ry="8" fill="#000" opacity={dark ? 0.35 : 0.08} />
      {/* chassis and coupling */}
      <rect x="40" y="310" width="950" height="16" rx="4" fill={steel} />
      {/* trailer box (cells are laid over it) */}
      <rect x="286" y="106" width="708" height="208" rx="10" fill={dark ? '#262626' : '#fbfbf9'} stroke={edge} strokeWidth="5" />
      {/* tractor */}
      <path d="M60 320 V184 Q60 142 102 136 L204 128 Q228 127 236 150 L266 250 Q272 266 272 286 V320 Z" fill={body} stroke={edge} strokeWidth="4" />
      <path d="M102 136 Q152 98 210 102 L204 128 Z" fill={body} stroke={edge} strokeWidth="4" />
      <path d="M210 150 L232 152 L254 240 L218 240 Z" fill={glass} />
      <rect x="132" y="156" width="64" height="66" rx="8" fill={glass} />
      <path d="M122 146 V316" stroke={edge} strokeWidth="3" />
      <rect x="172" y="250" width="20" height="6" rx="3" fill={edge} />
      <rect x="80" y="288" width="36" height="9" rx="3" fill={edge} />
      <rect x="266" y="282" width="16" height="36" rx="4" fill={edge} />
      <rect x="264" y="260" width="12" height="12" rx="3" fill="#FFCF33" />
      <rect x="138" y="292" width="74" height="24" rx="12" fill={dark ? '#cfcfca' : '#e2e2dd'} stroke={edge} strokeWidth="2" />
      {[112, 232, 760, 846, 932].map(wheel)}
    </svg>
  );
}

const pos = (x: { lat: number; lng: number }): LatLng => ({ lat: x.lat, lng: x.lng });

export function TruckBoard({ truck, driver, current, recent, week, config, now, silent, busy, error, onSettings, onRemove }: Props) {
  const dark = useDark();
  const tz = config.timezone;
  const detailQ = useDeliveryDetail(current?.id ?? null, 30_000);
  const stops = detailQ.data?.stops ?? [];
  const eta = new Map((detailQ.data?.eta?.stops ?? []).map((x) => [x.stop_id, x.at]));

  // The trailer's cells: the current delivery, then the last 7 days, newest first.
  const cells = useMemo(() => {
    const list: { ref: string; who: string; status: DeliveryStatus; when: string; now: boolean }[] = [];
    if (current) list.push({ ref: current.reference, who: current.customer_name, status: current.status, when: 'Now', now: true });
    for (const r of recent) {
      if (list.length >= CELLS) break;
      if (r.reference === current?.reference) continue;
      list.push({ ref: r.reference, who: r.customer_name, status: r.status, when: formatWhen(r.finished_at ?? r.created_at, tz, config.locale, new Date(now)), now: false });
    }
    return list;
  }, [current, recent, tz, config.locale, now]);
  const done = week?.completed ?? 0;
  const judged = done + (week?.failed ?? 0);
  const rate = judged ? Math.round((done / judged) * 100) : null;

  const sStops = stops.filter(hasLatLng);
  const mapStops: MapStop[] = sStops.map((s) => ({ id: s.id, n: s.sequence, kind: s.stop_type, lat: s.lat!, lng: s.lng!, done: stopDone(s), address: s.address }));
  const tPos = truck.lat != null && truck.lng != null ? { lat: truck.lat, lng: truck.lng } : null;
  const route =
    current?.status === 'in_transit' && tPos
      ? { travelled: [...sStops.filter(stopDone).map((s) => pos({ lat: s.lat!, lng: s.lng! })), tPos], remaining: [tPos, ...sStops.filter((s) => !stopDone(s)).map((s) => pos({ lat: s.lat!, lng: s.lng! }))] }
      : { travelled: [], remaining: sStops.map((s) => pos({ lat: s.lat!, lng: s.lng! })) };
  const fitPoints = [...sStops.map((s) => pos({ lat: s.lat!, lng: s.lng! })), ...(tPos ? [tPos] : [])];

  const tag = 'absolute z-[2] flex flex-col gap-1 rounded-2xl border border-divider bg-surface-100 px-3.5 py-2.5 text-ink';
  const tagShadow = { boxShadow: 'var(--shadow-card)' };

  return (
    <div className="flex flex-col gap-3.5">
      {/* ---- The truck ---- */}
      <div className="relative overflow-hidden rounded-[22px] border border-divider bg-surface-100 px-5 pt-5 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-wrap items-end gap-x-8 gap-y-2">
            <div className="flex flex-col">
              <span className="text-[11px] text-ink-muted">Plate</span>
              <span className="t-mono text-[22px] leading-tight font-semibold">{truck.plate_number}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[11px] text-ink-muted">Model</span>
              <span className="text-[14px] font-medium">{truck.model || 'Not given'}</span>
            </div>
            <div className="flex flex-col items-start gap-1">
              <span className="text-[11px] text-ink-muted">Status</span>
              <StatusPill status={truck.status} size="sm" />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={onSettings} aria-label={`Settings for ${truck.plate_number}`} title="Status and usual driver" className="grid h-10 w-10 place-items-center rounded-xl border border-border bg-surface-100 text-ink hover:border-ink-subtle">
              <Settings size={18} strokeWidth={2.2} aria-hidden="true" />
            </button>
            <button type="button" onClick={onRemove} disabled={busy} aria-label={`Remove ${truck.plate_number}`} title="Remove from the fleet" className="grid h-10 w-10 place-items-center rounded-xl border border-border bg-surface-100 hover:border-ink-subtle disabled:opacity-45" style={{ color: 'var(--attention)' }}>
              <Trash2 size={18} strokeWidth={2.2} aria-hidden="true" />
            </button>
          </div>
        </div>

        {error && (
          <span role="alert" className="mt-2 block text-[12.5px] font-medium text-attention">
            {error}
          </span>
        )}
        {/* The drawing: cab on the left, trailer cells on the right, tags floating over it. */}
        <div className="relative mx-auto mt-6 w-full max-w-[980px]" style={{ aspectRatio: '1000 / 400' }}>
          <TruckDrawing dark={dark} />
          {/* driver tag, above the cab */}
          <div className={`${tag} start-[1%] top-[0%] min-w-[150px]`} style={tagShadow}>
            {driver ? (
              <>
                <span className="text-[13px] font-semibold">{driver.name}</span>
                <span className="flex items-center gap-1.5 text-[11px]" style={{ color: driver.on_shift ? 'var(--status-completed)' : 'var(--ink-muted)' }}>
                  <i className="h-1.5 w-1.5 rounded-full bg-current" />
                  {driver.on_shift ? 'On shift' : 'Off shift'}
                </span>
                <span className="flex gap-1.5 pt-1">
                  <Link href={`/console/messages?driver=${driver.id}`} aria-label={`Message ${driver.name}`} className="grid h-7 w-7 place-items-center rounded-lg bg-brand no-underline" style={{ color: 'var(--brand-ink)' }}>
                    <MessageSquare size={14} strokeWidth={2.4} aria-hidden="true" />
                  </Link>
                  <a href={telHref(driver.phone)} aria-label={`Call ${driver.name}`} className="grid h-7 w-7 place-items-center rounded-lg border border-border no-underline" style={{ color: 'var(--ink)' }}>
                    <Phone size={14} strokeWidth={2.4} aria-hidden="true" />
                  </a>
                  <button type="button" onClick={onSettings} className="h-7 rounded-lg border border-border bg-transparent px-2 text-[11px] font-medium text-ink" style={{ minHeight: 28 }}>
                    Change
                  </button>
                </span>
              </>
            ) : (
              <>
                <span className="text-[13px] font-semibold">No driver</span>
                <button type="button" onClick={onSettings} className="h-7 self-start rounded-lg bg-brand px-2.5 text-[11px] font-semibold text-brand-ink" style={{ minHeight: 28, border: 0 }}>
                  Give it a driver
                </button>
              </>
            )}
          </div>
          {/* the week, above the trailer */}
          <div className={`${tag} end-[1%] top-[0%]`} style={tagShadow}>
            <span className="text-[11px] text-ink-muted">Last 7 days</span>
            <span className="text-[13px] font-semibold">
              {done} delivered{rate !== null ? ` · ${rate}% done` : ''}
            </span>
            <span className="text-[11px]" style={{ color: silent ? 'var(--attention)' : 'var(--ink-muted)' }}>
              Position {truck.last_seen_at ? `${formatSince(truck.last_seen_at, now)} ago` : 'not yet'}
            </span>
          </div>

          {/* the trailer's cells, laid over the drawn box */}
          <div
            className="absolute z-[1] grid gap-[4px] p-[6px]"
            style={{ ...TRAILER, gridTemplateColumns: 'repeat(5, 1fr)', gridTemplateRows: 'repeat(2, 1fr)' }}
          >
            {Array.from({ length: CELLS }, (_, i) => {
              const c = cells[i];
              if (!c)
                return (
                  <div key={i} aria-hidden="true" className="rounded-[6px] border border-dashed" style={{ borderColor: 'var(--divider)' }} />
                );
              return (
                <div
                  key={c.ref}
                  title={`${c.ref} · ${c.who} · ${STATUS_LABEL[c.status]}`}
                  className="flex min-w-0 flex-col justify-between overflow-hidden rounded-[6px] p-2"
                  style={c.now ? { background: 'var(--brand)', color: 'var(--brand-ink)' } : { background: 'var(--surface-200)', border: '1px solid var(--divider)', color: 'var(--ink)' }}
                >
                  <span className="t-mono truncate text-[11px] font-semibold">{c.ref.replace(/^DEL-\d{4}-/, '#')}</span>
                  <span className="truncate text-[11.5px] font-medium">{c.who}</span>
                  <span className="truncate text-[10.5px] opacity-70">{c.now ? STATUS_LABEL[c.status] : c.when}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ---- Route and deliveries ---- */}
      <div className="grid gap-3.5 min-[1600px]:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="grid min-h-[260px] overflow-hidden rounded-[22px] border border-divider bg-surface-100 min-[640px]:grid-cols-2">
          <div className="relative min-h-[200px]">
            {current && fitPoints.length > 0 ? (
              <DispatchMap
                variant="console"
                tiles={dark ? 'dark' : 'street'}
                dark={dark}
                accent={dark ? '#FFCF33' : '#2F7CF6'}
                center={config.center}
                zoom={config.default_zoom}
                trucks={tPos ? [{ id: truck.id, lat: tPos.lat, lng: tPos.lng, state: 'live', size: 'md', selected: true, label: null, aria: truck.plate_number }] : []}
                stops={mapStops}
                route={route}
                animateSeconds={3}
                fitKey={`board:${truck.id}:${current.id}:${fitPoints.length}`}
                fitPoints={fitPoints}
                ariaLabel={`${current.reference} route`}
              />
            ) : (
              <div className="grid h-full place-items-center bg-surface-200 p-4 text-center text-[12.5px] text-ink-muted">No route: the truck has no delivery now.</div>
            )}
          </div>
          <div className="flex min-w-0 flex-col gap-1 p-4">
            <span className="mb-1 text-[13px] font-semibold">{current ? `${current.reference} · stops` : 'Stops'}</span>
            {!current && <span className="text-[12.5px] text-ink-muted">Nothing on the road.</span>}
            {stops.map((s, i) => {
              const done = stopDone(s);
              const when = s.completed_at ? formatTime(s.completed_at, tz, config.locale) : s.arrived_at ? `Arrived ${formatTime(s.arrived_at, tz, config.locale)}` : eta.has(s.id) ? `ETA ${formatTime(eta.get(s.id)!, tz, config.locale)}` : 'Not yet';
              return (
                <div key={s.id} className="grid grid-cols-[14px_1fr] gap-3">
                  <div className="flex flex-col items-center">
                    <i className="mt-1 h-3 w-3 flex-none rounded-full border-2" style={{ borderColor: done ? 'var(--status-completed)' : 'var(--border)', background: done ? 'var(--status-completed)' : 'var(--surface-100)' }} />
                    {i < stops.length - 1 && <i className="my-1 w-0 flex-1 border-s-[1.5px] border-dashed" style={{ borderColor: 'var(--border)' }} />}
                  </div>
                  <div className="flex min-w-0 flex-col gap-0.5 pb-3">
                    <span className="text-[11px] text-ink-muted">
                      {s.stop_type === 'pickup' ? 'Pickup' : 'Drop-off'} · {when}
                    </span>
                    <span className="truncate text-[12.5px] font-medium" title={s.address}>
                      {s.address}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex min-w-0 flex-col overflow-hidden rounded-[22px] border border-divider bg-surface-100">
          <div className="flex items-center justify-between gap-2 border-b border-divider px-4 py-3.5">
            <span className="text-[13px] font-semibold">Delivery list · last 7 days</span>
            <span className="text-[12px] text-ink-muted">{recent.length}</span>
          </div>
          <div className="overflow-x-auto">
            <div className="min-w-[520px]">
              <div className="grid grid-cols-[minmax(130px,1.2fr)_minmax(0,1.5fr)_minmax(0,1fr)_auto] gap-3 px-4 py-2 text-[11.5px] text-ink-muted">
                <span>Delivery</span>
                <span>Customer</span>
                <span>When</span>
                <span>Status</span>
              </div>
              {recent.length === 0 && <div className="px-4 pb-4 text-[12.5px] text-ink-muted">No deliveries in the last 7 days.</div>}
              {recent.slice(0, 8).map((r) => (
                <div key={r.reference} className="grid grid-cols-[minmax(130px,1.2fr)_minmax(0,1.5fr)_minmax(0,1fr)_auto] items-center gap-3 border-t border-divider px-4 py-2.5 text-[12.5px]">
                  <span className="t-mono truncate font-medium">{r.reference}</span>
                  <span className="truncate">{r.customer_name}</span>
                  <span className="truncate text-ink-muted">{formatWhen(r.finished_at ?? r.created_at, tz, config.locale, new Date(now))}</span>
                  <span>
                    <StatusPill status={r.status} size="sm" />
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
