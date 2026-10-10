import { formatDistance } from '@/lib/format';
import type { AppConfig } from '@/lib/config';
import type { Truck } from '@/lib/types';

export interface Candidate {
  truck: Truck;
  km: number;
  /** From /drivers via the truck's driver_id. */
  driver: string | null;
}

interface Props {
  candidates: Candidate[];
  availableCount: number;
  hover: string | null;
  busy: boolean;
  config: AppConfig;
  onHover: (id: string | null) => void;
  onAssign: (truckId: string) => void;
}

/** Up to five available trucks, nearest to the pickup by straight-line distance. */
export function AssignPanel({ candidates, availableCount, hover, busy, config, onHover, onAssign }: Props) {
  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-surface-100 p-3">
      <span className="t-h3">Assign a truck</span>
      <span className="t-body-sm text-ink-muted">
        {availableCount === 0
          ? 'No trucks are available right now.'
          : `${availableCount} available · nearest to pickup first · straight-line distance`}
      </span>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {candidates.map(({ truck: t, km, driver }) => {
          const on = hover === t.id;
          const dist = formatDistance(km, config.units, config.locale);
          return (
            <li
              key={t.id}
              onMouseEnter={() => onHover(t.id)}
              onMouseLeave={() => onHover(null)}
              className="grid items-center gap-2 rounded-md py-1.5 ps-2.5 pe-1.5"
              style={{
                gridTemplateColumns: 'minmax(0,1fr) auto',
                border: on ? '2px solid var(--focus-ring)' : '1px solid var(--divider)',
                background: on ? 'var(--status-assigned-bg)' : 'var(--surface-100)',
              }}
            >
              <div className="flex min-w-0 flex-col">
                <span className="t-body-sm">
                  <span className="t-mono font-bold">{t.plate_number}</span> · {driver ?? 'no driver'}
                </span>
                <span className="t-body-sm text-ink-muted">
                  {dist} · about {Math.max(2, Math.round(km * 2.4))} min to pickup
                </span>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => onAssign(t.id)}
                onFocus={() => onHover(t.id)}
                onBlur={() => onHover(null)}
                aria-label={`Assign ${t.plate_number}, ${driver ?? 'no driver'}, ${dist} from pickup`}
                className="min-h-11 rounded-md border-0 bg-ink px-3.5 text-[13px] font-semibold text-surface-100 disabled:opacity-45"
              >
                Assign
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
