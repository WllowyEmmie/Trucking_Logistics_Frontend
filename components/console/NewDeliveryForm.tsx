'use client';

import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { isConflict, post } from '@/lib/api';
import { inServiceArea, type AppConfig } from '@/lib/config';
import type { CreateDeliveryRequest, CreateDeliveryResponse } from '@/lib/types';
import { inputCls, textareaCls } from './ui';

interface Props {
  config: AppConfig;
  onCreated: (r: CreateDeliveryResponse) => void;
  onCancel: () => void;
}

interface StopDraft {
  address: string;
  /** "53.6745, -1.5285": the API needs coordinates and does no geocoding. TODO(geocoding) */
  coords: string;
  contactName: string;
  contactPhone: string;
}

type Errs = Record<string, string>;

const blank = (): StopDraft => ({ address: '', coords: '', contactName: '', contactPhone: '' });

/** "53.6745, -1.5285" or "53.6745 -1.5285" → {lat, lng}. */
function parseCoords(s: string): { lat: number; lng: number } | null {
  const m = s.trim().match(/^(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
}

export function NewDeliveryForm({ config, onCreated, onCancel }: Props) {
  const depot = config.depot;
  const [customer, setCustomer] = useState('');
  const [phone, setPhone] = useState('');
  const [goods, setGoods] = useState('');
  const [pickup, setPickup] = useState<StopDraft>(() =>
    depot ? { ...blank(), address: depot.address, coords: `${depot.lat}, ${depot.lng}` } : blank(),
  );
  const [drops, setDrops] = useState<StopDraft[]>([blank()]);
  const [errs, setErrs] = useState<Errs>({});

  const create = useMutation({
    mutationFn: (body: CreateDeliveryRequest) => post<CreateDeliveryResponse>('/deliveries', body),
    onSuccess: onCreated,
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    const next: Errs = {};
    if (!customer.trim()) next.customer = 'Enter the customer';
    const stops: CreateDeliveryRequest['stops'] = [];
    [pickup, ...drops].forEach((s, i) => {
      const k = i === 0 ? 'p' : `d${i - 1}`;
      if (!s.address.trim()) next[`${k}-addr`] = i === 0 ? 'Enter the pickup address' : 'Enter an address or remove this stop';
      const c = parseCoords(s.coords);
      if (!c) next[`${k}-coords`] = 'Enter latitude, longitude — for example 53.6745, -1.5285';
      else if (!inServiceArea(config, c)) next[`${k}-coords`] = "Outside the service area. Check that latitude and longitude aren't swapped.";
      if (c)
        stops.push({
          stop_type: i === 0 ? 'pickup' : 'dropoff',
          address: s.address.trim(),
          lat: c.lat,
          lng: c.lng,
          contact_name: s.contactName.trim() || null,
          contact_phone: s.contactPhone.trim() || null,
        });
    });
    setErrs(next);
    if (Object.keys(next).length) return;
    create.mutate({ customer_name: customer.trim(), customer_phone: phone.trim() || null, goods_desc: goods.trim() || null, stops });
  }

  const err = (k: string) =>
    errs[k] ? (
      <span id={`nd-${k}-err`} className="t-body-sm font-semibold text-attention">
        {errs[k]}
      </span>
    ) : null;
  const described = (k: string) => (errs[k] ? `nd-${k}-err` : undefined);

  function StopFields({ k, s, set, label, contact }: { k: string; s: StopDraft; set: (p: Partial<StopDraft>) => void; label: string; contact: boolean }) {
    return (
      <>
        <label className="flex flex-col gap-1">
          <span className="t-body-sm font-semibold">{label}</span>
          <textarea
            value={s.address}
            onChange={(e) => set({ address: e.target.value })}
            rows={2}
            aria-invalid={!!errs[`${k}-addr`]}
            aria-describedby={described(`${k}-addr`)}
            className={textareaCls(!!errs[`${k}-addr`])}
          />
          {err(`${k}-addr`)}
        </label>
        <label className="flex flex-col gap-1">
          <span className="t-body-sm font-semibold">
            Coordinates <span className="font-normal text-ink-muted">(latitude, longitude)</span>
          </span>
          <input
            value={s.coords}
            onChange={(e) => set({ coords: e.target.value })}
            inputMode="decimal"
            placeholder="53.6745, -1.5285"
            aria-invalid={!!errs[`${k}-coords`]}
            aria-describedby={described(`${k}-coords`) ?? 'nd-coords-hint'}
            className={`${inputCls(!!errs[`${k}-coords`])} font-mono`}
          />
          {err(`${k}-coords`)}
        </label>
        {contact && (
          <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
            <label className="flex flex-col gap-1">
              <span className="t-body-sm font-semibold">
                Contact <span className="font-normal text-ink-muted">(optional)</span>
              </span>
              <input value={s.contactName} onChange={(e) => set({ contactName: e.target.value })} className={inputCls()} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="t-body-sm font-semibold">
                Contact phone <span className="font-normal text-ink-muted">(optional)</span>
              </span>
              <input value={s.contactPhone} onChange={(e) => set({ contactPhone: e.target.value })} type="tel" className={inputCls()} />
            </label>
          </div>
        )}
      </>
    );
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      aria-label="New delivery"
      className="mx-3 mt-2.5 mb-1 flex max-h-[520px] flex-col gap-3 overflow-auto rounded-md border-2 border-ink bg-surface-100 p-3.5"
    >
      <span className="t-h2">New delivery</span>
      {create.isError && (
        <div role="alert" className="flex flex-col gap-1 rounded-md border border-status-failed bg-status-failed-bg px-3 py-2.5">
          <span className="t-body-sm font-bold">Not created</span>
          <span className="t-mono">{isConflict(create.error) ? `409 · ${create.error.message}` : create.error.message}</span>
        </div>
      )}
      <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        <label className="flex flex-col gap-1">
          <span className="t-body-sm font-semibold">Customer</span>
          <input
            value={customer}
            onChange={(e) => setCustomer(e.target.value)}
            aria-invalid={!!errs.customer}
            aria-describedby={described('customer')}
            className={inputCls(!!errs.customer)}
          />
          {err('customer')}
        </label>
        <label className="flex flex-col gap-1">
          <span className="t-body-sm font-semibold">
            Customer phone <span className="font-normal text-ink-muted">(optional)</span>
          </span>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" className={inputCls()} />
        </label>
      </div>
      <span id="nd-coords-hint" className="t-body-sm text-ink-muted">
        Every stop needs coordinates inside the service area. Copy them from your map app.
      </span>
      {StopFields({ k: 'p', s: pickup, set: (x) => setPickup({ ...pickup, ...x }), label: 'Stop 1 · Pickup', contact: false })}
      {drops.map((s, i) => (
        <div key={i} className="flex flex-col gap-2 border-t border-divider pt-3">
          {drops.length > 1 && (
            <button
              type="button"
              onClick={() => {
                setDrops(drops.filter((_, j) => j !== i));
                setErrs({});
              }}
              aria-label={`Remove stop ${i + 2}`}
              className="min-h-11 self-end rounded-md border border-border bg-surface-100 px-2.5 text-[12px] font-semibold text-ink"
            >
              Remove
            </button>
          )}
          {StopFields({
            k: `d${i}`,
            s,
            set: (x) => setDrops(drops.map((d, j) => (j === i ? { ...d, ...x } : d))),
            label: `Stop ${i + 2} · Drop-off`,
            contact: true,
          })}
        </div>
      ))}
      <button
        type="button"
        onClick={() => setDrops([...drops, blank()])}
        className="min-h-11 self-start rounded-md border border-dashed border-border bg-transparent px-3 text-[13px] font-semibold text-ink"
      >
        + Add drop-off
      </button>
      <label className="flex flex-col gap-1">
        <span className="t-body-sm font-semibold">
          Goods <span className="font-normal text-ink-muted">(optional)</span>
        </span>
        <input value={goods} onChange={(e) => setGoods(e.target.value)} className={inputCls()} />
      </label>
      <div className="flex flex-wrap gap-4">
        <button
          type="submit"
          disabled={create.isPending}
          className="min-h-11 flex-[1_1_120px] rounded-md border-0 bg-ink text-[14px] font-semibold text-surface-100 disabled:opacity-45"
        >
          {create.isPending ? 'Creating…' : 'Create as pending'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="min-h-11 flex-[0_1_100px] rounded-md border border-border bg-surface-100 text-[14px] font-semibold text-ink"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
