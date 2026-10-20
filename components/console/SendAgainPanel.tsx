'use client';

import { useState } from 'react';
import type { AppConfig } from '@/lib/config';
import { failReasonLabel } from '@/lib/labels';
import { failReasonOf, reopenOptions, type ReopenMode } from '@/lib/reopen';
import type { DeliveryEvent, Stop, Truck } from '@/lib/types';
import { AssignPanel, type Candidate } from './AssignPanel';
import { btnPrimary, tabCls } from './ui';

interface Props {
  stops: Stop[];
  events: DeliveryEvent[];
  /** The truck that had it when it failed. */
  oldTruck: Truck | null;
  oldDriver: string | null;
  candidates: Candidate[];
  availableCount: number;
  hover: string | null;
  busy: boolean;
  config: AppConfig;
  onHover: (id: string | null) => void;
  onReopen: (truckId: string, mode: ReopenMode) => void;
}

/** A failed delivery's way back out: the options that fit where the goods are, recommended first. */
export function SendAgainPanel(p: Props) {
  const reason = failReasonOf(p.events);
  const plate = p.oldTruck?.plate_number ?? null;
  const options = reopenOptions(p.stops, reason, plate);
  const [key, setKey] = useState(options[0]!.key);
  const opt = options.find((o) => o.key === key) ?? options[0]!;

  const old = p.oldTruck;
  const oldReady = !!old && old.status === 'available' && !!old.driver_id;
  const why = !old
    ? 'The truck is no longer in the fleet.'
    : old.status !== 'available'
      ? `${old.plate_number} is ${old.status.replace('_', ' ')}, so it can't go again yet.`
      : !old.driver_id
        ? `${old.plate_number} has no driver.`
        : null;

  return (
    <div className="flex flex-col gap-2.5 rounded-md border border-border bg-surface-100 p-2.5">
      <div className="flex flex-col gap-0.5">
        <span className="t-h3">Send it out again</span>
        <span className="t-body-sm text-ink-muted">
          Failed: {failReasonLabel(reason)}
          {plate ? ` · was on ${plate}` : ''}
        </span>
      </div>

      <div role="radiogroup" aria-label="How to send it out again" className="flex flex-wrap gap-1.5">
        {options.map((o, i) => (
          <button key={o.key} type="button" role="radio" aria-checked={o.key === opt.key} onClick={() => setKey(o.key)} className={tabCls(o.key === opt.key)}>
            {o.title}
            {i === 0 && <span className="ms-1.5 text-[11px] font-semibold opacity-75">Suggested</span>}
          </button>
        ))}
      </div>
      <span className="t-body-sm">{opt.blurb}</span>

      {opt.sameTruck ? (
        oldReady ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-divider px-2.5 py-1.5">
            <span className="t-body-sm">
              <span className="t-mono font-bold">{old!.plate_number}</span> · {p.oldDriver ?? 'driver'}
            </span>
            <button type="button" disabled={p.busy} onClick={() => p.onReopen(old!.id, opt.mode)} className={btnPrimary}>
              {opt.verb}
            </button>
          </div>
        ) : (
          <span role="status" className="t-body-sm font-semibold">
            {why} Hand it over to another truck instead.
          </span>
        )
      ) : (
        <AssignPanel
          title={null}
          verb={opt.verb}
          candidates={opt.otherTruck && old ? p.candidates.filter((c) => c.truck.id !== old.id) : p.candidates}
          availableCount={p.availableCount}
          hover={p.hover}
          busy={p.busy}
          config={p.config}
          onHover={p.onHover}
          onAssign={(truckId) => p.onReopen(truckId, opt.mode)}
        />
      )}
    </div>
  );
}

export type { ReopenMode };
