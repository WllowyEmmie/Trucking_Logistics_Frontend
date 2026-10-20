import Link from 'next/link';
import { ChevronDown, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { StatusPill } from '@/components/StatusPill';
import type { AppConfig } from '@/lib/config';
import { currentStopIndex, eventText } from '@/lib/deliveries';
import { formatTime, formatWhen } from '@/lib/format';
import type { ReopenMode } from '@/lib/reopen';
import type { DeliveryDetailResponse, DeliveryListItem, Truck } from '@/lib/types';
import { AssignPanel, type Candidate } from './AssignPanel';
import { SendAgainPanel } from './SendAgainPanel';
import { DueEdit } from './DueEdit';
import { ProofView } from './ProofView';
import type { DueState } from '@/lib/due';

export interface RowError {
  conflict: boolean;
  message: string;
}

interface Props {
  d: DeliveryListItem;
  /** Undefined until GET /deliveries/{id} answers (only fetched for the expanded row). */
  detail: DeliveryDetailResponse | undefined;
  line2: string;
  /** "Due 14:30 · ETA 14:10"; null when neither. */
  due: string | null;
  dueState: DueState | null;
  flag: string | null;
  selected: boolean;
  expanded: boolean;
  config: AppConfig;
  now: number;
  onSelect: () => void;
  onToggle: () => void;
  // Expanded extras
  candidates: Candidate[];
  availableCount: number;
  hover: string | null;
  assigning: boolean;
  onHover: (id: string | null) => void;
  onAssign: (truckId: string) => void;
  note: string | null;
  error: RowError | null;
  onRetry: () => void;
  onCancel: () => void;
  onReopen: (truckId: string, mode: ReopenMode) => void;
  /** On a failed delivery: the truck it was on. */
  oldTruck: Truck | null;
  oldDriver: string | null;
  cancelling: boolean;
  cancelError: string | null;
  /** Assigned or in transit on a truck that has no driver (e.g. its driver was removed). */
  noDriver: boolean;
}

const CANCELLABLE = new Set(['pending', 'assigned', 'in_transit', 'failed']);

export function DeliveryRow(p: Props) {
  const { d, detail, config } = p;
  const tz = config.timezone;
  const t = (iso: string) => formatTime(iso, tz, config.locale);
  const live = d.status === 'in_transit' || d.status === 'assigned';
  // On a pending delivery the job is assigning: the details wait behind a toggle so the assign
  // panel isn't pushed out of the (short) list pane. Other statuses show them straight away.
  const [showDetails, setShowDetails] = useState(d.status !== 'pending');
  const [confirmCancel, setConfirmCancel] = useState(false);
  const details = showDetails || d.status !== 'pending';
  const stops = detail?.stops ?? [];
  const cur = currentStopIndex(stops);
  // Events come oldest first; the row shows newest first.
  const events = detail ? [...detail.events].reverse() : [];
  const etaAt = new Map((detail?.eta?.stops ?? []).map((x) => [x.stop_id, x.at]));
  const link = detail ? `${typeof window !== 'undefined' ? window.location.origin : ''}/t/${detail.delivery.tracking_token}` : null;

  return (
    <li
      data-id={d.id}
      className="border-b border-divider"
      style={{ background: p.selected ? 'var(--accent-bg)' : 'transparent', boxShadow: p.selected ? 'inset 0 0 0 2px var(--accent)' : 'none' }}
    >
      <div className="flex items-center gap-2 pe-2.5">
        <button
          type="button"
          onClick={p.onSelect}
          aria-pressed={p.selected}
          className="flex min-w-0 flex-1 flex-col gap-1 border-0 bg-transparent px-3 py-2.5 text-start text-ink"
        >
          {/* Reference and customer read as one line; the status tag gets the next line to itself, so
              every row has the same shape whatever the name's length. */}
          <span className="t-h3 wrap-anywhere">
            <span className="t-mono me-2 font-semibold">{d.reference}</span>
            {d.customer_name}
          </span>
          <span className="flex">
            <StatusPill status={d.status} size="sm" />
          </span>
          <span className="t-body-sm text-ink-muted">{p.line2}</span>
          {p.due && (
            <span className={`t-body-sm ${p.dueState === 'late' || p.dueState === 'at_risk' ? 'font-bold text-attention' : 'text-ink-muted'}`}>
              {p.dueState === 'late' ? 'Late · ' : p.dueState === 'at_risk' ? 'At risk · ' : ''}
              {p.due}
            </span>
          )}
          {p.flag && (
            <span className="t-body-sm flex items-center gap-1.5 font-bold text-attention">
              <TriangleAlert size={14} strokeWidth={2.75} aria-hidden="true" />
              {p.flag}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={p.onToggle}
          aria-expanded={p.expanded}
          aria-label={`${p.expanded ? 'Hide' : 'Show'} timeline for ${d.reference}`}
          className="flex h-11 w-11 flex-none items-center justify-center rounded-md border border-border bg-surface-100 text-ink"
        >
          <ChevronDown size={18} strokeWidth={2.5} aria-hidden="true" style={{ transform: p.expanded ? 'rotate(180deg)' : 'none' }} />
        </button>
      </div>

      {p.expanded && (
        <div className="flex flex-col gap-4 px-3 pt-0.5 pb-4">
          {!detail && (
            <span role="status" className="t-body-sm text-ink-muted">
              Loading stops and events…
            </span>
          )}

          {d.status === 'failed' && detail && (
            <SendAgainPanel
              stops={detail.stops}
              events={detail.events}
              oldTruck={p.oldTruck}
              oldDriver={p.oldDriver}
              candidates={p.candidates}
              availableCount={p.availableCount}
              hover={p.hover}
              busy={p.assigning}
              config={config}
              onHover={p.onHover}
              onReopen={p.onReopen}
            />
          )}

          {d.status === 'pending' && detail && (
            <AssignPanel
              candidates={p.candidates}
              availableCount={p.availableCount}
              hover={p.hover}
              busy={p.assigning}
              config={config}
              onHover={p.onHover}
              onAssign={p.onAssign}
            />
          )}

          {p.error?.conflict && (
            <div role="alert" className="flex flex-col gap-1 rounded-md border border-status-failed bg-status-failed-bg px-3 py-2.5">
              <span className="t-body-sm font-bold">Couldn&apos;t {d.status === 'failed' ? 'send it out again' : 'assign'}</span>
              <span className="t-body-sm">{p.error.message}</span>
              <span className="t-body-sm">The truck list has been refreshed. Pick another option or truck.</span>
            </div>
          )}
          {p.error && !p.error.conflict && (
            <div role="alert" className="flex flex-col items-start gap-2 rounded-md border border-status-failed bg-status-failed-bg px-3 py-2.5">
              <span className="t-body-sm font-bold">Couldn&apos;t {d.status === 'failed' ? 'send it out again' : 'assign'}</span>
              <span className="t-mono">{p.error.message}</span>
              <button type="button" onClick={p.onRetry} className="min-h-11 rounded-md border border-border bg-surface-100 px-3 text-[13px] font-semibold text-ink">
                Retry
              </button>
            </div>
          )}
          {p.noDriver && (
            <div role="alert" className="t-body-sm flex flex-col items-start gap-1 rounded-md border border-status-failed bg-status-failed-bg px-3 py-2.5">
              <span className="font-bold">This truck has no driver</span>
              <span>
                Nobody can start or finish this delivery. <Link href="/console/fleet">Give the truck a driver in Fleet</Link>, or cancel the delivery and assign another truck.
              </span>
            </div>
          )}

          {p.note && (
            <div role="status" className="t-body-sm rounded-md border border-status-completed bg-status-completed-bg px-3 py-2.5 font-semibold">
              {p.note}
            </div>
          )}

          {detail && d.status === 'pending' && (
            <button
              type="button"
              aria-expanded={details}
              onClick={() => setShowDetails((v) => !v)}
              className="flex min-h-11 items-center gap-1.5 self-start rounded-md border border-border bg-surface-100 px-3 text-[13px] font-semibold text-ink"
            >
              <ChevronDown size={16} strokeWidth={2.5} aria-hidden="true" style={{ transform: details ? 'rotate(180deg)' : 'none' }} />
              {details ? 'Hide details' : 'Details · stops, customer link, events'}
            </button>
          )}

          {detail && details && (
            <dl className="t-body-sm m-0 grid gap-x-3 gap-y-1" style={{ gridTemplateColumns: 'auto minmax(0,1fr)' }}>
              {detail.delivery.customer_phone && (
                <>
                  <dt className="text-ink-muted">Phone</dt>
                  <dd className="t-mono m-0">{detail.delivery.customer_phone}</dd>
                </>
              )}
              {detail.delivery.goods_desc && (
                <>
                  <dt className="text-ink-muted">Goods</dt>
                  <dd className="wrap-anywhere m-0">{detail.delivery.goods_desc}</dd>
                </>
              )}
              <dt className="text-ink-muted">Due by</dt>
              <dd className="m-0">
                {d.status === 'completed' || d.status === 'cancelled' ? (
                  detail.delivery.due_by ? t(detail.delivery.due_by) : 'No time promised'
                ) : (
                  <DueEdit id={d.id} dueBy={detail.delivery.due_by} config={config} />
                )}
              </dd>
              {detail.eta && (
                <>
                  <dt className="text-ink-muted">Arrival</dt>
                  <dd className="m-0">ETA {t(detail.eta.arrival)} at the last stop · estimate</dd>
                </>
              )}
              <dt className="text-ink-muted">Customer link</dt>
              <dd className="m-0 min-w-0">
                <a href={link!} target="_blank" rel="noreferrer" className="t-mono wrap-anywhere">
                  /t/{detail.delivery.tracking_token}
                </a>
              </dd>
            </dl>
          )}

          {details && stops.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="t-label text-ink-muted">Stops</span>
              <ol className="m-0 list-none p-0">
                {stops.map((s, i) => {
                  const done = s.status === 'completed';
                  const skipped = s.status === 'skipped';
                  const isCur = live && i === cur;
                  const fill = done ? 'var(--ink)' : 'var(--surface-100)';
                  let time: string;
                  if (done && s.completed_at) time = `${s.stop_type === 'pickup' ? 'Collected' : 'Delivered'} ${t(s.completed_at)}`;
                  else if (skipped) time = 'Skipped';
                  else if (s.status === 'arrived' && s.arrived_at) time = `Arrived ${t(s.arrived_at)}`;
                  else if (d.status === 'cancelled') time = 'Cancelled';
                  else if (etaAt.has(s.id)) time = `${isCur && d.status === 'in_transit' ? 'Next · ' : ''}ETA ${t(etaAt.get(s.id)!)}`;
                  else if (isCur && d.status === 'in_transit') time = 'Next';
                  else time = 'Not yet';
                  return (
                    <li key={s.id} className="grid gap-x-2.5" style={{ gridTemplateColumns: '24px minmax(0,1fr)' }}>
                      <div className="flex flex-col items-center">
                        <span
                          className="flex h-[22px] w-[22px] flex-none items-center justify-center rounded-full text-[11px] leading-none font-bold"
                          style={{
                            background: fill,
                            border: done ? `2px solid ${fill}` : isCur ? '3px solid var(--accent)' : '2px solid var(--ink-muted)',
                            color: done ? 'var(--surface-100)' : 'var(--ink)',
                          }}
                        >
                          {s.sequence}
                        </span>
                        <span aria-hidden="true" className="my-0.5 w-0.5 flex-1 bg-border" style={{ opacity: i === stops.length - 1 ? 0 : 1 }} />
                      </div>
                      <div className="flex min-w-0 flex-col gap-px pb-3">
                        <span className="t-label text-ink-muted">{s.stop_type === 'pickup' ? 'Pickup' : 'Drop-off'}</span>
                        <span className="t-body-sm wrap-anywhere">{s.address}</span>
                        <span className="t-body-sm font-semibold" style={{ color: isCur ? 'var(--status-transit)' : 'var(--ink-muted)' }}>
                          {time}
                        </span>
                        <ProofView deliveryId={d.id} stop={s} config={config} />
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>
          )}

          {CANCELLABLE.has(d.status) &&
            (confirmCancel ? (
              <div role="group" aria-label={`Cancel ${d.reference}?`} className="flex flex-col gap-2 rounded-md border border-border bg-surface-200 px-3 py-2.5">
                <span className="t-body-sm font-semibold">
                  Cancel {d.reference}?{' '}
                  {d.status === 'pending'
                    ? 'It comes off the list of deliveries to assign.'
                    : d.status === 'failed'
                      ? 'It won’t be sent out again, and moves to History. This can’t be undone.'
                      : 'The truck is freed and the driver stops seeing it. This can’t be undone.'}
                </span>
                {p.cancelError && (
                  <span role="alert" className="t-body-sm font-semibold text-attention">
                    {p.cancelError}
                  </span>
                )}
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => setConfirmCancel(false)} className="min-h-11 rounded-md border border-border bg-surface-100 px-3 text-[13px] font-semibold text-ink">
                    Keep it
                  </button>
                  <button
                    type="button"
                    disabled={p.cancelling}
                    onClick={p.onCancel}
                    className="min-h-11 rounded-md border-0 bg-status-failed px-3.5 text-[13px] font-semibold text-surface-100 disabled:opacity-45"
                  >
                    {p.cancelling ? 'Cancelling…' : 'Yes, cancel delivery'}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmCancel(true)}
                className="min-h-11 self-start rounded-md border border-border bg-surface-100 px-3 text-[13px] font-semibold text-ink"
              >
                Cancel delivery…
              </button>
            ))}

          {details && events.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="t-label text-ink-muted">Events</span>
              <ol className="m-0 list-none p-0">
                {events.map((e) => (
                  <li key={e.id} className="grid gap-2.5 border-b border-divider py-[5px]" style={{ gridTemplateColumns: 'minmax(48px,auto) minmax(0,1fr)' }}>
                    <span className="t-mono text-ink-muted">{formatWhen(e.created_at, tz, config.locale, new Date(p.now))}</span>
                    <span className="t-body-sm">{eventText(e, stops)}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}
    </li>
  );
}
