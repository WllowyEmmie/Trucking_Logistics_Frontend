'use client';

import { useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Check, FileDown, Send, Sparkles, X } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useSignedInAs } from '@/components/auth/Gate';
import { ActionDetails } from './ActionDetails';
import { AGENT_URL } from '@/lib/api';

/**
 * The Copilot: a chat with the dispatch agent in a panel on the right (the design's drawer).
 * POST /agent/copilot/chat streams server-sent events: `thread`, `token` (text as it's written),
 * `tool_start`/`tool_end` (shown as chips), `file` (a PDF it made), `ui` (focus the map or open a
 * delivery: handed to the page as a `copilot-ui` window event), `interrupt` (a change waiting for
 * approval: Approve/Reject posts /copilot/resume), `message`, `error` and `done`.
 */

interface Tool {
  id: string;
  name: string;
  tier: string;
  ok?: boolean;
}
interface FileRef {
  id: string;
  name: string;
  url: string;
  size?: number;
}
interface Msg {
  role: 'user' | 'assistant';
  text: string;
  tools?: Tool[];
  files?: FileRef[];
  error?: boolean;
}
interface Action {
  name: string;
  args: Record<string, unknown>;
  description: string;
  tier: string;
}
interface Pending {
  actions: Action[];
}

const SUGGEST = [
  'What needs attention right now?',
  'Which deliveries are running late?',
  'Plan trucks for the pending deliveries',
  'How many deliveries did we complete this week?',
  'Which trucks are free right now?',
];

/** list_deliveries → "List deliveries" */
const human = (name: string) => {
  const s = name.replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
};

const MD: Components = {
  p: ({ children }) => <p className="m-0">{children}</p>,
  ul: ({ children }) => <ul className="m-0 flex flex-col gap-1 ps-5">{children}</ul>,
  ol: ({ children }) => <ol className="m-0 flex flex-col gap-1 ps-5">{children}</ol>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  code: ({ children }) => <code className="t-mono-sm rounded bg-surface-300 px-1">{children}</code>,
  h1: ({ children }) => <p className="m-0 font-semibold">{children}</p>,
  h2: ({ children }) => <p className="m-0 font-semibold">{children}</p>,
  h3: ({ children }) => <p className="m-0 font-semibold">{children}</p>,
  table: ({ children }) => (
    <div className="max-w-full overflow-x-auto">
      <table className="w-max min-w-full border-collapse text-[12.5px]">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="border-b border-border px-2 py-1 text-start font-semibold whitespace-nowrap">{children}</th>,
  td: ({ children }) => <td className="border-b border-divider px-2 py-1 align-top">{children}</td>,
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noreferrer" style={{ color: 'var(--status-transit)' }}>
      {children}
    </a>
  ),
};

/** Reads an event stream from a fetch response: calls `on` for each event. */
async function readEvents(res: Response, on: (event: string, data: Record<string, unknown>) => void) {
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const block = buf.slice(0, i);
      buf = buf.slice(i + 2);
      let event = 'message';
      let data = '';
      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) data += line.slice(5).trim();
      }
      try {
        on(event, data ? (JSON.parse(data) as Record<string, unknown>) : {});
      } catch {
        // A malformed event is skipped; the rest of the turn still shows.
      }
    }
  }
}

