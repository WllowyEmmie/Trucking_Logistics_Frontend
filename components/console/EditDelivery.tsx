'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { ApiError, patch } from '@/lib/api';
import { DELIVERIES_KEY, detailKey } from '@/lib/deliveries';
import type { DeliveryDetailResponse } from '@/lib/types';
import { AddressFinder } from './AddressFinder';
import { inputCls } from './ui';

// Fix a delivery's details before the truck sets off: PATCH /deliveries/{id} (Go: internal/api/edit.go).
// Only pending and assigned deliveries, and only stops not reached yet. A new address must come from
// Find, so the pin moves with it. The assigned driver gets a message saying what changed.

/** Statuses a delivery can be edited in. In transit: fail it and create a new one. */
export const EDITABLE = new Set(['pending', 'assigned']);

interface StopDraft {
  id: string;
  label: string;
  locked: boolean;
  address: string;
  lat: number | null;
  lng: number | null;
  /** The address was typed but no match picked yet: the pin would be wrong. */
  unpicked: boolean;
  contactName: string;
  contactPhone: string;
}

export function EditDelivery({ detail, onDone }: { detail: DeliveryDetailResponse; onDone: (changes: string[]) => void }) {
  const qc = useQueryClient();
  const d = detail.delivery;
  const [name, setName] = useState(d.customer_name);
  const [phone, setPhone] = useState(d.customer_phone ?? '');
  const [goods, setGoods] = useState(d.goods_desc ?? '');
  const [stops, setStops] = useState<StopDraft[]>(() =>
    detail.stops.map((s) => ({
      id: s.id,
      label: `${s.stop_type === 'pickup' ? 'Pickup' : 'Drop-off'}${detail.stops.length > 2 ? ` · stop ${s.sequence}` : ''}`,
      locked: s.status !== 'pending',
      address: s.address,
      lat: s.lat,
      lng: s.lng,
      unpicked: false,
      contactName: s.contact_name ?? '',
      contactPhone: s.contact_phone ?? '',
    })),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (i: number, p: Partial<StopDraft>) => setStops((ss) => ss.map((s, j) => (j === i ? { ...s, ...p } : s)));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError("The customer's name can't be empty.");
    const bad = stops.find((s) => s.unpicked);
    if (bad) return setError(`${bad.label}: press Find and pick the address, so the pin moves too.`);

    const body: Record<string, unknown> = {};
    if (name.trim() !== d.customer_name) body.customer_name = name.trim();
    if (phone.trim() !== (d.customer_phone ?? '')) body.customer_phone = phone.trim();
    if (goods.trim() !== (d.goods_desc ?? '')) body.goods_desc = goods.trim();
    const stopEdits = stops.flatMap((s) => {
      const was = detail.stops.find((x) => x.id === s.id)!;
      const out: Record<string, unknown> = { id: s.id };
      if (s.address.trim() !== was.address || s.lat !== was.lat || s.lng !== was.lng) Object.assign(out, { address: s.address.trim(), lat: s.lat, lng: s.lng });
      if (s.contactName.trim() !== (was.contact_name ?? '')) out.contact_name = s.contactName.trim();
      if (s.contactPhone.trim() !== (was.contact_phone ?? '')) out.contact_phone = s.contactPhone.trim();
      return Object.keys(out).length > 1 ? [out] : [];
    });
    if (stopEdits.length) body.stops = stopEdits;
    if (!Object.keys(body).length) return onDone([]);

    setBusy(true);
    try {
      const res = await patch<{ changes: string[] }>(`/deliveries/${encodeURIComponent(d.id)}`, body);
      void qc.invalidateQueries({ queryKey: detailKey(d.id) });
      void qc.invalidateQueries({ queryKey: DELIVERIES_KEY });
      onDone(res.changes);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the changes.');
      if (err instanceof ApiError && err.status === 409) void qc.invalidateQueries({ queryKey: detailKey(d.id) });
    } finally {
      setBusy(false);
    }
  }

  const label = 'text-[11px] font-medium text-ink-muted';
  return (
    <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-3" noValidate aria-label={`Edit ${d.reference}`}>
      <label className="flex flex-col gap-1">
        <span className={label}>Customer</span>
        <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls(!name.trim())} maxLength={200} />
      </label>
      <label className="flex flex-col gap-1">
        <span className={label}>Phone</span>
        <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" className={inputCls()} maxLength={40} />
      </label>
      <label className="flex flex-col gap-1">
        <span className={label}>Goods</span>
        <input value={goods} onChange={(e) => setGoods(e.target.value)} className={inputCls()} maxLength={300} />
      </label>

      {stops.map((s, i) => (
        <fieldset key={s.id} className="m-0 flex flex-col gap-2 rounded-xl border border-divider p-2.5" disabled={s.locked}>
          <legend className="px-1 text-[12px] font-semibold">
            {s.label}
            {s.locked && <span className="font-normal text-ink-muted"> · already reached</span>}
          </legend>
          {s.locked ? (
            <span className="text-[12px] text-ink-muted wrap-anywhere">{s.address}</span>
          ) : (
            <>
              <AddressFinder
                id={`edit-stop-${s.id}`}
                value={s.address}
                invalid={s.unpicked}
                onChange={(address) => set(i, { address, unpicked: address.trim() !== detail.stops[i]!.address })}
                onPick={(p) => set(i, { address: p.label, lat: p.lat, lng: p.lng, unpicked: false })}
              />
              {s.unpicked && <span className="text-[11.5px] font-semibold text-attention">Press Find and pick the address.</span>}
              <div className="grid grid-cols-2 gap-2">
                <input value={s.contactName} onChange={(e) => set(i, { contactName: e.target.value })} placeholder="Site contact" aria-label={`${s.label} contact name`} className={inputCls()} maxLength={120} />
                <input value={s.contactPhone} onChange={(e) => set(i, { contactPhone: e.target.value })} placeholder="Contact phone" inputMode="tel" aria-label={`${s.label} contact phone`} className={inputCls()} maxLength={40} />
              </div>
            </>
          )}
        </fieldset>
      ))}

      {d.status === 'assigned' && <p className="m-0 text-[11.5px] text-ink-muted">The driver gets a message with what changed.</p>}
      {error && (
        <p role="alert" className="m-0 text-[12px] font-semibold text-attention">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className="min-h-10 flex-1 rounded-xl border-0 bg-brand px-3 text-[13px] font-semibold text-brand-ink disabled:opacity-50">
          {busy ? 'Saving…' : 'Save changes'}
        </button>
        <button type="button" onClick={() => onDone([])} disabled={busy} className="min-h-10 flex-1 rounded-xl border border-border bg-surface-100 px-3 text-[13px] font-semibold text-ink">
          Cancel
        </button>
      </div>
    </form>
  );
}
