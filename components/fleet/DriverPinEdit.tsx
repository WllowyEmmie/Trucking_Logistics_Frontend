'use client';

import { useMutation } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { post } from '@/lib/api';
import type { Driver } from '@/lib/types';
import { fieldCls, hintCls, pinProblem } from './forms';
import { FormResult } from './FormResult';
import { PinReveal } from './PinReveal';

/**
 * A driver's app PIN. Generate is the main way: the server makes a random 6-digit PIN, shows it
 * once to send on, and the old PIN stops working (the driver's phones are signed out). Choosing a
 * PIN by hand is still there for reading one out over the phone.
 */
export function DriverPinEdit({ driver, onSaved, onClose }: { driver: Driver; onSaved: () => void; onClose: () => void }) {
  const [issued, setIssued] = useState<string | null>(null);
  const [manual, setManual] = useState(false);
  const [pin, setPin] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const generate = useMutation({
    mutationFn: () => post<{ pin: string }>(`/drivers/${encodeURIComponent(driver.id)}/pin/generate`),
    onSuccess: (r) => {
      setIssued(r.pin);
      onSaved();
    },
  });
  const save = useMutation({
    mutationFn: (p: string) => post(`/drivers/${encodeURIComponent(driver.id)}/pin`, { pin: p }),
    onSuccess: () => {
      onSaved();
      onClose();
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    const problem = pinProblem(pin);
    setErr(problem);
    if (!problem) save.mutate(pin);
  }

  if (issued) {
    return (
      <div className="bg-surface-200 px-4 py-3.5">
        <PinReveal pin={issued} name={driver.name} phone={driver.phone} onDone={onClose} />
      </div>
    );
  }

  const id = `pin-${driver.id}`;
  return (
    <div className="flex flex-col gap-3 bg-surface-200 px-4 py-3.5">
      <FormResult error={generate.error ?? save.error} ok={null} title="PIN not set" />
      <div className="flex flex-col gap-1.5">
        <span className="t-h3">{driver.has_pin ? 'New app PIN' : 'App PIN'}</span>
        <span className="t-body-sm text-ink-muted">
          {driver.has_pin
            ? `${driver.name}'s current PIN stops working and their phone is signed out.`
            : `${driver.name} signs in to the driver app with their phone number and this PIN.`}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => generate.mutate()}
          disabled={generate.isPending}
          className="inline-flex min-h-11 items-center gap-2 rounded-md border-0 bg-ink px-4 text-[14px] font-semibold text-surface-100 disabled:opacity-45"
        >
          <RefreshCw size={16} strokeWidth={2.5} aria-hidden="true" />
          {generate.isPending ? 'Generating…' : driver.has_pin ? 'Generate a new PIN' : 'Generate PIN'}
        </button>
        <button type="button" onClick={onClose} className="min-h-11 rounded-md border border-border bg-surface-100 px-4 text-[14px] font-semibold text-ink">
          Cancel
        </button>
        {!manual && (
          <button
            type="button"
            onClick={() => setManual(true)}
            className="t-body-sm min-h-11 border-0 bg-transparent px-1 font-semibold text-ink underline underline-offset-2"
          >
            Choose one myself
          </button>
        )}
      </div>

      {manual && (
        <form onSubmit={submit} noValidate aria-label={`Set ${driver.name}'s PIN`} className="flex flex-col gap-1.5 border-t border-divider pt-3">
          <label htmlFor={id} className="t-h3">
            Your own PIN
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <input
              id={id}
              value={pin}
              onChange={(e) => {
                setPin(e.target.value.replace(/\D/g, ''));
                setErr(null);
                save.reset();
              }}
              inputMode="numeric"
              maxLength={8}
              autoComplete="off"
              aria-invalid={!!err}
              aria-describedby={`${id}-hint`}
              className={`${fieldCls(!!err, true)} max-w-[200px]`}
            />
            <button type="submit" disabled={!pin || save.isPending} className="min-h-11 rounded-md border border-border bg-surface-100 px-4 text-[14px] font-semibold text-ink disabled:opacity-45">
              {save.isPending ? 'Saving…' : 'Set PIN'}
            </button>
          </div>
          <span id={`${id}-hint`} className={hintCls(!!err)}>
            {err ?? '4 to 8 digits. A generated 6-digit PIN is harder to guess than one picked by hand.'}
          </span>
        </form>
      )}
    </div>
  );
}
