'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { isConflict, patch } from '@/lib/api';
import { TRUCKS_KEY } from '@/lib/positions';
import type { Driver, Truck, UpdatedTruck, UpdateTruckRequest } from '@/lib/types';
import { fieldCls, hintCls } from './forms';
import { FormResult } from './FormResult';

type SettableStatus = NonNullable<UpdateTruckRequest['status']>;

/** on_delivery isn't offered: it comes from assigning a delivery, and the API refuses it by hand. */
const STATUSES: [SettableStatus, string][] = [
  ['available', 'Available'],
  ['maintenance', 'In maintenance'],
  ['offline', 'Offline'],
];

interface Props {
  truck: Truck;
  drivers: Driver[];
  /** Plates by driver id, to say whose usual driver someone already is. */
  usualTruckOf: (driverId: string) => string | null;
  onSaved: (t: UpdatedTruck) => void;
  onClose: () => void;
}

/**
 * PATCH /trucks/{id}, sending only what changed: a field left out is kept, and `driver_id: ""`
 * unassigns. A truck on a delivery can't change status (409), so that control is disabled.
 */
export function TruckEdit({ truck, drivers, usualTruckOf, onSaved, onClose }: Props) {
  const qc = useQueryClient();
  const busy = truck.status === 'on_delivery';
  const [status, setStatus] = useState<SettableStatus | 'on_delivery'>(truck.status);
  const [driverId, setDriverId] = useState(truck.driver_id ?? '');

  const save = useMutation({
    mutationFn: (body: UpdateTruckRequest) => patch<UpdatedTruck>(`/trucks/${encodeURIComponent(truck.id)}`, body),
    onSuccess: (t) => {
      onSaved(t);
      onClose();
    },
    // The truck changed under us (e.g. it was just assigned): show the server's words and refetch.
    onError: (e) => {
      if (isConflict(e)) void qc.invalidateQueries({ queryKey: TRUCKS_KEY });
    },
  });

  // Once the truck is on a delivery (even if that happened while this was open), its status is fixed.
  const shownStatus = busy ? 'on_delivery' : status;
  const body: UpdateTruckRequest = {};
  if (!busy && status !== truck.status && status !== 'on_delivery') body.status = status;
  if (driverId !== (truck.driver_id ?? '')) body.driver_id = driverId;
  const changed = Object.keys(body).length > 0;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (changed) save.mutate(body);
  }

  const id = `edit-${truck.id}`;
  return (
    <form onSubmit={submit} noValidate aria-label={`Edit ${truck.plate_number}`} className="flex flex-col gap-3 px-4 py-3.5">
      <FormResult error={save.error} ok={null} title="Not saved" />
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        <label className="flex flex-col gap-1.5">
          <span className="t-h3">Status</span>
          <select
            value={shownStatus}
            disabled={busy}
            aria-describedby={`${id}-status-hint`}
            onChange={(e) => {
              setStatus(e.target.value as SettableStatus);
              save.reset();
            }}
            className={`${fieldCls()} disabled:opacity-60`}
          >
            {busy && <option value="on_delivery">On delivery</option>}
            {STATUSES.map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
          <span id={`${id}-status-hint`} className={hintCls()}>
            {busy ? 'On a delivery: complete, fail or cancel it first.' : 'On delivery is set by assigning a delivery.'}
          </span>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="t-h3">Usual driver</span>
          <select
            value={driverId}
            onChange={(e) => {
              setDriverId(e.target.value);
              save.reset();
            }}
            className={fieldCls()}
          >
            <option value="">No usual driver</option>
            {drivers.map((d) => {
              const other = usualTruckOf(d.id);
              return (
                <option key={d.id} value={d.id}>
                  {d.name}
                  {other && other !== truck.plate_number ? ` · usual driver of ${other}` : ''}
                </option>
              );
            })}
          </select>
        </label>
      </div>
      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={!changed || save.isPending}
          className="min-h-11 rounded-md border-0 bg-ink px-4 text-[14px] font-semibold text-surface-100 disabled:opacity-45"
        >
          {save.isPending ? 'Saving…' : 'Save'}
        </button>
        <button type="button" onClick={onClose} className="min-h-11 rounded-md border border-border bg-surface-100 px-4 text-[14px] font-semibold text-ink">
          Cancel
        </button>
      </div>
    </form>
  );
}
