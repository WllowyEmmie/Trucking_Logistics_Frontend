'use client';

import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { patch, post } from '@/lib/api';
import type { CreateTruckRequest, Truck, UpdatedTruck } from '@/lib/types';
import { fieldCls, formCls, hintCls, normPlate, radioCls, submitCls } from './forms';
import { FormResult } from './FormResult';

interface Props {
  trucks: Truck[];
  onAdded: (t: Truck) => void;
}

type StartsAs = 'available' | 'maintenance';

const PLATE_HINT = 'As on the vehicle. Spaces, hyphens and dots are ignored when checking for duplicates.';
const STARTS_AS: [StartsAs, string][] = [
  ['available', 'Available'],
  ['maintenance', 'In maintenance'],
];

// POST /trucks takes a plate and a model; "Starts as" maintenance is a PATCH straight after, since
// the API creates every truck available. Capacity needs backend fields. TODO(fleet-api)
export function AddTruckForm({ trucks, onAdded }: Props) {
  const [plate, setPlate] = useState('');
  const [model, setModel] = useState('');
  const [startsAs, setStartsAs] = useState<StartsAs>('available');
  const [plateErr, setPlateErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  // The truck was added but the PATCH to maintenance was refused: it exists, and is available.
  const [statusErr, setStatusErr] = useState<Error | null>(null);

  const add = useMutation({
    mutationFn: async ({ body, status }: { body: CreateTruckRequest; status: StartsAs }) => {
      const t = await post<Truck>('/trucks', body);
      if (status === 'available') return { t, err: null };
      try {
        return { t: { ...t, ...(await patch<UpdatedTruck>(`/trucks/${t.id}`, { status })) }, err: null };
      } catch (e) {
        return { t, err: e instanceof Error ? e : new Error(String(e)) };
      }
    },
    onSuccess: ({ t, err }) => {
      onAdded(t);
      setStatusErr(err);
      setOk(
        err
          ? null
          : `Added ${t.plate_number}. It shows as ${t.status === 'maintenance' ? 'Maintenance' : 'Available'} in the console now; it appears on the map after its first position.`,
      );
      setPlate('');
      setModel('');
      setStartsAs('available');
    },
  });

  // Local hint only: the server's 409 decides.
  const key = normPlate(plate);
  const dup = key ? trucks.find((t) => normPlate(t.plate_number) === key) : undefined;
  const plateHint = plateErr ?? (dup ? `${dup.plate_number} is already in the fleet.` : PLATE_HINT);

  const touched = () => {
    setOk(null);
    setStatusErr(null);
    add.reset();
  };

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!key) {
      setPlateErr('Enter the plate number');
      return;
    }
    setPlateErr(null);
    add.mutate({ body: { plate_number: plate.trim().replace(/\s+/g, ' ').toUpperCase(), model: model.trim() || null }, status: startsAs });
  }

  return (
    <form onSubmit={submit} noValidate aria-label="Add a truck" className={formCls}>
      <h2 className="t-h1 m-0">Add a truck</h2>
      <FormResult
        error={add.error ?? statusErr}
        ok={ok}
        title={statusErr ? `Added ${add.data?.t.plate_number ?? 'the truck'}, but it's Available, not in maintenance` : undefined}
      />
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
      <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
        <legend className="t-h3 mb-1.5 p-0">Starts as</legend>
        <div role="radiogroup" aria-label="Starts as" className="flex flex-wrap gap-2">
          {STARTS_AS.map(([k, label]) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={startsAs === k}
              onClick={() => {
                setStartsAs(k);
                touched();
              }}
              className={radioCls(startsAs === k)}
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
