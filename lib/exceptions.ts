// Pure rules. No fetching, no React: everything derived for the console header.
import type { AppConfig } from './config';
import { formatDuration, formatTime } from './format';
import { failReasonLabel } from './labels';
import type { DeliveryListItem, FailReason, Proposal, Truck } from './types';

const MIN = 60_000;

type Thresholds = Pick<AppConfig, 'stale_minutes' | 'pending_minutes' | 'failed_window_minutes' | 'timezone' | 'locale'>;

/** Silent: a truck that should be reporting whose last position is at least `stale_minutes` old. */
export function isStale(t: Truck, cfg: Pick<AppConfig, 'stale_minutes'>, now: number): boolean {
  if (t.last_seen_at == null || t.lat == null || t.lng == null) return false;
  if (t.status !== 'on_delivery' && t.status !== 'available') return false;
  return now - Date.parse(t.last_seen_at) >= cfg.stale_minutes * MIN;
}

export const hasPosition = (t: Truck): t is Truck & { lat: number; lng: number } => t.lat != null && t.lng != null;

export const isActive = (d: Pick<DeliveryListItem, 'status'>) => d.status === 'assigned' || d.status === 'in_transit';

/** Trucks carry no delivery id: the active delivery assigned to each truck, from the list. */
export function activeByTruck(deliveries: DeliveryListItem[]): Map<string, DeliveryListItem> {
  const m = new Map<string, DeliveryListItem>();
  for (const d of deliveries) if (d.truck_id && isActive(d)) m.set(d.truck_id, d);
  return m;
}

/** End time and reason of a failed delivery: only GET /deliveries/{id} has them (in its events). */
export type FailedInfo = Record<string, { at: string; reason: FailReason | null }>;

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
  deliveries: DeliveryListItem[],
  trucks: Truck[],
  driverName: (driverId: string | null) => string | null,
  failed: FailedInfo,
  flags: Proposal[],
  cfg: Thresholds,
  now: number,
): ExceptionRow[] {
  const out: ExceptionRow[] = [];
  const time = (iso: string) => formatTime(iso, cfg.timezone, cfg.locale);
  const byId = new Map(deliveries.map((d) => [d.id, d]));
  const onTruck = activeByTruck(deliveries);
  const available = trucks.filter((t) => t.status === 'available' && hasPosition(t) && !isStale(t, cfg, now)).length;

  for (const t of trucks) {
    if (!isStale(t, cfg, now) || !t.last_seen_at) continue;
    const mins = Math.floor((now - Date.parse(t.last_seen_at)) / MIN);
    const d = onTruck.get(t.id);
    out.push({
      key: `silent-${t.id}`,
      issue: 'Truck silent',
      subject: `${t.plate_number} · ${driverName(t.driver_id) ?? 'no driver'}`,
      detail: `No position for ${mins} min · ${d ? `on ${d.reference}` : 'no delivery now'}`,
      since: time(t.last_seen_at),
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
        subject: `${d.reference} · ${d.customer_name}`,
        detail: `Waiting ${formatDuration(waited)} · ${available} trucks available`,
        since: time(d.created_at),
        agent: false,
        action: 'Assign',
        deliveryId: d.id,
        truckId: null,
      });
    }
  }

  for (const d of deliveries) {
    const f = d.status === 'failed' ? failed[d.id] : undefined;
    if (!f || now - Date.parse(f.at) > cfg.failed_window_minutes * MIN) continue;
    out.push({
      key: `failed-${d.id}`,
      issue: 'Failed',
      subject: `${d.reference} · ${d.customer_name}`,
      detail: `Failed ${time(f.at)} · ${failReasonLabel(f.reason)}`,
      since: time(f.at),
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
      subject: d ? `${d.reference} · ${d.customer_name}` : (p.truck_id ?? ''),
      detail: p.why,
      since: time(p.created_at),
      agent: true,
      action: 'View',
      deliveryId: p.delivery_id,
      truckId: p.truck_id,
    });
  }

  return out;
}
