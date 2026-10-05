import { ChevronDown, TriangleAlert } from 'lucide-react';
import { StatusPill } from '@/components/StatusPill';
import { currentStopIndex, lateMinutes } from '@/lib/exceptions';
import { formatTime, formatWhen } from '@/lib/format';
import type { Config, Delivery } from '@/lib/types';
import { AssignPanel, type Candidate } from './AssignPanel';

export interface RowError {
  conflict: boolean;
  message: string;
}

interface Props {
  d: Delivery;
  line2: string;
  flag: string | null;
  selected: boolean;
  expanded: boolean;
  config: Config;
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
}

export function DeliveryRow(p: Props) {
  const { d, config } = p;
  const tz = config.timezone;
  const t = (iso: string) => formatTime(iso, tz, config.locale);
  const cur = currentStopIndex(d);
  const late = lateMinutes(d);
  const live = d.status === 'in_transit' || d.status === 'assigned';

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
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
            <span className="t-mono font-semibold">{d.id}</span>
            <span className="t-h3 min-w-[8em] flex-1">{d.customer_name}</span>
            <StatusPill status={d.status} size="sm" />
          </span>
          <span className="t-body-sm text-ink-muted">{p.line2}</span>
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
          aria-label={`${p.expanded ? 'Hide' : 'Show'} timeline for ${d.id}`}
          className="flex h-11 w-11 flex-none items-center justify-center rounded-md border border-border bg-surface-100 text-ink"
        >
          <ChevronDown size={18} strokeWidth={2.5} aria-hidden="true" style={{ transform: p.expanded ? 'rotate(180deg)' : 'none' }} />
        </button>
      </div>

      {p.expanded && (
        <div className="flex flex-col gap-4 px-3 pt-0.5 pb-4">
          {d.status === 'pending' && (
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
              <span className="t-body-sm font-bold">Couldn&apos;t assign — the list was out of date</span>
              <span className="t-mono">409 · {p.error.message}</span>
              <span className="t-body-sm">The truck list has been refreshed. Pick another truck.</span>
            </div>
          )}
          {p.error && !p.error.conflict && (
            <div role="alert" className="flex flex-col items-start gap-2 rounded-md border border-status-failed bg-status-failed-bg px-3 py-2.5">
              <span className="t-body-sm font-bold">Couldn&apos;t assign</span>
              <span className="t-mono">{p.error.message}</span>
              <button type="button" onClick={p.onRetry} className="min-h-11 rounded-md border border-border bg-surface-100 px-3 text-[13px] font-semibold text-ink">
                Retry
              </button>
            </div>
          )}
          {p.note && (
            <div role="status" className="t-body-sm rounded-md border border-status-completed bg-status-completed-bg px-3 py-2.5 font-semibold">
              {p.note}
            </div>
          )}

          <div className="flex flex-col gap-2">
            <span className="t-label text-ink-muted">Stops</span>
            <ol className="m-0 list-none p-0">
              {d.stops.map((s, i) => {
                const isCur = live && i === cur;
                const fill = s.status === 'done' ? 'var(--ink)' : s.status === 'failed' ? 'var(--status-failed)' : 'var(--surface-100)';
                const filled = s.status !== 'pending';
                let time: string;
                if (s.status === 'done' && s.completed_at) time = `${s.kind === 'pickup' ? 'Collected' : 'Delivered'} ${t(s.completed_at)}`;
                else if (s.status === 'failed' && s.completed_at) time = `Failed ${t(s.completed_at)}`;
                else if (s.eta && live) time = `ETA ${t(s.eta)}${isCur && late ? ` · ${late} min late` : ''}`;
                else if (d.status === 'cancelled') time = 'Cancelled';
                else time = 'Not scheduled';
                const timeColor =
                  s.status === 'failed' || (isCur && late) ? 'var(--attention)' : isCur ? 'var(--status-transit)' : 'var(--ink-muted)';
                return (
                  <li key={s.seq} className="grid gap-x-2.5" style={{ gridTemplateColumns: '24px minmax(0,1fr)' }}>
                    <div className="flex flex-col items-center">
                      <span
                        className="flex h-[22px] w-[22px] flex-none items-center justify-center rounded-full text-[11px] leading-none font-bold"
                        style={{
                          background: fill,
                          border: filled ? `2px solid ${fill}` : isCur ? '3px solid var(--accent)' : '2px solid var(--ink-muted)',
                          color: filled ? 'var(--surface-100)' : 'var(--ink)',
                        }}
                      >
                        {s.seq}
                      </span>
                      <span aria-hidden="true" className="my-0.5 w-0.5 flex-1 bg-border" style={{ opacity: i === d.stops.length - 1 ? 0 : 1 }} />
                    </div>
                    <div className="flex min-w-0 flex-col gap-px pb-3">
                      <span className="t-label text-ink-muted">{s.kind === 'pickup' ? 'Pickup' : 'Drop-off'}</span>
                      <span className="t-body-sm wrap-anywhere">{s.address}</span>
                      <span className="t-body-sm font-semibold" style={{ color: timeColor }}>
                        {time}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>

          <div className="flex flex-col gap-1">
            <span className="t-label text-ink-muted">Events</span>
            <ol className="m-0 list-none p-0">
              {d.events.map((e, i) => (
                <li key={`${e.at}-${i}`} className="grid gap-2.5 border-b border-divider py-[5px]" style={{ gridTemplateColumns: 'minmax(48px,auto) minmax(0,1fr)' }}>
                  <span className="t-mono text-ink-muted">{formatWhen(e.at, tz, config.locale, new Date(p.now))}</span>
                  <span className="t-body-sm">{e.text}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </li>
  );
}
