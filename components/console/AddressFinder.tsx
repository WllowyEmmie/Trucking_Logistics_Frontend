'use client';

import { Search } from 'lucide-react';
import { useRef, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import type { GeocodePlace } from '@/lib/types';
import { inputCls } from './ui';

type State =
  | { kind: 'idle' }
  | { kind: 'searching' }
  | { kind: 'results'; places: GeocodePlace[] }
  | { kind: 'error'; message: string };

interface Props {
  id: string;
  value: string;
  invalid: boolean;
  describedBy?: string;
  onChange: (address: string) => void;
  onPick: (place: GeocodePlace) => void;
  /** Where to search: the console's /geocode, or the booking page's limited /book/geocode. */
  searchPath?: string;
}

/**
 * An address box with Find: GET /geocode on the API, which searches inside the service area only.
 * Picking a match fills the stop's coordinates, so nobody has to know them. Enter searches rather
 * than submitting the form. If the search is down, the coordinates can still be typed.
 */
export function AddressFinder({ id, value, invalid, describedBy, onChange, onPick, searchPath = '/geocode' }: Props) {
  const [state, setState] = useState<State>({ kind: 'idle' });
  // Bumped by every search and every edit: an answer for an older one is dropped, so matches for
  // what the box said a moment ago never show under what it says now.
  const seq = useRef(0);
  const q = value.trim();

  async function find() {
    const mine = ++seq.current;
    if (q.length < 3) {
      setState({ kind: 'error', message: 'Type at least 3 characters of the address.' });
      return;
    }
    setState({ kind: 'searching' });
    try {
      const places = await api<GeocodePlace[]>(`${searchPath}?q=${encodeURIComponent(q)}`);
      if (mine === seq.current) setState({ kind: 'results', places });
    } catch (e) {
      if (mine === seq.current) setState({ kind: 'error', message: e instanceof ApiError ? e.message : 'Address search failed.' });
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex gap-2">
        <input
          id={id}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            seq.current++;
            if (state.kind !== 'idle') setState({ kind: 'idle' });
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void find();
            }
          }}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          className={`${inputCls(invalid)} min-w-0 flex-1`}
        />
        <button
          type="button"
          onClick={() => void find()}
          disabled={state.kind === 'searching'}
          aria-label={`Find coordinates for ${q || 'this address'}`}
          className="inline-flex min-h-11 flex-none items-center gap-1.5 rounded-md border border-border bg-surface-100 px-3 text-[13px] font-semibold text-ink disabled:opacity-60"
        >
          <Search size={15} strokeWidth={2.5} aria-hidden="true" />
          {state.kind === 'searching' ? 'Finding…' : 'Find'}
        </button>
      </div>

      <div aria-live="polite">
        {state.kind === 'error' && <span className="t-body-sm font-semibold text-attention">{state.message}</span>}
        {state.kind === 'results' && state.places.length === 0 && (
          <span className="t-body-sm text-ink-muted">No match inside the service area. Try a fuller address, or type the coordinates.</span>
        )}
        {state.kind === 'results' && state.places.length > 0 && (
          <ul aria-label="Matching places" className="m-0 flex list-none flex-col gap-1 p-0">
            {state.places.map((p) => (
              <li key={`${p.lat},${p.lng}`}>
                <button
                  type="button"
                  onClick={() => {
                    onPick(p);
                    setState({ kind: 'idle' });
                  }}
                  className="t-body-sm flex min-h-11 w-full items-center rounded-md border border-border bg-surface-100 px-3 py-1.5 text-start text-ink hover:bg-surface-200"
                >
                  {p.label}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
