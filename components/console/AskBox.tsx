'use client';

import { X } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ApiError, askAgent, TIMED_OUT } from '@/lib/api';
import { useNow } from '@/lib/useNow';

/** One question at a time: a new one replaces the last, and the agent remembers nothing between them. */
type State =
  | { kind: 'idle' }
  | { kind: 'thinking'; q: string; since: number }
  | { kind: 'answered'; q: string; text: string }
  | { kind: 'failed'; q: string; error: ApiError };

/** Answers are short prose, sometimes a small table. No raw HTML is rendered. */
const MD: Components = {
  p: ({ children }) => <p className="t-body-sm m-0">{children}</p>,
  ul: ({ children }) => <ul className="t-body-sm m-0 flex flex-col gap-1 ps-5">{children}</ul>,
  ol: ({ children }) => <ol className="t-body-sm m-0 flex flex-col gap-1 ps-5">{children}</ol>,
  strong: ({ children }) => <strong className="font-bold">{children}</strong>,
  code: ({ children }) => <code className="t-mono-sm">{children}</code>,
  h1: ({ children }) => <p className="t-h3 m-0">{children}</p>,
  h2: ({ children }) => <p className="t-h3 m-0">{children}</p>,
  h3: ({ children }) => <p className="t-h3 m-0">{children}</p>,
  table: ({ children }) => (
    <div className="max-w-full overflow-x-auto">
      <table className="t-body-sm w-max min-w-full border-collapse">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="border-b border-border px-2 py-1 text-start font-semibold whitespace-nowrap">{children}</th>,
  td: ({ children }) => <td className="border-b border-divider px-2 py-1 align-top">{children}</td>,
  // The global `a` colour beats utilities, so the colour is set inline.
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noreferrer" style={{ color: 'var(--agent)' }}>
      {children}
    </a>
  ),
};

function Elapsed({ since }: { since: number }) {
  const now = useNow(1000);
  return <span className="t-mono-sm">{Math.max(0, Math.round((now - since) / 1000))} s</span>;
}

function failure(e: ApiError): { title: string; hint: string } {
  if (e.status === 0) return { title: 'The agent is unreachable', hint: 'It may not be running. Everything else in the console works without it.' };
  if (e.status === TIMED_OUT) return { title: 'The agent took too long', hint: 'It may be overloaded, or its model provider is slow.' };
  return { title: "The agent couldn't answer", hint: 'It may be out of credits, or its model provider is down.' };
}

/**
 * Ask box with an inline answer card above the delivery list: POST /ask on the agent. Not a chat:
 * no history, and the agent answers each question on its own. If the agent is down, only this box
 * says so; the rest of the console doesn't depend on it.
 */
export function AskBox() {
  const [q, setQ] = useState('');
  const [state, setState] = useState<State>({ kind: 'idle' });
  const inflight = useRef<AbortController | null>(null);

  useEffect(() => () => inflight.current?.abort(), []);

  async function run(question: string) {
    inflight.current?.abort();
    const ctl = new AbortController();
    inflight.current = ctl;
    setState({ kind: 'thinking', q: question, since: Date.now() });
    try {
      const text = await askAgent(question, ctl.signal);
      if (!ctl.signal.aborted) setState({ kind: 'answered', q: question, text });
    } catch (e) {
      if (ctl.signal.aborted) return; // replaced by a newer question, or cancelled
      setState({ kind: 'failed', q: question, error: e instanceof ApiError ? e : new ApiError(0, String(e)) });
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const question = q.trim();
    if (question) void run(question);
  }

  function close() {
    inflight.current?.abort();
    setState({ kind: 'idle' });
  }

  const thinking = state.kind === 'thinking';

  return (
    <>
      <form onSubmit={submit} role="search" className="flex gap-2 border-b border-divider p-3">
        <label className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-md border border-border bg-surface-100 ps-3 pe-1">
          <span className="t-label text-agent">Ask</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Which trucks are free?"
            aria-label="Ask the agent about deliveries and trucks"
            className="min-h-10 min-w-0 flex-1 border-0 bg-transparent text-[14px] text-ink outline-offset-0"
          />
        </label>
        <button
          type="submit"
          disabled={!q.trim()}
          className="min-h-11 rounded-md border border-agent bg-agent-bg px-3.5 text-[14px] font-semibold text-agent disabled:opacity-45"
        >
          Ask
        </button>
      </form>

      {state.kind !== 'idle' && (
        <div
          role="region"
          aria-label="Answer"
          aria-busy={thinking}
          className="mx-3 mt-2 mb-1 flex flex-col gap-2 rounded-md border bg-agent-bg p-3"
          style={{ borderColor: state.kind === 'failed' ? 'var(--status-failed)' : 'var(--agent)' }}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="t-label" style={{ color: state.kind === 'failed' ? 'var(--status-failed)' : 'var(--agent)' }}>
                {state.kind === 'thinking' ? 'Working on it' : state.kind === 'answered' ? 'Answer' : failure(state.error).title}
              </span>
              <span className="t-body-sm wrap-anywhere text-ink-muted">“{state.q}”</span>
            </div>
            <button
              type="button"
              onClick={close}
              aria-label={thinking ? 'Cancel the question' : 'Dismiss answer'}
              className="-me-2 -mt-2.5 flex h-11 w-11 flex-none items-center justify-center border-0 bg-transparent text-ink"
            >
              <X size={18} strokeWidth={2.5} aria-hidden="true" />
            </button>
          </div>

          <div aria-live="polite">
            {state.kind === 'thinking' && (
              <div role="status" className="flex flex-col gap-1.5">
                <span className="t-body-sm">
                  Checking trucks, deliveries and drivers · <Elapsed since={state.since} />
                </span>
                <span className="t-body-sm text-ink-muted">Answers usually take a few seconds; a broad question can take longer.</span>
              </div>
            )}

            {state.kind === 'answered' && (
              <div className="flex max-h-[min(30vh,240px)] flex-col gap-2 overflow-auto pe-1 text-ink" tabIndex={0} aria-label="Answer text">
                <Markdown remarkPlugins={[remarkGfm]} components={MD}>
                  {state.text}
                </Markdown>
              </div>
            )}

            {state.kind === 'failed' && (
              <div className="flex flex-col gap-2">
                <span className="t-mono-sm wrap-anywhere">{state.error.message}</span>
                <span className="t-body-sm text-ink-muted">{failure(state.error).hint}</span>
                <button
                  type="button"
                  onClick={() => void run(state.q)}
                  className="min-h-11 self-start rounded-md border border-border bg-surface-100 px-3 text-[13px] font-semibold text-ink"
                >
                  Retry
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
