'use client';

import { useMutation } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { isConflict, post } from '@/lib/api';
import { inServiceArea, type AppConfig } from '@/lib/config';
import type { CreateDeliveryRequest, CreateDeliveryResponse } from '@/lib/types';
import { AddressFinder } from './AddressFinder';
import { inputCls } from './ui';

interface Props {
  config: AppConfig;
  onCreated: (r: CreateDeliveryResponse) => void;
  onCancel: () => void;
}

interface StopDraft {
  address: string;
  /** "53.6745, -1.5285". Filled by Find (GET /geocode) from the address, or typed. */
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

/**
 * One field per row, label on the left. Rows are shorter than label-above-input, which is what lets
 * the whole form fit the pane without a scrollbar at 1440×900; every field is on its own line.
 */
const ROWS = 'grid grid-cols-[132px_minmax(0,1fr)] items-start gap-x-4 gap-y-2';

function Field({
  label,
  optional,
  error,
  hint,
  children,
}: {
  label: string;
  optional?: boolean;
  error?: string;
  hint?: string;
  children: (a: { id: string; describedBy?: string; invalid: boolean }) => ReactNode;
}) {
  const id = useId();
  const note = error ? `${id}-err` : hint ? `${id}-hint` : undefined;
  return (
    <>
      {/* As tall as one input and centred in it, so it stays beside its input when matches or an error show below. */}
      <label htmlFor={id} className="t-body-sm flex min-h-11 flex-col justify-center font-semibold">
        {label}
        {optional && <span className="block font-normal text-ink-muted">optional</span>}
      </label>
      <div className="flex min-w-0 flex-col gap-1">
        {children({ id, describedBy: note, invalid: !!error })}
        {error ? (
          <span id={`${id}-err`} className="t-body-sm font-semibold text-attention">
            {error}
          </span>
        ) : hint ? (
          <span id={`${id}-hint`} className="t-body-sm text-ink-muted">
            {hint}
          </span>
        ) : null}
      </div>
    </>
  );
}

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 border-t border-divider p-0 pt-3">
      <div className="flex items-center justify-between gap-2">
        <legend className="t-label float-left p-0 text-ink-muted">{title}</legend>
        {action}
      </div>
      <div className={ROWS}>{children}</div>
    </fieldset>
  );
}

