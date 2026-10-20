'use client';

import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import type { AppConfig } from '@/lib/config';
import type { ExceptionRow } from '@/lib/exceptions';
import { formatDuration } from '@/lib/format';
import { AccountMenu } from '@/components/auth/AccountMenu';
import { DispatchNav } from './DispatchNav';
import { DismissedList, ExceptionTable } from './ExceptionTable';

interface Props {
  config: AppConfig;
  clock: string;
  exceptions: ExceptionRow[];
  /** Dismissed with ×: out of the count, listed on request with Restore. */
  dismissed: ExceptionRow[];
  stacked: boolean;
  onView: (x: ExceptionRow) => void;
  onDismiss: (x: ExceptionRow) => void;
  onRestore: (x: ExceptionRow) => void;
}

const OPEN_KEY = 'console-attention-open';

/** The rules behind the exception table, in the operator's own thresholds. */
function rulesLine(cfg: AppConfig): string {
  const failed = cfg.failed_window_minutes === 60 ? 'the last hour' : `the last ${formatDuration(cfg.failed_window_minutes)}`;
  const parts = [
    `Silent ${cfg.stale_minutes}+ min`,
    `pending ${formatDuration(cfg.pending_minutes)}+ with trucks free`,
    `failed in ${failed}`,
    'late or at risk of missing its due time',
  ];
  if (cfg.agent_enabled) parts.push('agent-raised');
  return parts.join(' · ');
}

/** Open or closed is a per-browser convenience; without storage it starts closed. */
function readOpen(): boolean {
  try {
    return localStorage.getItem(OPEN_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * One row, like the Fleet and Settings headers: title, nav, and Needs attention as a button. No
 * counts: the list's filter chips already show them, next to the list they filter. The exception table only takes space when it's opened, like the proposals
 * pane; the count stays visible (in the attention colour) while it's closed.
 */
export function ConsoleHeader({ config, clock, exceptions, dismissed, stacked, onView, onDismiss, onRestore }: Props) {
  const [showDismissed, setShowDismissed] = useState(false);
  const [open, setOpenState] = useState(readOpen);
  const setOpen = (v: boolean) => {
    setOpenState(v);
    try {
      localStorage.setItem(OPEN_KEY, v ? '1' : '0');
    } catch {
      // Not remembered; it still opens.
    }
  };
  const n = exceptions.length;

  return (
    <header className="flex-none border-b border-border bg-surface-100">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <h1 className="t-h2 m-0">{config.operator_name} · Dispatch</h1>
          <DispatchNav current="/console" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            aria-expanded={open}
            aria-controls="attention-panel"
            onClick={() => setOpen(!open)}
            className="inline-flex min-h-11 items-center gap-2 rounded-md px-3 text-[14px] font-semibold text-ink"
            style={{
              border: n ? '2px solid var(--attention)' : '1px solid var(--border)',
              background: n ? 'var(--attention-bg)' : 'var(--surface-100)',
            }}
          >
            Needs attention
            <span
              className="min-w-6 rounded-full px-1.5 text-center font-mono text-[13px] leading-6"
              style={{ background: n ? 'var(--attention)' : 'var(--surface-300)', color: n ? 'var(--surface-100)' : 'var(--ink)' }}
            >
              {n}
            </span>
            <ChevronDown size={16} strokeWidth={2.5} aria-hidden="true" style={{ transform: open ? 'rotate(180deg)' : 'none' }} />
          </button>
          <span className="t-mono ps-1 text-ink-muted">{clock}</span>
          <span aria-hidden="true" className="mx-1 h-6 border-s border-divider" />
          <AccountMenu />
        </div>
      </div>

      {open && (
        <div id="attention-panel" className="flex flex-col gap-1.5 border-t border-divider px-4 pt-2 pb-3">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <h2 className="t-h3 m-0">Needs attention · {n}</h2>
            <span className="flex flex-wrap items-center gap-x-3">
              <span className="t-body-sm text-ink-muted">{rulesLine(config)}</span>
              {dismissed.length > 0 && (
                <button
                  type="button"
                  aria-expanded={showDismissed}
                  onClick={() => setShowDismissed((v) => !v)}
                  className="t-body-sm min-h-11 rounded-md border-0 bg-transparent px-1 font-semibold text-ink underline underline-offset-2"
                >
                  {showDismissed ? 'Hide' : 'Show'} {dismissed.length} dismissed
                </button>
              )}
            </span>
          </div>
          <ExceptionTable rows={exceptions} stacked={stacked} onView={onView} onDismiss={onDismiss} />
          {showDismissed && dismissed.length > 0 && <DismissedList rows={dismissed} onRestore={onRestore} />}
        </div>
      )}
    </header>
  );
}
