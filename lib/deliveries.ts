'use client';

// Delivery data for every screen. GET /deliveries is a thin list (no stops, no end time);
// stops and events only come from GET /deliveries/{id}, so detail is fetched per delivery,
// only where a screen needs it.

import { useQueries, useQuery } from '@tanstack/react-query';
import { api } from './api';
import { FAIL_REASONS } from './labels';
import type { DeliveryDetailResponse, DeliveryEvent, DeliveryListItem, Driver, FailReason, Stop, TrackEvent } from './types';

export const DELIVERIES_KEY = ['deliveries'] as const;
export const DRIVERS_KEY = ['drivers'] as const;
export const detailKey = (id: string) => ['delivery', id] as const;

export const fetchDetail = (id: string) => api<DeliveryDetailResponse>(`/deliveries/${encodeURIComponent(id)}`);

export function useDeliveries(refetchMs = 15_000) {
  return useQuery({ queryKey: DELIVERIES_KEY, queryFn: () => api<DeliveryListItem[]>('/deliveries'), refetchInterval: refetchMs });
}

export function useDeliveryDetail(id: string | null, refetchMs: number | false = 15_000) {
  return useQuery({ queryKey: detailKey(id ?? ''), queryFn: () => fetchDetail(id!), enabled: !!id, refetchInterval: refetchMs });
}

/** Detail for a handful of deliveries at once (e.g. recently failed ones, for their end time). */
export function useDeliveryDetails(ids: string[], refetchMs: number | false = 60_000) {
  return useQueries({
    queries: ids.map((id) => ({ queryKey: detailKey(id), queryFn: () => fetchDetail(id), refetchInterval: refetchMs })),
  });
}

/** Drivers change rarely; trucks only carry a driver_id, so names come from here. */
export function useDrivers() {
  return useQuery({ queryKey: DRIVERS_KEY, queryFn: () => api<Driver[]>('/drivers'), staleTime: 60_000 });
}

// ---- Events ----

/** The latest event of a type: when the delivery started, ended, failed… */
export function eventAt(events: TrackEvent[], type: string): string | null {
  for (let i = events.length - 1; i >= 0; i--) if (events[i]!.event_type === type) return events[i]!.created_at;
  return null;
}

/** A `failed` event's note is the bare reason. Anything unrecognised reads as 'other'. */
const reasonKey = (note: string | null): FailReason | null => {
  const r = note?.trim();
  return r && FAIL_REASONS.some((x) => x.key === r) ? (r as FailReason) : r ? 'other' : null;
};

/** The failure reason lives in the note of the `failed` event. */
export function failReasonOf(events: TrackEvent[]): FailReason | null {
  return reasonKey([...events].reverse().find((x) => x.event_type === 'failed')?.note ?? null);
}

/** When the delivery ended (completed, failed or cancelled), from its events. */
export function endedAt(events: TrackEvent[]): string | null {
  return eventAt(events, 'completed') ?? eventAt(events, 'failed') ?? eventAt(events, 'cancelled');
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const reasonLabel = (note: string | null) => {
  const k = reasonKey(note);
  return k ? (FAIL_REASONS.find((r) => r.key === k)?.label.toLowerCase() ?? k) : 'reason not given';
};

/** The stop an event belongs to, from its stop_id; "a stop" only if the stops aren't loaded. */
function stopLabel(e: DeliveryEvent, stops?: Stop[]): string {
  const s = e.stop_id && stops ? stops.find((x) => x.id === e.stop_id) : undefined;
  return s ? `stop ${s.sequence}` : 'a stop';
}

/** Dispatcher wording for an event row. */
export function eventText(e: DeliveryEvent, stops?: Stop[]): string {
  switch (e.event_type) {
    case 'created':
      return 'Created';
    case 'assigned':
      return e.note ? cap(e.note) : 'Assigned';
    case 'in_transit':
      return 'Started';
    case 'stop_arrived':
      return `Arrived at ${stopLabel(e, stops)}`;
    case 'stop_completed':
      return `Completed ${stopLabel(e, stops)}`;
    case 'completed':
      return 'Completed';
    case 'failed':
      return `Failed · ${reasonLabel(e.note)}`;
    case 'truck_maintenance':
      return 'Truck sent to the workshop';
    case 'cancelled':
      return 'Cancelled';
    default:
      return cap(e.event_type.replace(/_/g, ' ')) + (e.note ? ` · ${e.note}` : '');
  }
}

/**
 * Customer wording for the public tracking history; internal events return null and are skipped.
 * `plate` is the response's plate_number: there's no reassignment, so it's the truck that was assigned.
 */
export function customerEventText(e: TrackEvent, plate: string | null): string | null {
  switch (e.event_type) {
    case 'created':
      return 'Delivery booked';
    case 'assigned':
      return plate ? `Truck ${plate} assigned` : 'Truck assigned';
    case 'in_transit':
      return 'On the way';
    case 'stop_completed':
      return 'A stop was completed';
    case 'completed':
      return 'Delivered';
    case 'failed':
      return `Not delivered — ${reasonLabel(e.note)}`;
    case 'cancelled':
      return 'Delivery cancelled';
    default:
      return null;
  }
}

// ---- Stops ----

export const stopDone = (s: Pick<Stop, 'status'>) => s.status === 'completed' || s.status === 'skipped';

/** Index of the first stop not completed or skipped, or -1. */
export const currentStopIndex = (stops: Pick<Stop, 'status'>[]) => stops.findIndex((s) => !stopDone(s));

export const hasLatLng = <T extends { lat: number | null; lng: number | null }>(p: T): p is T & { lat: number; lng: number } =>
  p.lat != null && p.lng != null;
