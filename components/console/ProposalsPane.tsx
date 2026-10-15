import { ChevronRight } from 'lucide-react';
import { formatTime } from '@/lib/format';
import type { AppConfig } from '@/lib/config';
import type { Proposal } from '@/lib/types';

/** A refused approve or reject: the server's message, word for word, where the card was. */
export interface ProposalError {
  p: Proposal;
  verb: 'approve' | 'reject';
  conflict: boolean;
  message: string;
  /** The card's position when it was refused, so it stays put after leaving the pending list. */
  index: number;
}

interface Props {
  /** Pending changes. Flags go to the exception table: there's nothing to approve on one. */
  proposals: Proposal[];
  errors: Record<string, ProposalError>;
  open: boolean;
  /** In tab mode the pane is always open and has no collapse control. */
  collapsible: boolean;
  note: string | null;
  lastCheck: string;
  busy: { id: string; verb: 'approve' | 'reject' } | null;
  config: AppConfig;
  onToggle: () => void;
  onShow: (p: Proposal) => void;
  onApprove: (p: Proposal) => void;
  onReject: (p: Proposal) => void;
  onDismiss: (id: string) => void;
}

const btn = 'min-h-11 flex-[1_1_120px] rounded-md text-[14px] font-semibold disabled:opacity-45';

/** What happened to a refused proposal that has left the queue, from the server's message. */
function goneNote(message: string): string {
  if (message === 'proposal is already approved') return 'Someone else approved it first; that change is in place.';
  if (message === 'proposal is already rejected') return 'Someone else rejected it first.';
  return "It's been retired and nothing was changed. The agent can propose again with current data.";
}

/** Nothing changes until a dispatcher approves; approving runs it on the server. */
export function ProposalsPane(p: Props) {
  const n = p.proposals.length;
  // Pending cards, with any refused one that has since left the list put back where it was.
  const cards: { x: Proposal; gone: boolean }[] = p.proposals.map((x) => ({ x, gone: false }));
  Object.values(p.errors)
    .filter((e) => !p.proposals.some((x) => x.id === e.p.id))
    .sort((a, b) => a.index - b.index)
    .forEach((e) => cards.splice(Math.min(e.index, cards.length), 0, { x: e.p, gone: true }));
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
        {cards.length === 0 && (
          <div className="flex flex-col gap-2.5 pt-2">
            <span className="t-h2">Nothing to review</span>
            <span className="t-body text-ink-muted">
              When the agent spots something it would change, such as a truck for a waiting delivery, it appears here with its
              reasoning. Nothing changes until you approve it. Things it only wants you to see show in Needs attention.
            </span>
            <span className="t-body-sm text-ink-muted">{p.lastCheck}</span>
          </div>
        )}
        {cards.map(({ x, gone }) => {
          const err = p.errors[x.id];
          const busy = p.busy?.id === x.id ? p.busy.verb : null;
          return (
            <article
              key={x.id}
              aria-label={x.title}
              className="flex flex-col gap-3 rounded-md border bg-surface-100 p-3.5"
              style={{ borderColor: gone ? 'var(--border)' : 'var(--agent)' }}
            >
              <span className="t-label text-agent">
                {gone ? 'No longer pending' : 'Proposal'} · {formatTime(x.created_at, p.config.timezone, p.config.locale)}
              </span>
              <span className={`t-h2 ${gone ? 'text-ink-muted' : ''}`}>{x.title}</span>
              {err && (
                <div role="alert" className="flex flex-col gap-1 rounded-md border border-status-failed bg-status-failed-bg px-3 py-2.5">
                  <span className="t-body-sm font-bold">{err.verb === 'approve' ? 'Not applied' : 'Not rejected'}</span>
                  <span className="t-mono wrap-anywhere">{err.conflict ? `409 · ${err.message}` : err.message}</span>
                  {gone && <span className="t-body-sm text-ink-muted">{goneNote(err.message)}</span>}
                </div>
              )}
              {!gone && (
                <>
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
                </>
              )}
              <div className="flex flex-wrap gap-4">
                {gone ? (
                  <button type="button" onClick={() => p.onDismiss(x.id)} className={`${btn} border border-border bg-surface-100 text-ink`}>
                    Dismiss
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={!!p.busy || !x.action}
                      onClick={() => p.onApprove(x)}
                      className={`${btn} border-0 bg-ink text-surface-100`}
                    >
                      {busy === 'approve' ? 'Approving…' : 'Approve'}
                    </button>
                    <button
                      type="button"
                      disabled={!!p.busy}
                      onClick={() => p.onReject(x)}
                      className={`${btn} border border-border bg-surface-100 text-ink`}
                    >
                      {busy === 'reject' ? 'Rejecting…' : 'Reject'}
                    </button>
                  </>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}
