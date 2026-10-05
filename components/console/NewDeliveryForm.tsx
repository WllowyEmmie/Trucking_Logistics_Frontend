'use client';

import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { post } from '@/lib/api';
import type { Delivery } from '@/lib/types';
import { inputCls, textareaCls } from './ui';

interface Props {
  defaultPickup: string;
  onCreated: (d: Delivery) => void;
  onCancel: () => void;
}

type Errs = Record<string, string>;

export function NewDeliveryForm({ defaultPickup, onCreated, onCancel }: Props) {
  const [customer, setCustomer] = useState('');
  const [phone, setPhone] = useState('');
  const [pickup, setPickup] = useState(defaultPickup);
  const [drops, setDrops] = useState<string[]>(['']);
  const [goods, setGoods] = useState('');
  const [errs, setErrs] = useState<Errs>({});

  const create = useMutation({
    mutationFn: () =>
      post<Delivery>('/deliveries', {
        customer_name: customer.trim(),
        customer_phone: phone.trim() || null,
        goods: goods.trim() || null,
        stops: [
          { kind: 'pickup', address: pickup.trim() },
          ...drops.map((address) => ({ kind: 'dropoff', address: address.trim() })),
        ],
      }),
    onSuccess: onCreated,
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    const next: Errs = {};
    if (!customer.trim()) next.customer = 'Enter the customer';
    if (!pickup.trim()) next.pickup = 'Enter the pickup address';
    drops.forEach((d, i) => {
      if (!d.trim()) next['d' + i] = 'Enter an address or remove this stop';
    });
    setErrs(next);
    if (Object.keys(next).length === 0) create.mutate();
  }

  const err = (k: string) =>
    errs[k] ? (
      <span id={`nd-${k}-err`} className="t-body-sm font-semibold text-attention">
        {errs[k]}
      </span>
    ) : null;

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
          <span className="t-mono">{create.error.message}</span>
        </div>
      )}
      <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        <label className="flex flex-col gap-1">
          <span className="t-body-sm font-semibold">Customer</span>
          <input
            value={customer}
            onChange={(e) => setCustomer(e.target.value)}
            aria-invalid={!!errs.customer}
            aria-describedby={errs.customer ? 'nd-customer-err' : undefined}
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
      <label className="flex flex-col gap-1">
        <span className="t-body-sm font-semibold">Stop 1 · Pickup</span>
        <textarea
          value={pickup}
          onChange={(e) => setPickup(e.target.value)}
          rows={2}
          aria-invalid={!!errs.pickup}
          aria-describedby={errs.pickup ? 'nd-pickup-err' : undefined}
          className={textareaCls(!!errs.pickup)}
        />
        {err('pickup')}
      </label>
      {drops.map((v, i) => {
        const label = `Stop ${i + 2} · Drop-off`;
        return (
          <div key={i} className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2">
              <span className="t-body-sm font-semibold" id={`nd-d${i}-label`}>
                {label}
              </span>
              {drops.length > 1 && (
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
              )}
            </div>
            <textarea
              value={v}
              onChange={(e) => setDrops(drops.map((x, j) => (j === i ? e.target.value : x)))}
              aria-labelledby={`nd-d${i}-label`}
              aria-invalid={!!errs['d' + i]}
              aria-describedby={errs['d' + i] ? `nd-d${i}-err` : undefined}
              rows={2}
              className={textareaCls(!!errs['d' + i])}
            />
            {err('d' + i)}
          </div>
        );
      })}
      <button
        type="button"
        onClick={() => setDrops([...drops, ''])}
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
