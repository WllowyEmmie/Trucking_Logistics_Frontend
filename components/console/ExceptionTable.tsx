import { X } from 'lucide-react';
import type { ExceptionRow } from '@/lib/exceptions';

const COLS = '150px 210px minmax(0,1fr) 52px 76px 140px';
/** Four rows show; more scroll inside the table instead of pushing the panes below out of view. */
const ROWS_MAX = 'max-h-[196px] overflow-y-auto';

function AgentMark({ compact }: { compact?: boolean }) {
  return (
    <span className="t-body-sm inline-flex items-center gap-[5px] rounded-full border border-agent bg-agent-bg px-2 py-px font-bold text-agent">
      {!compact && <span aria-hidden="true" className="h-[7px] w-[7px] rotate-45 bg-agent" />}
      Agent
    </span>
  );
}

const actionBtn =
  'rounded-md border border-border bg-surface-100 px-3 text-[13px] font-semibold text-ink';

/** "I've seen this": takes the row out of Needs attention. */
function Dismiss({ x, onDismiss }: { x: ExceptionRow; onDismiss: (x: ExceptionRow) => void }) {
  return (
    <button
      type="button"
      onClick={() => onDismiss(x)}
      aria-label={`Dismiss ${x.issue}: ${x.subject}`}
      title={x.agent ? 'Dismiss for everyone (rejects the flag)' : 'Dismiss: seen it'}
      className="flex h-11 w-11 flex-none items-center justify-center rounded-md border border-transparent bg-transparent text-ink-muted hover:border-border hover:bg-surface-100 hover:text-ink"
    >
      <X size={18} strokeWidth={2.5} aria-hidden="true" />
    </button>
  );
}

interface Props {
  rows: ExceptionRow[];
  stacked: boolean;
  onView: (x: ExceptionRow) => void;
  onDismiss: (x: ExceptionRow) => void;
}

export function ExceptionTable({ rows, stacked, onView, onDismiss }: Props) {
  if (rows.length === 0) {
    return (
      <div className="t-body flex min-h-11 items-center rounded-md border border-dashed border-border px-3 text-ink-muted">
        Nothing needs attention.
      </div>
    );
  }

  if (stacked) {
    return (
      <ul aria-label="Exceptions" className={`m-0 flex list-none flex-col gap-1.5 p-0 ${ROWS_MAX}`}>
        {rows.map((x) => (
          <li key={x.key} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-sm bg-attention-bg px-2.5 py-2">
            <span className="t-body-sm font-bold text-attention">{x.issue}</span>
            <span className="t-mono font-semibold">{x.subject}</span>
            {x.agent && <AgentMark compact />}
            <span className="t-body-sm basis-full">
              {x.detail} · since {x.since}
            </span>
            <span className="ms-auto flex items-center gap-1">
              <button type="button" onClick={() => onView(x)} className={`${actionBtn} min-h-11`}>
                {x.action}
              </button>
              <Dismiss x={x} onDismiss={onDismiss} />
            </span>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div role="table" aria-label="Exceptions" className="flex flex-col gap-0.5">
      <div role="row" className="t-label grid gap-2.5 px-2.5 py-0.5 text-ink-muted" style={{ gridTemplateColumns: COLS }}>
        <span role="columnheader">Issue</span>
        <span role="columnheader">Subject</span>
        <span role="columnheader">Detail</span>
        <span role="columnheader">Since</span>
        <span role="columnheader">Raised by</span>
        <span role="columnheader">
          <span className="sr-only">Action</span>
        </span>
      </div>
      <div role="rowgroup" className={`flex flex-col gap-0.5 ${ROWS_MAX}`}>
        {rows.map((x) => (
          <div
            key={x.key}
            role="row"
            className="grid min-h-11 items-center gap-2.5 rounded-sm bg-attention-bg ps-2.5 pe-1"
            style={{ gridTemplateColumns: COLS }}
          >
            <span role="cell" className="t-body-sm font-bold text-attention">
              {x.issue}
            </span>
            <span role="cell" className="t-mono font-semibold">
              {x.subject}
            </span>
            <span role="cell" className="t-body-sm">
              {x.detail}
            </span>
            <span role="cell" className="t-mono">
              {x.since}
            </span>
            <span role="cell">{x.agent ? <AgentMark /> : <span className="t-body-sm text-ink-muted">Rule</span>}</span>
            <span role="cell" className="flex items-center justify-end gap-1">
              <button
                type="button"
                onClick={() => onView(x)}
                aria-label={`${x.action} ${x.subject}`}
                className={`${actionBtn} min-h-11 min-w-[76px]`}
              >
                {x.action}
              </button>
              <Dismiss x={x} onDismiss={onDismiss} />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** What was dismissed, muted, each with Restore. Shown on request under the table. */
export function DismissedList({ rows, onRestore }: { rows: ExceptionRow[]; onRestore: (x: ExceptionRow) => void }) {
  return (
    <ul aria-label="Dismissed" className="m-0 flex max-h-[148px] list-none flex-col gap-0.5 overflow-y-auto p-0">
      {rows.map((x) => (
        <li key={x.key} className="flex min-h-11 flex-wrap items-center gap-x-3 rounded-sm bg-surface-200 ps-2.5 pe-1 text-ink-muted">
          <span className="t-body-sm font-semibold">{x.issue}</span>
          <span className="t-mono">{x.subject}</span>
          <span className="t-body-sm min-w-0 flex-1 truncate">{x.detail}</span>
          <button type="button" onClick={() => onRestore(x)} aria-label={`Restore ${x.issue}: ${x.subject}`} className={`${actionBtn} min-h-11`}>
            Restore
          </button>
        </li>
      ))}
    </ul>
  );
}
