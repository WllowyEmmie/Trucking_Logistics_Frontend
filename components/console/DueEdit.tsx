'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiError, post } from '@/lib/api';
import type { AppConfig } from '@/lib/config';
import { DELIVERIES_KEY, detailKey } from '@/lib/deliveries';
import { dueProblem, isoToZonedInput, zonedInputToIso } from '@/lib/due';
import { formatWhen } from '@/lib/format';
import { btnPrimary, btnSecondary, inputCls } from './ui';

/** The promised time of a delivery still open: shown, set, changed or cleared (POST /deliveries/{id}/due). */
export function DueEdit({ id, dueBy, config }: { id: string; dueBy: string | null; config: AppConfig }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: (due: string | null) => post(`/deliveries/${encodeURIComponent(id)}/due`, { due_by: due }),
    onSuccess: () => {
      setEditing(false);
      void qc.invalidateQueries({ queryKey: DELIVERIES_KEY });
      void qc.invalidateQueries({ queryKey: detailKey(id) });
    },
    onError: (e) => setProblem(e instanceof ApiError ? e.message : 'Could not save the due time.'),
  });

  const zone = config.timezone.replace(/_/g, ' ');
  if (!editing) {
    return (
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span>{dueBy ? formatWhen(dueBy, config.timezone, config.locale) : 'No time promised'}</span>
        <button
          type="button"
          onClick={() => {
            setValue(dueBy ? isoToZonedInput(dueBy, config.timezone) : '');
            setProblem(null);
            setEditing(true);
          }}
          className="min-h-8 rounded-md border border-border bg-surface-100 px-2 text-[12px] font-semibold text-ink"
        >
          {dueBy ? 'Change' : 'Set'}
        </button>
      </span>
    );
  }
  function submit() {
    const iso = zonedInputToIso(value, config.timezone);
    const p = !iso ? 'Enter a date and time' : dueProblem(iso, Date.now());
    setProblem(p);
    if (!p) save.mutate(iso);
  }
  return (
    <span className="flex flex-col gap-1.5">
      <span className="flex flex-wrap gap-2">
        <input
          type="datetime-local"
          aria-label={`Due by, ${zone} time`}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-invalid={!!problem || undefined}
          className={inputCls(!!problem)}
        />
        <button type="button" disabled={save.isPending} onClick={submit} className={btnPrimary}>
          Save
        </button>
        {dueBy && (
          <button type="button" disabled={save.isPending} onClick={() => save.mutate(null)} className={btnSecondary}>
            Clear
          </button>
        )}
        <button type="button" onClick={() => setEditing(false)} className={btnSecondary}>
          Cancel
        </button>
      </span>
      <span className={`t-body-sm ${problem ? 'font-semibold text-attention' : 'text-ink-muted'}`} role={problem ? 'alert' : undefined}>
        {problem ?? `${zone} time`}
      </span>
    </span>
  );
}