/**
 * Takes the place of the list while it's open (the pane widens for it), so it never scrolls inside
 * a box of its own. The title bar (with ×) and the actions stay pinned if the pane is shorter than
 * the form. Esc closes it.
 */
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
  const first = useRef<HTMLInputElement>(null);

  useEffect(() => first.current?.focus(), []);

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

  const stopRows = (k: string, s: StopDraft, set: (p: Partial<StopDraft>) => void, contact: boolean) => (
    <>
      <Field label="Address" error={errs[`${k}-addr`]}>
        {(a) => (
          <AddressFinder
            id={a.id}
            value={s.address}
            invalid={a.invalid}
            describedBy={a.describedBy}
            onChange={(address) => set({ address })}
            onPick={(p) => {
              // Keep what the dispatcher typed if they typed it: it's what the driver will read.
              set({ coords: `${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}`, address: s.address.trim() ? s.address : p.label });
              setErrs(({ [`${k}-addr`]: _a, [`${k}-coords`]: _c, ...rest }) => rest);
            }}
          />
        )}
      </Field>
      <Field label="Coordinates" error={errs[`${k}-coords`]}>
        {(a) => (
          <input
            id={a.id}
            value={s.coords}
            onChange={(e) => set({ coords: e.target.value })}
            inputMode="decimal"
            placeholder="Use Find, or type latitude, longitude"
            aria-invalid={a.invalid}
            aria-describedby={a.describedBy}
            className={`${inputCls(a.invalid)} font-mono`}
          />
        )}
      </Field>
      {contact && (
        <>
          <Field label="Site contact" optional>
            {(a) => <input id={a.id} value={s.contactName} onChange={(e) => set({ contactName: e.target.value })} className={inputCls()} />}
          </Field>
          <Field label="Contact phone" optional>
            {(a) => (
              <input id={a.id} value={s.contactPhone} onChange={(e) => set({ contactPhone: e.target.value })} type="tel" className={inputCls()} />
            )}
          </Field>
        </>
      )}
    </>
  );

  return (
    <form
      onSubmit={submit}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onCancel();
      }}
      noValidate
      aria-label="New delivery"
      className="flex flex-col"
    >
      <div className="sticky top-0 z-[1] flex items-center justify-between gap-2 border-b border-divider bg-surface-100 py-1.5 ps-4 pe-1.5">
        <h2 className="t-h2 m-0">New delivery</h2>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Close the new delivery form"
          className="flex h-11 w-11 items-center justify-center rounded-md border-0 bg-transparent text-ink"
        >
          <X size={20} strokeWidth={2.5} aria-hidden="true" />
        </button>
      </div>

      <div className="flex flex-col gap-3 px-4 pt-1 pb-3">
        {create.isError && (
          <div role="alert" className="mt-2 flex flex-col gap-1 rounded-md border border-status-failed bg-status-failed-bg px-3 py-2.5">
            <span className="t-body-sm font-bold">Not created</span>
            <span className="t-mono">{isConflict(create.error) ? `409 · ${create.error.message}` : create.error.message}</span>
          </div>
        )}

        <Section title="Customer">
          <Field label="Name" error={errs.customer}>
            {(a) => (
              <input
                ref={first}
                id={a.id}
                value={customer}
                onChange={(e) => setCustomer(e.target.value)}
                aria-invalid={a.invalid}
                aria-describedby={a.describedBy}
                className={inputCls(a.invalid)}
              />
            )}
          </Field>
          <Field label="Phone" optional>
            {(a) => <input id={a.id} value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" className={inputCls()} />}
          </Field>
        </Section>

        <Section title="Stop 1 · Pickup">
          {stopRows('p', pickup, (x) => setPickup({ ...pickup, ...x }), false)}
        </Section>

        {drops.map((s, i) => (
          <Section
            key={i}
            title={`Stop ${i + 2} · Drop-off`}
            action={
              drops.length > 1 && (
                <button
                  type="button"
                  onClick={() => {
                    setDrops(drops.filter((_, j) => j !== i));
                    setErrs({});
                  }}
                  aria-label={`Remove stop ${i + 2}`}
                  className="min-h-11 rounded-md border border-border bg-surface-100 px-2.5 text-[12px] font-semibold text-ink"
                >
                  Remove
                </button>
              )
            }
          >
            {stopRows(
              `d${i}`,
              s,
              (x) => setDrops(drops.map((d, j) => (j === i ? { ...d, ...x } : d))),
              true,
            )}
          </Section>
        ))}

        <button
          type="button"
          onClick={() => setDrops([...drops, blank()])}
          className="min-h-11 self-start rounded-md border border-dashed border-border bg-transparent px-3 text-[13px] font-semibold text-ink"
        >
          + Add drop-off
        </button>

        <Section title="Load">
          <Field label="Goods" optional>
            {(a) => <input id={a.id} value={goods} onChange={(e) => setGoods(e.target.value)} className={inputCls()} />}
          </Field>
        </Section>
      </div>

      <div className="sticky bottom-0 z-[1] flex gap-3 border-t border-divider bg-surface-100 px-4 py-3">
        <button
          type="submit"
          disabled={create.isPending}
          className="min-h-11 flex-1 rounded-md border-0 bg-ink text-[14px] font-semibold text-surface-100 disabled:opacity-45"
        >
          {create.isPending ? 'Creating…' : 'Create as pending'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="min-h-11 rounded-md border border-border bg-surface-100 px-5 text-[14px] font-semibold text-ink"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
