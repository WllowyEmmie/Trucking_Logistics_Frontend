'use client';

import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Send } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useDriver } from '@/components/driver/DriverProvider';
import { DriverScreen } from '@/components/driver/DriverScreen';
import { topBtnCls } from '@/components/driver/ui';
import { formatTime } from '@/lib/format';
import { MESSAGES_KEY, markMyThreadRead, useMyThread, useSendToDispatch } from '@/lib/messages';

/** One tap, for when typing isn't safe. */
const QUICK = ['On my way', 'Stuck in traffic', "I've arrived", 'Please call me'];

// The driver's thread with dispatch. Needs a connection: a message that can't be sent says so and
// stays in the box.
export default function DriverMessages() {
  const { config } = useDriver();
  const qc = useQueryClient();
  const thread = useMyThread();
  const send = useSendToDispatch();
  const [draft, setDraft] = useState('');
  const scroller = useRef<HTMLDivElement>(null);
  const msgs = thread.data?.messages ?? [];
  const unread = thread.data?.unread ?? 0;

  useEffect(() => {
    if (unread > 0) void markMyThreadRead().then(() => qc.invalidateQueries({ queryKey: MESSAGES_KEY }));
  }, [unread, qc]);
  useEffect(() => {
    scroller.current?.scrollIntoView({ block: 'end' });
  }, [msgs.length]);

  const go = (text: string) => {
    const t = text.trim();
    if (!t || send.isPending) return;
    send.mutate(t, { onSuccess: () => setDraft('') });
  };
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    go(draft);
  };

  return (
    <DriverScreen
      notices={false}
      top={
        <Link href="/driver" className={`${topBtnCls} border-border`} style={{ color: 'var(--ink)' }}>
          <ArrowLeft size={22} strokeWidth={2.5} aria-hidden="true" />
          Today
        </Link>
      }
      bottom={
        <>
          <div className="flex flex-wrap gap-2">
            {QUICK.map((q) => (
              <button key={q} type="button" onClick={() => go(q)} disabled={send.isPending} className="t-driver-meta min-h-14 rounded-lg border-2 border-border bg-surface-100 px-3.5 font-bold text-ink disabled:opacity-45">
                {q}
              </button>
            ))}
          </div>
          <form onSubmit={onSubmit} className="flex gap-2">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={2000}
              placeholder="Message dispatch"
              aria-label="Message dispatch"
              className="t-driver-meta min-h-14 min-w-0 flex-1 rounded-lg border-2 border-border bg-surface-100 px-3.5 text-ink"
            />
            <button type="submit" aria-label="Send" disabled={!draft.trim() || send.isPending} className="grid min-h-14 min-w-14 place-items-center rounded-lg border-0 bg-ink text-surface-100 disabled:opacity-45">
              <Send size={22} aria-hidden="true" />
            </button>
          </form>
          {send.isError && (
            <span role="alert" className="t-driver-meta font-bold text-attention">
              Not sent: {send.error.message}
            </span>
          )}
        </>
      }
    >
      <h1 className="t-display m-0">Dispatch</h1>
      {thread.isError && <p className="t-driver-meta m-0 text-attention">Can&apos;t load messages: {thread.error.message}</p>}
      {msgs.length === 0 && !thread.isPending && !thread.isError && <p className="t-driver-meta m-0 text-ink-muted">No messages yet. Dispatch&apos;s messages show here.</p>}
      <div className="flex flex-col gap-2.5">
        {msgs.map((m) => {
          const mine = m.from_driver;
          return (
            <div key={m.id} className="flex" style={{ justifyContent: mine ? 'flex-end' : 'flex-start' }}>
              <div
                className="t-driver-meta flex max-w-[85%] flex-col gap-1 rounded-2xl border-2 px-4 py-3 whitespace-pre-wrap"
                style={mine ? { background: 'var(--ink)', color: 'var(--surface-100)', borderColor: 'var(--ink)' } : { background: 'var(--surface-200)', color: 'var(--ink)', borderColor: 'var(--border)' }}
              >
                {m.body}
                <span className="text-[13px] opacity-70">
                  {mine ? 'You' : m.sender} · {formatTime(m.created_at, config.timezone, config.locale)}
                </span>
              </div>
            </div>
          );
        })}
        <div ref={scroller} />
      </div>
    </DriverScreen>
  );
}
