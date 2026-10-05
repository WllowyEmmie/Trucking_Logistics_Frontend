import Link from 'next/link';
import type { ExceptionRow } from '@/lib/exceptions';
import { formatDuration } from '@/lib/format';
import type { Config } from '@/lib/types';
import { ExceptionTable } from './ExceptionTable';

export type CountKey = 'active' | 'pending' | 'attention';

export interface Count {
  key: CountKey;
  n: number;
  label: string;
  /** Number colour: a token var. */
  color: string;
}

interface Props {
  config: Config;
  clock: string;
  counts: Count[];
  filter: string;
  onCount: (k: CountKey) => void;
  exceptions: ExceptionRow[];
  stacked: boolean;
  onView: (x: ExceptionRow) => void;
}

const navLink = 'inline-flex min-h-11 items-center text-[14px] font-semibold';

/** The rules behind the exception table, in the operator's own thresholds. */
function rulesLine(cfg: Config): string {
  const failed = cfg.failed_window_minutes === 60 ? 'the last hour' : `the last ${formatDuration(cfg.failed_window_minutes)}`;
  const parts = [
    `Silent ${cfg.stale_minutes}+ min`,
    `pending ${formatDuration(cfg.pending_minutes)}+ with trucks free`,
    `failed in ${failed}`,
  ];
  if (cfg.agent_enabled) parts.push('agent-raised');
  return parts.join(' · ');
}

export function ConsoleHeader({ config, clock, counts, filter, onCount, exceptions, stacked, onView }: Props) {
  return (
    <header
      className="grid flex-none gap-x-6 gap-y-3 border-b border-border bg-surface-100 px-4 py-3"
      style={{ gridTemplateColumns: stacked ? 'minmax(0,1fr)' : '360px minmax(0,1fr)' }}
    >
      <div className="flex min-w-0 flex-col gap-2.5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h1 className="t-h2 m-0">{config.operator_name} · Dispatch</h1>
          <nav aria-label="Dispatch" className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Link href="/console/fleet" className={navLink}>
              Fleet
            </Link>
            <Link href="/console/settings" className={navLink}>
              Settings
            </Link>
            <span className="t-mono text-ink-muted">{clock}</span>
          </nav>
        </div>
        <div role="group" aria-label="Fleet counts" className="grid grid-cols-3 gap-2">
          {counts.map((c) => {
            const on = filter === c.key;
            return (
              <button
                key={c.key}
                type="button"
                aria-pressed={on}
                onClick={() => onCount(c.key)}
                className="flex min-w-0 flex-col items-start gap-0.5 rounded-md px-3 py-2 text-start text-ink"
                style={{
                  border: on ? '2px solid var(--ink)' : '1px solid var(--border)',
                  background: on ? 'var(--surface-200)' : 'var(--surface-100)',
                }}
              >
                <span className="t-display" style={{ color: c.color }}>
                  {c.n}
                </span>
                <span className="t-label text-ink-muted">{c.label}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2 className="t-h3 m-0">Needs attention · {exceptions.length}</h2>
          <span className="t-body-sm text-ink-muted">{rulesLine(config)}</span>
        </div>
        <ExceptionTable rows={exceptions} stacked={stacked} onView={onView} />
      </div>
    </header>
  );
}
