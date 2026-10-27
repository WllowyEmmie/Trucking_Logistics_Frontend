'use client';

import { Check, Link2, Pencil, X } from 'lucide-react';
import { useState } from 'react';
import { StatusPill } from '@/components/StatusPill';
import type { AppConfig } from '@/lib/config';
import { currentStopIndex, eventText, stopDone } from '@/lib/deliveries';
import { formatTime, formatWhen } from '@/lib/format';
import type { DeliveryDetailResponse, DeliveryListItem } from '@/lib/types';
import { EDITABLE, EditDelivery } from './EditDelivery';
import { ProofView } from './ProofView';

/**
 * The floating card over the console map, from the Loads design: "No: <reference>", Share link,
 * and three tabs: Tracking (the stops as a timeline), Load info, and Events. Actions (assign,
 * send again, cancel, due time) stay in the list card on the left.
 */

type Tab = 'tracking' | 'info' | 'events';

interface Props {
  d: DeliveryListItem;
  detail: DeliveryDetailResponse | undefined;
  plate: string | null;
  driver: string | null;
  config: AppConfig;
  now: number;
  accent: string;
  onClose: () => void;
}

export function LoadCard({ d, detail, plate, driver, config, now, accent, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('tracking');
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState<string[] | null>(null);
  const canEdit = EDITABLE.has(d.status);
  const tz = config.timezone;
  const t = (iso: string) => formatTime(iso, tz, config.locale);
  const stops = detail?.stops ?? [];
  const cur = currentStopIndex(stops);
  const live = d.status === 'in_transit' || d.status === 'assigned';
  const etaAt = new Map((detail?.eta?.stops ?? []).map((x) => [x.stop_id, x.at]));
  const link = detail ? `${window.location.origin}/t/${detail.delivery.tracking_token}` : null;
  const ring = `color-mix(in srgb, ${accent} 18%, transparent)`;

  async function share() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      window.open(link, '_blank', 'noreferrer');
    }
  }

  const info: [string, string][] = [
    ['Customer', d.customer_name],
    ['Phone', detail?.delivery.customer_phone ?? '—'],
    ['Truck', plate ?? '—'],
    ['Driver', driver ?? '—'],
    ['Goods', detail?.delivery.goods_desc || '—'],
    ['Stops', stops.length ? String(stops.length) : '—'],
    ['Due by', d.due_by ? t(d.due_by) : 'Not set'],
    ['ETA', detail?.eta ? t(detail.eta.arrival) : d.eta ? t(d.eta) : '—'],
    ['Booked', formatWhen(d.created_at, tz, config.locale, new Date(now))],
  ];

  return (
    <div
      className="absolute start-3.5 top-[68px] z-[1000] flex max-h-[calc(100%-82px)] w-[300px] max-w-[calc(100%-28px)] flex-col gap-3.5 overflow-y-auto rounded-[18px] border border-divider bg-surface-100 p-4 text-ink"
      style={{ boxShadow: 'var(--shadow-card)' }}
    >
      <div className="flex items-center gap-1">
        <span className="flex-1 text-[13px] font-semibold">
          No: <span className="t-mono">{d.reference}</span>
        </span>
        <button
          type="button"
          onClick={() => void share()}
          disabled={!link}
          title="Copy the customer's tracking link"
          className="flex h-7 items-center gap-1.5 rounded-lg border border-border bg-transparent px-2 text-[11.5px] text-ink hover:border-ink-subtle disabled:opacity-40"
          style={{ minHeight: 28, minWidth: 0 }}
        >
          {copied ? <Check size={13} aria-hidden="true" /> : <Link2 size={13} aria-hidden="true" />}
          {copied ? 'Copied' : 'Share link'}
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="grid h-7 w-7 place-items-center rounded-lg border-0 bg-transparent text-ink hover:bg-surface-200"
          style={{ minHeight: 28, minWidth: 28 }}
        >
          <X size={15} aria-hidden="true" />
        </button>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[12.5px] text-ink-muted">{d.customer_name}</span>
        <StatusPill status={d.status} size="sm" />
      </div>

      <div role="tablist" className="flex gap-0.5 rounded-xl border border-border p-1">
        {(
          [
            ['info', 'Load info'],
            ['tracking', 'Tracking'],
            ['events', 'Events'],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className="flex-1 rounded-[9px] border-0 px-1 text-[12.5px] font-medium"
            style={{ background: tab === k ? 'var(--brand)' : 'transparent', color: tab === k ? 'var(--brand-ink)' : 'var(--ink)', minHeight: 32, minWidth: 0 }}
          >
            {label}
          </button>
        ))}
      </div>

      {!detail && <span className="text-[12px] text-ink-muted">Loading…</span>}

      {detail && tab === 'tracking' && (
        <ol className="m-0 flex list-none flex-col p-0">
          {stops.map((s, i) => {
            const done = stopDone(s);
            const nextDone = i + 1 < stops.length && stopDone(stops[i + 1]!);
            const isCur = live && i === cur;
            let when: string;
            if (s.status === 'completed' && s.completed_at) when = `${s.stop_type === 'pickup' ? 'Collected' : 'Delivered'} ${t(s.completed_at)}`;
            else if (s.status === 'skipped') when = 'Skipped';
            else if (s.status === 'arrived' && s.arrived_at) when = `Arrived ${t(s.arrived_at)}`;
            else if (etaAt.has(s.id)) when = `ETA ${t(etaAt.get(s.id)!)}`;
            else if (d.status === 'cancelled') when = 'Cancelled';
            else when = isCur ? 'Next' : 'Not yet';
            return (
              <li key={s.id} className="grid grid-cols-[14px_1fr] gap-3.5">
                <div className="flex flex-col items-center">
                  <i
                    className="mt-1 h-2.5 w-2.5 flex-none rounded-full"
                    style={{ background: done || isCur ? accent : 'var(--ink)', boxShadow: done || isCur ? `0 0 0 4px ${ring}` : 'none' }}
                  />
                  {i < stops.length - 1 && (
                    <i className="mt-1.5 mb-0.5 w-0 flex-1" style={{ borderInlineStart: `1.5px ${nextDone ? 'solid' : 'dashed'} ${nextDone ? accent : 'var(--ink-subtle)'}` }} />
                  )}
                </div>
                <div className="flex flex-col gap-[3px] pb-[18px]">
                  <span className="text-[13px] font-semibold">
                    {s.stop_type === 'pickup' ? 'Pickup' : 'Drop-off'} {stops.length > 2 ? `· stop ${s.sequence}` : ''}
                  </span>
                  <span className="text-[12px] wrap-anywhere">{s.address}</span>
                  <span className="text-[11.5px]" style={{ color: isCur ? accent : 'var(--ink-muted)' }}>
                    {when}
                  </span>
                  <ProofView deliveryId={d.id} stop={s} config={config} />
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {detail && tab === 'info' && editing && canEdit && (
        <EditDelivery
          detail={detail}
          onDone={(changes) => {
            setEditing(false);
            setSaved(changes.length ? changes : null);
          }}
        />
      )}

      {detail && tab === 'info' && !(editing && canEdit) && saved && (
        <div role="status" className="flex flex-col gap-1 rounded-xl bg-surface-200 px-3 py-2 text-[12px]">
          <span className="font-semibold">Saved</span>
          {saved.map((c) => (
            <span key={c} className="text-ink-muted wrap-anywhere">
              {c}
            </span>
          ))}
        </div>
      )}

      {detail && tab === 'info' && !(editing && canEdit) && (
        <dl className="m-0 grid grid-cols-2 gap-x-3 gap-y-3.5">
          {info.map(([k, v]) => (
            <div key={k} className="flex min-w-0 flex-col gap-0.5">
              <dt className="text-[11px] text-ink-muted">{k}</dt>
              <dd className="m-0 truncate text-[13px] font-medium" title={v}>
                {v}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {detail && tab === 'info' && !editing && (
        canEdit ? (
          <button
            type="button"
            onClick={() => {
              setSaved(null);
              setEditing(true);
            }}
            className="flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-border bg-transparent px-3 text-[12.5px] font-semibold text-ink hover:border-ink-subtle"
          >
            <Pencil size={13} strokeWidth={2.2} aria-hidden="true" />
            Edit details
          </button>
        ) : (
          d.status === 'in_transit' && (
            <p className="m-0 text-[11.5px] text-ink-muted">On the road: details can&apos;t change now. To fix them, fail it and create a new delivery.</p>
          )
        )
      )}

      {detail && tab === 'events' && (
        <ol className="m-0 flex list-none flex-col gap-2 p-0">
          {[...detail.events].reverse().map((e) => (
            <li key={e.id} className="flex flex-col gap-0.5 rounded-xl border border-divider px-3 py-2">
              <span className="text-[12.5px] font-medium">{eventText(e, stops)}</span>
              <span className="text-[11px] text-ink-muted">{formatWhen(e.created_at, tz, config.locale, new Date(now))}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
