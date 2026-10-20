// Due times and estimated arrivals. due_by is when the delivery was promised (the last drop-off);
// eta is the API's estimate of reaching the last stop (internal/eta: straight-line distance with a
// road allowance, at the Settings average speed, plus time at each stop).

import { formatDuration, formatWhen, tzOffsetMinutes } from './format';

export type DueState = 'late' | 'at_risk' | 'on_time';

interface HasDue {
  status: string;
  due_by: string | null;
  eta?: string | null;
}

const OPEN = new Set(['pending', 'assigned', 'in_transit']);

/** Late: the due time has passed and it isn't delivered. At risk: the estimate is after it. */
export function dueState(d: HasDue, now: number): DueState | null {
  if (!d.due_by || !OPEN.has(d.status)) return null;
  const due = Date.parse(d.due_by);
  if (now > due) return 'late';
  if (d.eta && Date.parse(d.eta) > due) return 'at_risk';
  return 'on_time';
}

/** "Due 14:30 · ETA 14:10", "Due 14:30 · 25 min late", "ETA 14:10", or null when there's neither. */
export function dueLine(d: HasDue, tz: string, locale: string, now: number): string | null {
  const parts: string[] = [];
  const at = (iso: string) => formatWhen(iso, tz, locale, new Date(now));
  const state = dueState(d, now);
  if (d.due_by && OPEN.has(d.status)) parts.push(`Due ${at(d.due_by)}`);
  if (state === 'late') parts.push(`${formatDuration((now - Date.parse(d.due_by!)) / 60_000)} late`);
  if (d.eta && OPEN.has(d.status)) {
    const by = state === 'at_risk' ? ` (${formatDuration((Date.parse(d.eta) - Date.parse(d.due_by!)) / 60_000)} after)` : '';
    parts.push(`ETA ${at(d.eta)}${by}`);
  }
  return parts.length ? parts.join(' · ') : null;
}

/**
 * A datetime-local value ("2026-10-20T14:30") read as wall-clock time in `tz`, to an ISO instant.
 * Null when empty or not a date. Two passes so a time next to a clock change lands right.
 */
export function zonedInputToIso(value: string, tz: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const wall = Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!);
  let t = wall - tzOffsetMinutes(tz, new Date(wall)) * 60_000;
  t = wall - tzOffsetMinutes(tz, new Date(t)) * 60_000;
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

/** The reverse: an instant as a datetime-local value in `tz`. */
export function isoToZonedInput(iso: string, tz: string): string {
  const d = new Date(Date.parse(iso) + tzOffsetMinutes(tz, new Date(iso)) * 60_000);
  return d.toISOString().slice(0, 16);
}

/** Problems with a typed due time, worded like the API's. */
export function dueProblem(iso: string | null, now: number): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (t < now - 15 * 60_000) return 'That time has already passed';
  if (t > now + 366 * 24 * 3600_000) return 'That’s more than a year away';
  return null;
}
