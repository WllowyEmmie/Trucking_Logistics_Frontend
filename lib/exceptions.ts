// Pure rules. No fetching, no React: everything derived for the console header.
import { formatDuration, formatTime } from './format';
import { failReasonLabel } from './labels';
import type { Config, Delivery, Proposal, Truck } from './types';

const MIN = 60_000;

/** Silent: a truck that should be reporting whose last position is at least `stale_minutes` old. */
export function isStale(t: Truck, cfg: Config, now: number): boolean {
  if (t.last_seen_at == null || t.lat == null || t.lng == null) return false;
  if (t.status !== 'on_delivery' && t.status !== 'available') return false;
  return now - Date.parse(t.last_seen_at) >= cfg.stale_minutes * MIN;
}

export const hasPosition = (t: Truck): t is Truck & { lat: number; lng: number } => t.lat != null && t.lng != null;

/** Index of the first stop not yet done or failed, or -1. */
export function currentStopIndex(d: Delivery): number {
  return d.stops.findIndex((s) => s.status === 'pending');
}

export const doneCount = (d: Delivery): number => d.stops.filter((s) => s.status === 'done').length;

/** Minutes the current stop is running past its promised time; 0 unless 10+ (the "late" rule). */
export function lateMinutes(d: Delivery): number {
  if (d.status !== 'in_transit' && d.status !== 'assigned') return 0;
  const s = d.stops[currentStopIndex(d)];
  if (!s?.eta || !s.promised_at) return 0;
  const m = Math.round((Date.parse(s.eta) - Date.parse(s.promised_at)) / MIN);
  return m >= 10 ? m : 0;
}

export const isActive = (d: Delivery) => d.status === 'assigned' || d.status === 'in_transit';

export interface ExceptionRow {
  key: string;
  issue: string;
  subject: string;
  detail: string;
  since: string;
  agent: boolean;
  action: 'View' | 'Assign';
  deliveryId: string | null;
  truckId: string | null;
}

export function deriveExceptions(
  deliveries: Delivery[],
  trucks: Truck[],
  flags: Proposal[],
  cfg: Config,
  now: number,
): ExceptionRow[] {
  const out: ExceptionRow[] = [];
  const tz = cfg.timezone;
  const byId = new Map(deliveries.map((d) => [d.id, d]));
  const available = trucks.filter((t) => t.status === 'available' && hasPosition(t) && !isStale(t, cfg, now)).length;

  for (const t of trucks) {
    if (!isStale(t, cfg, now) || !t.last_seen_at) continue;
    const mins = Math.floor((now - Date.parse(t.last_seen_at)) / MIN);
    const d = t.delivery_id ? byId.get(t.delivery_id) : undefined;
    const onWhat = d
      ? `on ${d.id}${d.stops[0]?.status === 'pending' ? ', not yet collected' : ''}`
      : 'no delivery now';
    out.push({
      key: `silent-${t.id}`,
      issue: 'Truck silent',
      subject: `${t.plate_number} · ${t.driver_name ?? 'no driver'}`,
      detail: `No position for ${mins} min · ${onWhat}`,
      since: formatTime(t.last_seen_at, tz, cfg.locale),
      agent: false,
      action: 'View',
      deliveryId: d?.id ?? null,
      truckId: t.id,
    });
  }

  if (available > 0) {
    for (const d of deliveries) {
      if (d.status !== 'pending') continue;
      const waited = (now - Date.parse(d.created_at)) / MIN;
      if (waited < cfg.pending_minutes) continue;
      out.push({
        key: `pending-${d.id}`,
        issue: `Pending ${formatDuration(cfg.pending_minutes)}+`,
        subject: `${d.id} · ${d.customer_name}`,
        detail: `Waiting ${formatDuration(waited)} · ${available} trucks available`,
        since: formatTime(d.created_at, tz, cfg.locale),
        agent: false,
        action: 'Assign',
        deliveryId: d.id,
        truckId: null,
      });
    }
  }

  for (const d of deliveries) {
    if (d.status !== 'failed' || !d.ended_at) continue;
    if (now - Date.parse(d.ended_at) > cfg.failed_window_minutes * MIN) continue;
    out.push({
      key: `failed-${d.id}`,
      issue: 'Failed',
      subject: `${d.id} · ${d.customer_name}`,
      detail: `Failed ${formatTime(d.ended_at, tz, cfg.locale)} · ${failReasonLabel(d.failure_reason)}`,
      since: formatTime(d.ended_at, tz, cfg.locale),
      agent: false,
      action: 'View',
      deliveryId: d.id,
      truckId: d.truck_id,
    });
  }

  for (const p of flags) {
    if (p.kind !== 'flag') continue;
    const d = p.delivery_id ? byId.get(p.delivery_id) : undefined;
    out.push({
      key: `agent-${p.id}`,
      issue: p.title,
      subject: d ? `${d.id} · ${d.customer_name}` : (p.truck_id ?? ''),
      detail: p.why,
      since: formatTime(p.created_at, tz, cfg.locale),
      agent: true,
      action: 'View',
      deliveryId: p.delivery_id,
      truckId: p.truck_id,
    });
  }

  return out;
}
