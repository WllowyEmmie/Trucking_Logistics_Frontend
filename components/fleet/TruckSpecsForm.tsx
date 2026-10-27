'use client';

import { useQueryClient } from '@tanstack/react-query';
import { ImagePlus, Trash2 } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';
import type { Truck } from '@/lib/types';
import {
  BODY_LABEL,
  FUEL_LABEL,
  TRUCK_SPECS_KEY,
  deleteTruckPhoto,
  photoDataUrl,
  putTruckPhoto,
  putTruckSpecs,
  truckPicture,
  type BodyType,
  type Fuel,
  type TruckSpecs,
} from '@/lib/truckSpecs';
import { fieldCls, hintCls } from './forms';

/** A truck's photo and what it is: body type, capacity, size, year and fuel. In the settings card. */
export function TruckSpecsForm({ truck, specs }: { truck: Truck; specs: TruckSpecs | undefined }) {
  const qc = useQueryClient();
  const file = useRef<HTMLInputElement>(null);
  const [body, setBody] = useState<BodyType | ''>(specs?.body_type ?? '');
  const [tonnes, setTonnes] = useState(specs?.capacity_kg != null ? String(specs.capacity_kg / 1000) : '');
  const [length, setLength] = useState(specs?.body_length_m != null ? String(specs.body_length_m) : '');
  const [pallets, setPallets] = useState(specs?.pallets != null ? String(specs.pallets) : '');
  const [year, setYear] = useState(specs?.year != null ? String(specs.year) : '');
  const [fuel, setFuel] = useState<Fuel | ''>(specs?.fuel ?? '');
  const [state, setState] = useState<{ kind: 'idle' | 'saving' | 'saved' } | { kind: 'error'; msg: string }>({ kind: 'idle' });
  const [photoBusy, setPhotoBusy] = useState(false);
  const pic = truckPicture(truck.id, specs);

  const num = (v: string) => (v.trim() === '' ? null : Number(v));
  async function save(e: FormEvent) {
    e.preventDefault();
    setState({ kind: 'saving' });
    try {
      const t = num(tonnes);
      await putTruckSpecs(truck.id, {
        body_type: body || null,
        capacity_kg: t === null ? null : Math.round(t * 1000),
        body_length_m: num(length),
        pallets: num(pallets),
        year: num(year),
        fuel: fuel || null,
      });
      setState({ kind: 'saved' });
    } catch (err) {
      setState({ kind: 'error', msg: err instanceof Error ? err.message : 'Not saved.' });
    } finally {
      void qc.invalidateQueries({ queryKey: TRUCK_SPECS_KEY });
    }
  }
  async function upload(f: File | undefined) {
    if (!f) return;
    setPhotoBusy(true);
    setState({ kind: 'idle' });
    try {
      await putTruckPhoto(truck.id, await photoDataUrl(f));
    } catch (err) {
      setState({ kind: 'error', msg: err instanceof Error ? err.message : 'The photo was not saved.' });
    } finally {
      setPhotoBusy(false);
      void qc.invalidateQueries({ queryKey: TRUCK_SPECS_KEY });
    }
  }
  async function removePhoto() {
    setPhotoBusy(true);
    try {
      await deleteTruckPhoto(truck.id);
    } finally {
      setPhotoBusy(false);
      void qc.invalidateQueries({ queryKey: TRUCK_SPECS_KEY });
    }
  }

  const label = 'flex flex-col gap-1.5 text-[12.5px] font-medium';
  return (
    <form onSubmit={save} className="flex flex-col gap-3 border-t border-divider px-4 py-3.5">
      <span className="text-[13px] font-semibold">Photo and details</span>
      <div className="relative overflow-hidden rounded-xl border border-divider">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={pic.url} alt={`${truck.plate_number}`} className="h-28 w-full object-cover" />
        {pic.stock && <span className="absolute start-2 bottom-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[10.5px] text-white">Stock photo</span>}
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={() => file.current?.click()} disabled={photoBusy} className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border border-border bg-surface-100 text-[12.5px] font-medium text-ink hover:border-ink-subtle disabled:opacity-45">
          <ImagePlus size={15} strokeWidth={2.2} aria-hidden="true" />
          {photoBusy ? 'Saving…' : specs?.has_photo ? 'Change photo' : 'Upload a photo'}
        </button>
        {specs?.has_photo && (
          <button type="button" onClick={() => void removePhoto()} disabled={photoBusy} aria-label="Remove the photo" title="Back to the stock photo" className="grid h-10 w-10 place-items-center rounded-xl border border-border bg-surface-100 hover:border-ink-subtle disabled:opacity-45" style={{ color: 'var(--attention)' }}>
            <Trash2 size={15} strokeWidth={2.2} aria-hidden="true" />
          </button>
        )}
        <input ref={file} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => void upload(e.target.files?.[0])} />
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <label className={`${label} col-span-2`}>
          Body type
          <select value={body} onChange={(e) => setBody(e.target.value as BodyType | '')} className={fieldCls()}>
            <option value="">Not set</option>
            {(Object.keys(BODY_LABEL) as BodyType[]).map((k) => (
              <option key={k} value={k}>
                {BODY_LABEL[k]}
              </option>
            ))}
          </select>
        </label>
        <label className={label}>
          Capacity (t)
          <input inputMode="decimal" value={tonnes} onChange={(e) => setTonnes(e.target.value.replace(/[^\d.]/g, ''))} placeholder="e.g. 5" className={fieldCls()} />
        </label>
        <label className={label}>
          Body length (m)
          <input inputMode="decimal" value={length} onChange={(e) => setLength(e.target.value.replace(/[^\d.]/g, ''))} placeholder="e.g. 6.2" className={fieldCls()} />
        </label>
        <label className={label}>
          Pallets
          <input inputMode="numeric" value={pallets} onChange={(e) => setPallets(e.target.value.replace(/\D/g, ''))} placeholder="e.g. 12" className={fieldCls()} />
        </label>
        <label className={label}>
          Year
          <input inputMode="numeric" maxLength={4} value={year} onChange={(e) => setYear(e.target.value.replace(/\D/g, ''))} placeholder="e.g. 2019" className={fieldCls()} />
        </label>
        <label className={`${label} col-span-2`}>
          Fuel
          <select value={fuel} onChange={(e) => setFuel(e.target.value as Fuel | '')} className={fieldCls()}>
            <option value="">Not set</option>
            {(Object.keys(FUEL_LABEL) as Fuel[]).map((k) => (
              <option key={k} value={k}>
                {FUEL_LABEL[k]}
              </option>
            ))}
          </select>
        </label>
      </div>
      {state.kind === 'error' && (
        <span role="alert" className={hintCls(true)}>
          {state.msg}
        </span>
      )}
      <button type="submit" disabled={state.kind === 'saving'} className="h-11 rounded-xl border-0 bg-ink text-[13px] font-medium text-surface-100 hover:opacity-90 disabled:opacity-45">
        {state.kind === 'saving' ? 'Saving…' : state.kind === 'saved' ? 'Saved' : 'Save details'}
      </button>
    </form>
  );
}
