'use client';

import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { post } from '@/lib/api';
import type { Driver, Truck } from '@/lib/types';
import { fieldCls, formCls, hintCls, normPhone, submitCls } from './forms';
import { FormResult } from './FormResult';

interface Props {
  drivers: Driver[];
  trucks: Truck[];
  onAdded: (d: Driver) => void;
}

const PHONE_HINT = 'Include the country code, e.g. +44. Used for calls from dispatch and the app link.';

export function AddDriverForm({ drivers, trucks, onAdded }: Props) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [truckId, setTruckId] = useState('');
  const [sms, setSms] = useState(true);
  const [errs, setErrs] = useState<{ name?: string; phone?: string }>({});
  const [ok, setOk] = useState<string | null>(null);

  const add = useMutation({
    mutationFn: () =>
      post<Driver>('/drivers', {
        name: name.trim(),
        phone: phone.trim(),
        // TODO(fleet-api): driver–truck link and the app-link SMS need backend support.
        truck_id: truckId || null,
        send_app_link: sms,
      }),
    onSuccess: (d) => {
      onAdded(d);
      setOk(`Added ${d.name}.${sms ? ` App link texted to ${d.phone}.` : ''}`);
      setName('');
      setPhone('');
      setTruckId('');
      setSms(true);
    },
  });

  const touched = () => {
    setOk(null);
    add.reset();
  };

  // Only trucks with no usual driver.
  const taken = new Set(drivers.map((d) => d.truck_id).filter(Boolean));
  const options = trucks.filter((t) => !taken.has(t.id)).sort((a, b) => a.plate_number.localeCompare(b.plate_number));

  function submit(e: FormEvent) {
    e.preventDefault();
    const next: typeof errs = {};
    const ph = normPhone(phone);
    if (!name.trim()) next.name = "Enter the driver's name";
    if (!ph) next.phone = 'Enter a mobile number';
    else if (!/^\+\d{7,15}$/.test(ph)) next.phone = 'Start with + and the country code, then the number';
    setErrs(next);
    if (Object.keys(next).length === 0) add.mutate();
  }

  return (
    <form onSubmit={submit} noValidate aria-label="Add a driver" className={formCls}>
      <h2 className="t-h1 m-0">Add a driver</h2>
      <FormResult error={add.error} ok={ok} />
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
          {options.map((t) => (
            <option key={t.id} value={t.id}>
              {t.plate_number} · {t.model ?? 'model not given'}
            </option>
          ))}
        </select>
        <span id="driver-truck-hint" className={hintCls()}>
          Only trucks with no usual driver are listed.
        </span>
      </label>
      <label className="flex cursor-pointer items-start gap-2.5">
        <input
          type="checkbox"
          checked={sms}
          onChange={(e) => {
            setSms(e.target.checked);
            touched();
          }}
          className="m-[11px] h-[22px] w-[22px] flex-none"
          style={{ accentColor: 'var(--ink)' }}
        />
        <span className="flex flex-col gap-0.5 pt-2.5">
          <span className="t-h3">Text the driver a link to the app</span>
          <span className="t-body-sm text-ink-muted">They open it once on their phone; no password.</span>
        </span>
      </label>
      <button type="submit" disabled={add.isPending} className={submitCls}>
        {add.isPending ? 'Adding…' : 'Add driver'}
      </button>
    </form>
  );
}
