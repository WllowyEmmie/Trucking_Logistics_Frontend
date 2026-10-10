'use client';

import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { patch, post } from '@/lib/api';
import type { CreateDriverRequest, Driver, Truck, UpdatedTruck } from '@/lib/types';
import { fieldCls, formCls, hintCls, normPhone, submitCls } from './forms';
import { FormResult } from './FormResult';

interface Props {
  trucks: Truck[];
  /** `truck` is the usual truck as the PATCH returned it, when one was set. */
  onAdded: (d: Driver, truck: UpdatedTruck | null) => void;
}

const PHONE_HINT = 'Include the country code, e.g. +44. Used for calls from dispatch.';

// POST /drivers takes a name and a phone. The usual truck is the truck's driver_id, so it's a
// PATCH /trucks/{id} straight after. The app-link SMS needs an endpoint. TODO(fleet-api)
export function AddDriverForm({ trucks, onAdded }: Props) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [truckId, setTruckId] = useState('');
  const [errs, setErrs] = useState<{ name?: string; phone?: string }>({});
  const [ok, setOk] = useState<string | null>(null);
  // The driver was added but the PATCH linking the truck was refused.
  const [truckErr, setTruckErr] = useState<Error | null>(null);

  const free = trucks.filter((t) => !t.driver_id);

  const add = useMutation({
    mutationFn: async ({ body, truckId }: { body: CreateDriverRequest; truckId: string }) => {
      const d = await post<Driver>('/drivers', body);
      if (!truckId) return { d, truck: null, err: null };
      try {
        return { d, truck: await patch<UpdatedTruck>(`/trucks/${truckId}`, { driver_id: d.id }), err: null };
      } catch (e) {
        return { d, truck: null, err: e instanceof Error ? e : new Error(String(e)) };
      }
    },
    onSuccess: ({ d, truck, err }) => {
      onAdded(d, truck);
      setTruckErr(err);
      setOk(err ? null : truck ? `Added ${d.name}, usual truck ${truck.plate_number}.` : `Added ${d.name}.`);
      setName('');
      setPhone('');
      setTruckId('');
    },
  });

  const touched = () => {
    setOk(null);
    setTruckErr(null);
    add.reset();
  };

  function submit(e: FormEvent) {
    e.preventDefault();
    const next: typeof errs = {};
    const ph = normPhone(phone);
    if (!name.trim()) next.name = "Enter the driver's name";
    if (!ph) next.phone = 'Enter a mobile number';
    else if (!/^\+\d{7,15}$/.test(ph)) next.phone = 'Start with + and the country code, then the number';
    setErrs(next);
    if (Object.keys(next).length === 0) add.mutate({ body: { name: name.trim(), phone: phone.trim() }, truckId });
  }

  return (
    <form onSubmit={submit} noValidate aria-label="Add a driver" className={formCls}>
      <h2 className="t-h1 m-0">Add a driver</h2>
      <FormResult
        error={add.error ?? truckErr}
        ok={ok}
        title={truckErr ? `Added ${add.data?.d.name ?? 'the driver'}, but the usual truck wasn't set` : undefined}
      />
      <label className="flex flex-col gap-1.5">
        <span className="t-h3">Full name</span>
        <input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setErrs((x) => ({ ...x, name: undefined }));
            touched();
          }}
          autoComplete="off"
          aria-invalid={!!errs.name}
          aria-describedby={errs.name ? 'driver-name-err' : undefined}
          className={fieldCls(!!errs.name)}
        />
        {errs.name && (
          <span id="driver-name-err" className={hintCls(true)}>
            {errs.name}
          </span>
        )}
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="t-h3">Mobile phone</span>
        <input
          value={phone}
          onChange={(e) => {
            setPhone(e.target.value);
            setErrs((x) => ({ ...x, phone: undefined }));
            touched();
          }}
          type="tel"
          autoComplete="off"
          aria-invalid={!!errs.phone}
          aria-describedby="driver-phone-hint"
          className={fieldCls(!!errs.phone, true)}
        />
        <span id="driver-phone-hint" className={hintCls(!!errs.phone)}>
          {errs.phone ?? PHONE_HINT}
        </span>
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="t-h3">
          Usual truck <span className="font-normal text-ink-muted">(optional)</span>
        </span>
        <select
          value={truckId}
          onChange={(e) => {
            setTruckId(e.target.value);
            touched();
          }}
          aria-describedby="driver-truck-hint"
          className={fieldCls()}
        >
          <option value="">None — assign per delivery</option>
          {free.map((t) => (
            <option key={t.id} value={t.id}>
              {t.plate_number} · {t.model || 'model not given'}
            </option>
          ))}
        </select>
        <span id="driver-truck-hint" className={hintCls()}>
          Only trucks with no usual driver are listed.
        </span>
      </label>
      <button type="submit" disabled={add.isPending} className={submitCls}>
        {add.isPending ? 'Adding…' : 'Add driver'}
      </button>
    </form>
  );
}
