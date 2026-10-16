'use client';

import { X } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ApiError, askAboutDelivery, TIMED_OUT } from '@/lib/api';
import { viewerTimeZone } from '@/lib/format';

type State =
  | { kind: 'idle' }
  | { kind: 'thinking'; q: string }
  | { kind: 'answered'; q: string; text: string }
  | { kind: 'failed'; q: string; error: ApiError };

interface Props {
  token: string;
  operator: string;
  phone: string | null;
  desktop?: boolean;
}

/** What the customer sees when there's no answer. Never the agent's internals. */
function failure(e: ApiError, operator: string, phone: string | null): string {
  const call = phone ? ` You can call ${operator} on ${phone}.` : '';
  // The agent's own note: thanks, and who to email or call. Shown as it is.
  if (e.status === 429) return e.message;
  if (e.status === 404) return "This link isn't working, so questions can't be answered.";
  if (e.status === TIMED_OUT) return `That took too long to answer. Try again in a moment.${call}`;
  return `Questions aren't available right now.${call}`;
}

/**
 * The customer's question box on the tracking page: POST /track/{token}/ask. The agent answers
 * from this delivery's tracking data only. One answer at a time, no history, plain text.
 */
export function AskDelivery({ token, operator, phone, desktop }: Props) {
  const [q, setQ] = useState('');
  const [state, setState] = useState<State>({ kind: 'idle' });
  const inflight = useRef<AbortController | null>(null);

  useEffect(() => () => inflight.current?.abort(), []);

  async function run(question: string) {
    inflight.current?.abort();
    const ctl = new AbortController();
    inflight.current = ctl;
    setState({ kind: 'thinking', q: question });
    try {
      const text = await askAboutDelivery(token, question, viewerTimeZone(), ctl.signal);
      if (!ctl.signal.aborted) setState({ kind: 'answered', q: question, text });
    } catch (e) {
      if (ctl.signal.aborted) return;
      setState({ kind: 'failed', q: question, error: e instanceof ApiError ? e : new ApiError(0, String(e)) });
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const question = q.trim();
    if (!question) return;
    // Clear the box: the question stays visible in the answer card, and Retry re-sends it from there.
    setQ('');
    void run(question);
  }

  return (
    <section aria-label="Ask about this delivery" className="flex flex-col gap-2.5">
      {desktop ? <h2 className="t-h2 m-0">Questions?</h2> : <span className="t-label text-ink-muted">Questions?</span>}
      <form onSubmit={submit} className="flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          maxLength={500}
          placeholder="e.g. Has my order been collected?"
          aria-label="Ask a question about this delivery"
          className="min-h-11 min-w-0 flex-1 rounded-md border border-border bg-surface-100 px-3 text-[15px] text-ink"
        />
        <button
          type="submit"
          disabled={!q.trim() || state.kind === 'thinking'}
          className="min-h-11 flex-none rounded-md border-0 bg-ink px-4 text-[14px] font-semibold text-surface-100 disabled:opacity-45"
        >
          Ask
        </button>
      </form>

      {state.kind !== 'idle' && (
        <div
          role="region"
          aria-label="Answer"
          aria-busy={state.kind === 'thinking'}
          className="flex flex-col gap-1.5 rounded-md border border-border bg-surface-200 px-3.5 py-3"
        >
          <div className="flex items-start justify-between gap-2">
            <span className="t-body-sm wrap-anywhere text-ink-muted">“{state.q}”</span>
            <button
              type="button"
              onClick={() => {
                inflight.current?.abort();
                setState({ kind: 'idle' });
              }}
              aria-label="Close the answer"
              className="-me-2 -mt-2.5 flex h-11 w-11 flex-none items-center justify-center border-0 bg-transparent text-ink"
            >
              <X size={18} strokeWidth={2.5} aria-hidden="true" />
            </button>
          </div>
          <div aria-live="polite" className={desktop ? 't-body-lg' : 't-body'}>
            {state.kind === 'thinking' && (
              <span role="status" className="text-ink-muted">
                Looking at your delivery…
              </span>
            )}
            {state.kind === 'answered' && <p className="m-0 whitespace-pre-line">{state.text}</p>}
            {state.kind === 'failed' && (
              <div className="flex flex-col items-start gap-2">
                <p className="m-0">{failure(state.error, operator, phone)}</p>
                {/* Trying again can't help when the link isn't valid or has asked its share. */}
                {state.error.status !== 404 && state.error.status !== 429 && (
                  <button
                    type="button"
                    onClick={() => void run(state.q)}
                    className="min-h-11 rounded-md border border-border bg-surface-100 px-3 text-[13px] font-semibold text-ink"
                  >
                    Try again
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