export function CopilotDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const me = useSignedInAs();
  const qc = useQueryClient();
  const first = me.name.split(/\s+/)[0] ?? me.name;
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [draft, setDraft] = useState('');
  const [live, setLive] = useState('');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const thread = useRef<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  // Stays on screen while it animates out (copilot-out in globals.css), then goes.
  const [shown, setShown] = useState(open);
  useEffect(() => {
    if (open) {
      setShown(true);
      return;
    }
    const t = setTimeout(() => setShown(false), 220);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (open) setTimeout(() => input.current?.focus(), 50);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    // A click anywhere outside the panel closes it. The conversation (and any answer still
    // streaming) is kept: the panel only hides, and opens again where it was.
    const onDown = (e: PointerEvent) => {
      const t = e.target as Element | null;
      if (!t || panel.current?.contains(t) || t.closest('[data-copilot-toggle]') || t.closest('.confirm-backdrop')) return;
      onClose();
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [open, onClose]);
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs, live, busy, pending]);

  /** The reply being built for this turn: tools and files land on it, its text arrives last. */
  const patchReply = (fn: (m: Msg) => Msg) =>
    setMsgs((ms) => {
      const last = ms[ms.length - 1];
      if (last?.role === 'assistant' && !last.text && !last.error) return [...ms.slice(0, -1), fn(last)];
      return [...ms, fn({ role: 'assistant', text: '' })];
    });

  async function stream(path: string, body: unknown) {
    setBusy(true);
    setLive('');
    try {
      const res = await fetch(`${AGENT_URL}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok || !res.body) {
        const j = (await res.json().catch(() => ({}))) as { detail?: string; error?: string };
        throw new Error(j.detail ?? j.error ?? `The Copilot answered ${res.status}.`);
      }
      await readEvents(res, (event, data) => {
        switch (event) {
          case 'thread':
            thread.current = String(data.thread_id ?? '') || thread.current;
            break;
          case 'token':
            setLive((t) => t + String(data.text ?? ''));
            break;
          case 'tool_start':
            setLive('');
            patchReply((m) => ({ ...m, tools: [...(m.tools ?? []), { id: String(data.id), name: String(data.name), tier: String(data.tier ?? 'read') }] }));
            break;
          case 'tool_end':
            patchReply((m) => ({ ...m, tools: (m.tools ?? []).map((t) => (t.id === String(data.id) ? { ...t, ok: Boolean(data.ok) } : t)) }));
            // A change went through: the console's lists should show it now, not at the next poll.
            if (data.ok) void qc.invalidateQueries();
            break;
          case 'file':
            patchReply((m) => ({ ...m, files: [...(m.files ?? []), data as unknown as FileRef] }));
            break;
          case 'ui':
            window.dispatchEvent(new CustomEvent('copilot-ui', { detail: data }));
            break;
          case 'interrupt':
            setPending({ actions: (data.actions as Action[]) ?? [] });
            break;
          case 'message':
            setLive('');
            setMsgs((ms) => {
              const last = ms[ms.length - 1];
              if (last?.role === 'assistant' && !last.text && !last.error) return [...ms.slice(0, -1), { ...last, text: String(data.text ?? '') }];
              return [...ms, { role: 'assistant', text: String(data.text ?? '') }];
            });
            break;
          case 'error':
            setMsgs((ms) => [...ms, { role: 'assistant', text: String(data.message ?? 'Something went wrong.'), error: true }]);
            break;
        }
      });
    } catch (e) {
      setMsgs((ms) => [
        ...ms,
        { role: 'assistant', error: true, text: e instanceof Error && e.message !== 'Failed to fetch' ? e.message : "I couldn't reach the Copilot just now. Try again in a moment." },
      ]);
    } finally {
      setLive('');
      setBusy(false);
    }
  }

  function send(text?: string) {
    const t = (text ?? draft).trim();
    if (!t || busy || pending) return;
    setDraft('');
    setMsgs((ms) => [...ms, { role: 'user', text: t }]);
    void stream('/copilot/chat', { message: t, thread_id: thread.current });
  }

  function decide(type: 'approve' | 'reject') {
    if (!pending || !thread.current) return;
    const n = pending.actions.length;
    setMsgs((ms) => [...ms, { role: 'user', text: type === 'approve' ? (n > 1 ? `Approved all ${n}` : 'Approved') : 'Rejected' }]);
    setPending(null);
    void stream('/copilot/resume', {
      thread_id: thread.current,
      decisions: pending.actions.map(() => (type === 'approve' ? { type } : { type, message: 'The dispatcher rejected this.' })),
    });
  }

  function reset() {
    thread.current = null;
    setMsgs([]);
    setPending(null);
    setLive('');
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    send();
  };

  if (!shown) return null;
  const danger = pending?.actions.some((a) => a.tier === 'destructive');

  return (
    <div
      ref={panel}
      role="dialog"
      aria-label="Copilot"
      className={`fixed inset-y-3 end-3 z-[3000] flex w-[min(420px,calc(100vw-24px))] flex-col overflow-hidden rounded-[22px] border border-border bg-surface-100 text-ink ${open ? 'copilot-in' : 'copilot-out'}`}
      style={{ boxShadow: '0 24px 60px rgb(0 0 0 / 0.28)' }}
    >
      <div className="flex items-center gap-2.5 border-b border-divider px-[18px] py-4">
        <span className="grid h-[34px] w-[34px] place-items-center rounded-[11px] bg-brand text-brand-ink">
          <Sparkles size={17} strokeWidth={1.7} aria-hidden="true" />
        </span>
        <div className="flex flex-1 flex-col leading-tight">
          <span className="text-[15px] font-semibold">Copilot</span>
          <span className="text-[11.5px] text-ink-muted">Ask a question or tell it what to do</span>
        </div>
        <button type="button" onClick={reset} className="h-[30px] min-h-[30px] rounded-[9px] border border-border bg-transparent px-2.5 text-[11.5px] text-ink hover:border-ink-subtle">
          New
        </button>
        <button type="button" onClick={onClose} aria-label="Close Copilot" className="grid h-[30px] min-h-[30px] w-[30px] min-w-[30px] place-items-center rounded-[9px] border-0 bg-transparent text-ink hover:bg-surface-200">
          <X size={16} strokeWidth={1.7} aria-hidden="true" />
        </button>
      </div>

      <div ref={scroller} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-[18px]">
        {msgs.length === 0 && (
          <div className="flex flex-col gap-3">
            <span className="text-[20px] leading-tight font-semibold tracking-[-0.01em]">What should we move, {first}?</span>
            <span className="text-[13px] text-ink-muted">
              Copilot can look up deliveries, trucks and drivers, plan and make assignments (you approve each change), and make PDF reports.
            </span>
            <div className="mt-1.5 flex flex-col gap-1.5">
              {SUGGEST.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => send(q)}
                  className="flex min-h-11 items-center gap-2.5 rounded-xl border border-border bg-surface-100 px-3 text-start text-[13px] text-ink hover:border-ink-subtle"
                >
                  <span className="flex-1">{q}</span>
                  <ArrowRight size={14} className="text-ink-muted" aria-hidden="true" />
                </button>
              ))}
            </div>
          </div>
        )}

        {msgs.map((m, i) => (
          <div key={i} className="flex flex-col gap-1.5" style={{ alignItems: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
            {m.tools && m.tools.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {m.tools.map((t) => (
                  <span
                    key={t.id}
                    className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px]"
                    style={
                      t.ok === false
                        ? { background: 'var(--status-failed-bg)', color: 'var(--status-failed)', borderColor: 'color-mix(in srgb, var(--status-failed) 35%, transparent)' }
                        : t.ok
                          ? { background: 'var(--status-completed-bg)', color: 'var(--status-completed)', borderColor: 'color-mix(in srgb, var(--status-completed) 35%, transparent)' }
                          : { background: 'var(--surface-200)', color: 'var(--ink-muted)', borderColor: 'var(--divider)' }
                    }
                  >
                    {t.ok ? <Check size={11} strokeWidth={2.6} aria-hidden="true" /> : t.ok === false ? <X size={11} strokeWidth={2.6} aria-hidden="true" /> : <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />}
                    {human(t.name)}
                  </span>
                ))}
              </div>
            )}
            {m.text && (
              <div
                className="flex max-w-[88%] flex-col gap-2 rounded-2xl border px-3.5 py-2.5 text-[13.5px] leading-[1.5]"
                style={
                  m.role === 'user'
                    ? { background: 'var(--ink)', color: 'var(--surface-100)', borderColor: 'var(--ink)' }
                    : m.error
                      ? { background: 'var(--status-failed-bg)', color: 'var(--ink)', borderColor: 'color-mix(in srgb, var(--status-failed) 35%, transparent)' }
                      : { background: 'var(--surface-200)', color: 'var(--ink)', borderColor: 'var(--divider)' }
                }
              >
                {m.role === 'user' ? m.text : <Markdown remarkPlugins={[remarkGfm]} components={MD}>{m.text}</Markdown>}
              </div>
            )}
            {m.files?.map((f) => (
              <a
                key={f.id}
                href={`${AGENT_URL}${f.url}`}
                download={f.name}
                className="flex items-center gap-2.5 rounded-xl border border-border bg-surface-100 px-3 py-2 text-[12.5px] font-medium no-underline hover:border-ink-subtle"
                style={{ color: 'var(--ink)' }}
              >
                <FileDown size={16} aria-hidden="true" />
                {f.name}
              </a>
            ))}
          </div>
        ))}

        {live && (
          <div className="max-w-[88%] self-start rounded-2xl border border-divider bg-surface-200 px-3.5 py-2.5 text-[13.5px] leading-[1.5]">
            <Markdown remarkPlugins={[remarkGfm]} components={MD}>
              {live}
            </Markdown>
          </div>
        )}
        {busy && !live && <div className="self-start rounded-2xl border border-divider bg-surface-200 px-3.5 py-2.5 text-[13px] text-ink-muted">Working on it…</div>}

        {pending && (
          <div className="flex flex-col gap-2.5 rounded-2xl border border-border bg-surface-100 p-3.5" style={{ boxShadow: 'var(--shadow-card)' }}>
            <span className="text-[13px] font-semibold">
              {pending.actions.length > 1 ? `${pending.actions.length} changes need your OK` : 'This change needs your OK'}
            </span>
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {pending.actions.map((a, i) => (
                <li key={i} className="flex flex-col gap-2 rounded-xl bg-surface-200 px-3 py-2.5">
                  <span className="text-[13px] font-medium" style={{ color: a.tier === 'destructive' ? 'var(--status-failed)' : 'var(--ink)' }}>
                    {human(a.name)}
                  </span>
                  <ActionDetails name={a.name} args={a.args} fallback={a.description} />
                </li>
              ))}
            </ul>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => decide('approve')}
                className="min-h-10 flex-1 rounded-xl border-0 px-3 text-[13px] font-semibold"
                style={danger ? { background: 'var(--status-failed)', color: '#fff' } : { background: 'var(--brand)', color: 'var(--brand-ink)' }}
              >
                {pending.actions.length > 1 ? 'Approve all' : 'Approve'}
              </button>
              <button type="button" onClick={() => decide('reject')} className="min-h-10 flex-1 rounded-xl border border-border bg-surface-100 px-3 text-[13px] font-semibold text-ink">
                Reject
              </button>
            </div>
          </div>
        )}
      </div>

      <form onSubmit={onSubmit} className="flex gap-2 border-t border-divider px-4 pt-3.5 pb-4">
        <input
          ref={input}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={pending ? 'Approve or reject the change first' : 'e.g. Which deliveries are running late?'}
          disabled={!!pending}
          aria-label="Message the Copilot"
          className="h-[46px] min-w-0 flex-1 rounded-[14px] border border-border bg-surface-100 px-3.5 text-[13.5px] text-ink outline-none focus:border-ink-subtle disabled:opacity-60"
        />
        <button
          type="submit"
          aria-label="Send"
          disabled={busy || !!pending || !draft.trim()}
          className="grid h-[46px] w-[46px] place-items-center rounded-[14px] border-0 bg-ink text-surface-100 disabled:opacity-40"
        >
          <Send size={16} strokeWidth={1.8} aria-hidden="true" />
        </button>
      </form>
    </div>
  );
}
