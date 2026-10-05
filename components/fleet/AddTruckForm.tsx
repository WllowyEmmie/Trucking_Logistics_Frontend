'use client';

import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { post } from '@/lib/api';
import type { Config, Truck } from '@/lib/types';
import { fieldCls, formCls, hintCls, normPlate, radioCls, submitCls } from './forms';
import { FormResult } from './FormResult';

type StartAs = 'available' | 'maintenance';

interface Props {
  trucks: Truck[];
  config: Config;
  onAdded: (t: Truck) => void;
}

const PLATE_HINT = 'As on the vehicle. Spaces, hyphens and dots are ignored when checking for duplicates.';

export function AddTruckForm({ trucks, config, onAdded }: Props) {
  const [plate, setPlate] = useState('');
  const [model, setModel] = useState('');
  const [payload, setPayload] = useState('');
  const [pallets, setPallets] = useState('');
  const [status, setStatus] = useState<StartAs>('available');
  const [plateErr, setPlateErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const add = useMutation({
    mutationFn: () =>
      post<Truck>('/trucks', {
        plate_number: plate.trim().replace(/\s+/g, ' ').toUpperCase(),
        model: model.trim() || null,
        status,
        // TODO(fleet-api): payload and pallet spaces aren't fields on /trucks yet.
        payload_kg: payload ? Number(payload) : null,
        pallet_spaces: pallets ? Number(pallets) : null,
      }),
    onSuccess: (t) => {
      onAdded(t);
      setOk(
        `Added ${t.plate_number}. It shows as ${status === 'available' ? 'Available' : 'Maintenance'} in the console now; it appears on the map after its first position.`,
      );
      setPlate('');
      setModel('');
      setPayload('');
      setPallets('');
      setStatus('available');
    },
  });

  // Local hint only: the server's 409 decides.
  const key = normPlate(plate);
  const dup = key ? trucks.find((t) => normPlate(t.plate_number) === key) : undefined;
  const plateHint = plateErr ?? (dup ? `${dup.plate_number} is already in the fleet.` : PLATE_HINT);

  const touched = () => {
    setOk(null);
    add.reset();
  };

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!key) {
      setPlateErr('Enter the plate number');
      return;
    }
    setPlateErr(null);
    add.mutate();
  }

  return (
    <form onSubmit={submit} noValidate aria-label="Add a truck" className={formCls}>
      <h2 className="t-h1 m-0">Add a truck</h2>
      <FormResult error={add.error} ok={ok} />
      <label className="flex flex-col gap-1.5">
        <span className="t-h3">Plate number</span>
        <input
          value={plate}
          onChange={(e) => {
            setPlate(e.target.value);
            setPlateErr(null);
            touched();
          }}
          autoComplete="off"
          aria-invalid={!!plateErr}
          aria-describedby="truck-plate-hint"
          className={`${fieldCls(!!plateErr, true)} font-medium uppercase`}
        />
        <span id="truck-plate-hint" className={hintCls(!!plateErr || !!dup)}>
          {plateHint}
        </span>
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="t-h3">
          Make and model <span className="font-normal text-ink-muted">(optional)</span>
        </span>
        <input
          value={model}
          onChange={(e) => {
            setModel(e.target.value);
            touched();
          }}
          className={fieldCls()}
        />
      </label>
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        <label className="flex flex-col gap-1.5">
          <span className="t-h3">Payload ({config.mass_unit})</span>
          <input
            value={payload}
            onChange={(e) => {
              setPayload(e.target.value.replace(/\D/g, ''));
              touched();
            }}
            inputMode="numeric"
            className={fieldCls(false, true)}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="t-h3">Pallet spaces</span>
          <input
            value={pallets}
            onChange={(e) => {
              setPallets(e.target.value.replace(/\D/g, ''));
              touched();
            }}
            inputMode="numeric"
            className={fieldCls(false, true)}
          />
        </label>
      </div>
      <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
        <legend className="t-h3 mb-1.5 p-0">Starts as</legend>
        <div role="radiogroup" aria-label="Starts as" className="flex flex-wrap gap-2">
          {(
            [
              ['available', 'Available'],
              ['maintenance', 'In maintenance'],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={status === k}
              onClick={() => {
                setStatus(k);
                touched();
              }}
              className={radioCls(status === k)}
            >
              {label}
            </button>
          ))}
        </div>
      </fieldset>
      <button type="submit" disabled={add.isPending} className={submitCls}>
        {add.isPending ? 'Adding…' : 'Add truck'}
      </button>
    </form>
  );
}
