import Link from 'next/link';
import { formatDistance } from '@/lib/format';
import type { AppConfig } from '@/lib/config';
import type { Truck } from '@/lib/types';

export interface Candidate {
  truck: Truck;
  /** Straight-line distance to the pickup; null when the truck has no fresh position. */
  km: number | null;
  /** How long since its last position, when it has an old one ("11 h 2 min"). */
  seenAgo: string | null;
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
  /** Heading; null says just "Trucks" (inside the send-again panel). */
  title?: string | null;
  /** The button on each truck. */
  verb?: string;
}

/** Up to five available trucks, nearest to the pickup by straight-line distance. One line each. */
export function AssignPanel({ candidates, availableCount, hover, busy, config, onHover, onAssign, title = 'Assign a truck', verb = 'Assign' }: Props) {
  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-border bg-surface-100 p-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2">
        <span className="t-h3">{title ?? 'Trucks'}</span>
        <span className="t-body-sm text-ink-muted">
          {availableCount === 0
            ? 'None available right now'
            : `${availableCount} available${candidates.some((c) => c.km != null) ? ' · nearest first' : ''}`}
        </span>
      </div>
      <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
        {candidates.map(({ truck: t, km, seenAgo, driver }) => {
          const on = hover === t.id;
          // No distance without a fresh position: say why instead.
          const dist = km != null ? formatDistance(km, config.units, config.locale) : seenAgo ? `Last position ${seenAgo} ago` : 'No position yet';
          return (
            <li
              key={t.id}
              onMouseEnter={() => onHover(t.id)}
              onMouseLeave={() => onHover(null)}
              className="grid items-center gap-2 rounded-md py-1 ps-2.5 pe-1"
              style={{
                gridTemplateColumns: 'minmax(0,1fr) auto',
                border: on ? '2px solid var(--focus-ring)' : '1px solid var(--divider)',
                background: on ? 'var(--status-assigned-bg)' : 'var(--surface-100)',
              }}
            >
              {/* Straight-line distance only: there's no ETA in the API, so no "minutes to pickup". */}
              <span className="t-body-sm min-w-0">
                <span className="t-mono font-bold">{t.plate_number}</span> · {driver ?? 'no driver'} ·{' '}
                <span className="whitespace-nowrap text-ink-muted">{dist}</span>
              </span>
              {!t.driver_id ? (
                // The API refuses it: nobody would drive it, and no driver app would show the delivery.
                <Link
                  href="/console/fleet"
                  aria-label={`${t.plate_number} has no driver. Give it one in Fleet`}
                  className="inline-flex min-h-11 items-center rounded-md border border-border bg-surface-100 px-3 text-[13px] font-semibold text-ink no-underline"
                >
                  Needs a driver
                </Link>
              ) : (
              <button
                type="button"
                disabled={busy}
                onClick={() => onAssign(t.id)}
                onFocus={() => onHover(t.id)}
                onBlur={() => onHover(null)}
                aria-label={`${verb} ${t.plate_number}, ${driver ?? 'no driver'}, ${km != null ? `${dist} from pickup` : dist.toLowerCase()}`}
                className="min-h-11 rounded-md border-0 bg-ink px-3.5 text-[13px] font-semibold text-surface-100 disabled:opacity-45"
              >
                {verb}
              </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
