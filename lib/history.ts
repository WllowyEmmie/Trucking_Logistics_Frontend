// History: finished deliveries (GET /deliveries/history) and how they got there.

import { failReasonLabel } from './labels';
import type { HistoryItem, HistoryOutcome } from './types';
import { zonedInputToIso } from './due';
import { formatDuration } from './format';

export const HISTORY_OUTCOMES: [HistoryOutcome, string][] = [
  ['', 'All'],
  ['completed', 'Completed'],
  ['recovered', 'Failed, then completed'],
  ['late', 'Completed late'],
  ['failed', 'Failed'],
  ['cancelled', 'Cancelled'],
];

/** The story in one line: "Failed (breakdown), sent out again, then completed". */
export function journey(h: HistoryItem): string {
  const reason = h.first_fail_reason ? ` (${failReasonLabel(h.first_fail_reason)})` : '';
  const failed = h.failures > 0 ? `Failed${h.failures > 1 ? ` ${h.failures} times` : ''}${reason}` : '';
  const again = h.reopens > 0 ? `sent out again${h.reopens > 1 ? ` ${h.reopens} times` : ''}` : '';
  const late = h.late && h.due_by ? ` · ${formatDuration((Date.parse(h.finished_at) - Date.parse(h.due_by)) / 60_000)} late` : '';
  switch (h.status) {
    case 'completed':
      return (failed ? `${failed}, ${again ? `${again}, ` : ''}then completed` : 'Completed') + late;
    case 'cancelled':
      return failed ? `${failed}, then cancelled` : 'Cancelled';
    case 'failed':
      if (h.reopens > 0) return `${failed}, ${again}, still failed`;
      return `${failed || 'Failed'} · not sent out again yet`;
  }
}

/** "2026-10-20" in a zone, `daysAgo` days back from now. */
export function zonedDay(tz: string, daysAgo = 0, now = Date.now()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now - daysAgo * 86_400_000));
}

/** Midnight at the start of `day` ("2026-10-20") in `tz`, as an ISO instant. */
export const dayStartIso = (day: string, tz: string) => zonedInputToIso(`${day}T00:00`, tz);

/** The day after "2026-10-20". */
export function nextDay(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export type Period = 'today' | '7d' | '30d' | 'all' | 'custom';

export const PERIODS: [Period, string][] = [
  ['today', 'Today'],
  ['7d', 'Last 7 days'],
  ['30d', 'Last 30 days'],
  ['all', 'All time'],
  ['custom', 'Dates…'],
];

/** A CSV of the rows on screen, for a spreadsheet. */
export function historyCsv(rows: HistoryItem[], fmt: (iso: string) => string): string {
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const head = ['Reference', 'Customer', 'Outcome', 'What happened', 'Finished', 'Booked', 'Due by', 'Late', 'Truck', 'Failures'];
  const lines = rows.map((h) =>
    [h.reference, h.customer_name, h.status, journey(h), fmt(h.finished_at), fmt(h.created_at), h.due_by ? fmt(h.due_by) : '', h.late ? 'yes' : '', h.plate ?? '', String(h.failures)]
      .map(esc)
      .join(','),
  );
  return [head.join(','), ...lines].join('\n');
}
