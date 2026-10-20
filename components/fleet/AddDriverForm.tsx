'use client';

import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { PhoneInput } from '@/components/PhoneInput';
import { patch, post } from '@/lib/api';
import { useConfig } from '@/lib/config';
import { defaultPhoneCountry, emptyPhone, phoneProblem, toE164, type PhoneValue } from '@/lib/phone';
import type { CreateDriverRequest, Driver, Truck, UpdatedTruck } from '@/lib/types';
import { driverRequest, fieldCls, formCls, hintCls, submitCls } from './forms';
import { FormResult } from './FormResult';
import { PinReveal } from './PinReveal';

interface Props {
  trucks: Truck[];
  /** `truck` is the usual truck as the PATCH returned it, when one was set. */
  onAdded: (d: Driver, truck: UpdatedTruck | null) => void;
}

const PHONE_HINT = 'Their mobile: they sign in to the driver app with it, and dispatch calls it. A leading 0 is fine.';

// POST /drivers takes a name and a phone. The usual truck is the truck's driver_id, so it's a
// PATCH /trucks/{id} straight after. With generate_pin the API also returns a one-time app PIN.
export function AddDriverForm({ trucks, onAdded }: Props) {
  const [name, setName] = useState('');
  const config = useConfig();
  const homeCountry = defaultPhoneCountry(config);
  const [phone, setPhone] = useState<PhoneValue>(() => emptyPhone(homeCountry));
  const [truckId, setTruckId] = useState('');
  // On by default: a driver without a PIN can't use the app.
  const [genPin, setGenPin] = useState(true);
  // The PIN the server generated for the driver just added: shown once, until Done.
  const [issued, setIssued] = useState<{ pin: string; name: string; phone: string } | null>(null);
  const [errs, setErrs] = useState<{ name?: string; phone?: string }>({});
  const [ok, setOk] = useState<string | null>(null);
  // The driver was added but the PATCH linking the truck was refused.
  const [truckErr, setTruckErr] = useState<Error | null>(null);

  const free = trucks.filter((t) => !t.driver_id);

  const add = useMutation({
    mutationFn: async ({ body, truckId }: { body: CreateDriverRequest; truckId: string }) => {
      const d = await post<Driver & { pin?: string }>('/drivers', body);
      if (!truckId) return { d, truck: null, err: null };
      try {
        return { d, truck: await patch<UpdatedTruck>(`/trucks/${truckId}`, { driver_id: d.id }), err: null };
      } catch (e) {
        return { d, truck: null, err: e instanceof Error ? e : new Error(String(e)) };
      }
    },
    onSuccess: ({ d, truck, err }) => {
      onAdded(d, truck);
      setIssued(d.pin ? { pin: d.pin, name: d.name, phone: d.phone } : null);
      setTruckErr(err);
      setOk(err ? null : truck ? `Added ${d.name}, usual truck ${truck.plate_number}.` : `Added ${d.name}.`);
      setName('');
      // Keep the country picked: the next driver is most likely from the same one.
      setPhone((p) => emptyPhone(p.country));
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
    const r = driverRequest(name, toE164(phone));
    const phoneErr = phoneProblem(phone);
    setErrs(r.ok ? (phoneErr ? { phone: phoneErr } : {}) : { ...r.errs, phone: phoneErr ?? r.errs.phone });
    if (phoneErr) return;
    if (r.ok) add.mutate({ body: { ...r.body, generate_pin: genPin }, truckId });
  }

  return (
    <form onSubmit={submit} noValidate aria-label="Add a driver" className={formCls}>
      <h2 className="t-h1 m-0">Add a driver</h2>
      <FormResult
        error={add.error ?? truckErr}
        ok={ok}
        title={truckErr ? `Added ${add.data?.d.name ?? 'the driver'}, but the usual truck wasn't set` : undefined}
      />
      {issued && <PinReveal pin={issued.pin} name={issued.name} phone={issued.phone} onDone={() => setIssued(null)} />}
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
      <div className="flex flex-col gap-1.5">
        <label htmlFor="driver-phone" className="t-h3">
          Mobile phone
        </label>
        <PhoneInput
          id="driver-phone"
          value={phone}
          onChange={(v) => {
            setPhone(v);
            setErrs((x) => ({ ...x, phone: undefined }));
            touched();
          }}
          autoComplete="off"
          invalid={!!errs.phone}
          describedBy="driver-phone-hint"
          label="Mobile phone"
        />
        <span id="driver-phone-hint" className={hintCls(!!errs.phone)}>
          {errs.phone ?? PHONE_HINT}
        </span>
      </div>
      <label className="flex min-h-11 items-start gap-3">
        <input
          type="checkbox"
          checked={genPin}
          onChange={(e) => {
            setGenPin(e.target.checked);
            touched();
          }}
          className="mt-0.5 h-5 w-5 flex-none accent-[var(--ink)]"
        />
        <span className="flex flex-col gap-0.5">
          <span className="t-h3">Generate an app PIN</span>
          <span className={hintCls()}>
            A random 6-digit PIN, shown once after adding, to text or WhatsApp to the driver. You can generate a new one any time.
          </span>
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
