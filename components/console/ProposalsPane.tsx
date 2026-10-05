import { ChevronRight } from 'lucide-react';
import { formatTime } from '@/lib/format';
import type { Config, Proposal } from '@/lib/types';

interface Props {
  proposals: Proposal[];
  open: boolean;
  /** In tab mode the pane is always open and has no collapse control. */
  collapsible: boolean;
  note: string | null;
  lastCheck: string;
  busyId: string | null;
  config: Config;
  onToggle: () => void;
  onShow: (p: Proposal) => void;
  onApprove: (p: Proposal) => void;
  onReject: (p: Proposal) => void;
}

/** Nothing changes until a dispatcher approves. */
export function ProposalsPane(p: Props) {
  const n = p.proposals.length;
  if (!p.open) {
    return (
      <button
        type="button"
        onClick={p.onToggle}
        aria-expanded={false}
        aria-label={`Open agent proposals, ${n} waiting`}
        className="flex w-full flex-1 flex-col items-center gap-3.5 border-0 bg-transparent py-3.5 text-ink"
      >
        <span
          className="h-7 min-w-7 rounded-full border border-agent px-1.5 text-center font-mono text-[13px] leading-[26px] font-semibold"
          style={{ background: n ? 'var(--agent)' : 'var(--surface-100)', color: n ? 'var(--surface-100)' : 'var(--agent)' }}
        >
          {n}
        </span>
        <span className="t-label text-agent" style={{ writingMode: 'vertical-rl' }}>
          Agent proposals
        </span>
      </button>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between gap-2 border-b border-divider py-2 ps-4 pe-2">
        <span className="t-h3 text-agent">Agent proposals · {n}</span>
        {p.collapsible && (
          <button
            type="button"
            onClick={p.onToggle}
            aria-expanded={true}
            aria-label="Collapse proposals"
            className="flex h-11 w-11 items-center justify-center rounded-md border border-border bg-surface-100 text-ink"
          >
            <ChevronRight size={18} strokeWidth={2.5} aria-hidden="true" className="rtl:rotate-180" />
          </button>
        )}
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4">
        {p.note && (
          <div role="status" className="t-body-sm rounded-md border border-border bg-surface-200 px-3 py-2.5 font-semibold">
            {p.note}
          </div>
        )}
        {n === 0 && (
          <div className="flex flex-col gap-2.5 pt-2">
            <span className="t-h2">Nothing to review</span>
            <span className="t-body text-ink-muted">
              When the agent spots something it would change, such as a reassignment or a delivery to flag as late, it appears here with
              its reasoning. Nothing changes until you approve it.
            </span>
            <span className="t-body-sm text-ink-muted">{p.lastCheck}</span>
          </div>
        )}
        {p.proposals.map((x) => (
          <article key={x.id} className="flex flex-col gap-3 rounded-md border border-agent bg-surface-100 p-3.5">
            <span className="t-label text-agent">Proposal · {formatTime(x.created_at, p.config.timezone, p.config.locale)}</span>
            <span className="t-h2">{x.title}</span>
            <div className="flex flex-col gap-1">
              <span className="t-label text-ink-muted">Why</span>
              <span className="t-body-sm">{x.why}</span>
            </div>
            {x.changes.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <span className="t-label text-ink-muted">What changes</span>
                {x.changes.map((c) => (
                  <div key={c.k} className="flex flex-col gap-0.5 rounded-sm bg-surface-200 px-2.5 py-2">
                    <span className="t-body-sm font-semibold">{c.k}</span>
                    <span className="t-body-sm flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <span className="text-ink-muted line-through">{c.from}</span>
                      <span aria-hidden="true">→</span>
                      <span className="sr-only">changes to</span>
                      <span className="font-bold">{c.to}</span>
                    </span>
                  </div>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={() => p.onShow(x)}
              className="min-h-11 self-start rounded-md border border-border bg-surface-100 px-3 text-[13px] font-semibold text-ink"
            >
              Show on map
            </button>
            <div className="flex flex-wrap gap-4">
              <button
                type="button"
                disabled={p.busyId === x.id || !x.action}
                onClick={() => p.onApprove(x)}
                className="min-h-11 flex-[1_1_120px] rounded-md border-0 bg-ink text-[14px] font-semibold text-surface-100 disabled:opacity-45"
              >
                {p.busyId === x.id ? 'Approving…' : 'Approve'}
              </button>
              <button
                type="button"
                onClick={() => p.onReject(x)}
                className="min-h-11 flex-[1_1_120px] rounded-md border border-border bg-surface-100 text-[14px] font-semibold text-ink"
              >
                Reject
              </button>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
