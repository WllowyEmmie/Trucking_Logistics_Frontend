'use client';

import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Phone, Search, Send } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { telHref } from '@/components/tracking/TrackingPhone';
import { useConfig } from '@/lib/config';
import { useDeliveries, useDrivers } from '@/lib/deliveries';
import { activeByTruck } from '@/lib/exceptions';
import { formatTime, formatWhen } from '@/lib/format';
import { MESSAGES_KEY, markDriverThreadRead, useSendToDriver, useThread, useThreads } from '@/lib/messages';
import { usePositions } from '@/lib/positions';
import { useNow } from '@/lib/useNow';

/**
 * Messages, from the console design: conversations with drivers on the left (ones with messages
 * first, then everyone else so a new one can be started), the thread on the right with the
 * driver's truck and current delivery, and a box to write. Drivers answer from the driver app.
 */

const AV = ['#FFCF33', '#B9D7FF', '#C9F2D6', '#FFD6C2', '#E4D7FF', '#F2F2EF'];
const initials = (n: string) =>
  n
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');

export function MessagesView() {
  const config = useConfig();
  const now = useNow(60_000);
  const qc = useQueryClient();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const threads = useThreads().data ?? [];
  const drivers = useDrivers().data ?? [];
  const trucks = usePositions().data ?? [];
  const deliveries = useDeliveries().data ?? [];
  const onTruck = useMemo(() => activeByTruck(deliveries), [deliveries]);
  const [q, setQ] = useState('');
  const [draft, setDraft] = useState('');
  // Below 760 px one side shows at a time: the list, or the thread picked from it.
  const narrowOpen = params.has('driver');
  const scroller = useRef<HTMLDivElement>(null);

  // Threads first (newest first), then drivers with no messages yet.
  const convs = useMemo(() => {
    const withThread = new Set(threads.map((t) => t.driver_id));
    const rest = drivers.filter((d) => !withThread.has(d.id)).sort((a, b) => a.name.localeCompare(b.name));
    return [
      ...threads.map((t) => ({ id: t.driver_id, name: t.driver_name, last: t.last, unread: t.unread })),
      ...rest.map((d) => ({ id: d.id, name: d.name, last: null, unread: 0 })),
    ];
  }, [threads, drivers]);
  const needle = q.trim().toLowerCase();
  const shown = needle ? convs.filter((c) => c.name.toLowerCase().includes(needle)) : convs;

  const selId = params.get('driver') ?? convs[0]?.id ?? null;
  const pick = (id: string) => router.replace(`${pathname}?driver=${encodeURIComponent(id)}`, { scroll: false });
  const thread = useThread(selId);
  const send = useSendToDriver(selId);
  const driver = drivers.find((d) => d.id === selId);
  const truck = trucks.find((t) => t.driver_id === selId);
  const delivery = truck ? onTruck.get(truck.id) : undefined;
  const msgs = thread.data?.messages ?? [];

  // Opening a thread with unread messages marks them read.
  const unreadHere = thread.data?.unread ?? 0;
  useEffect(() => {
    if (selId && unreadHere > 0) void markDriverThreadRead(selId).then(() => qc.invalidateQueries({ queryKey: MESSAGES_KEY }));
  }, [selId, unreadHere, qc]);
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs.length, selId]);

  const t = (iso: string) => formatTime(iso, config.timezone, config.locale);
  const onSend = (e: FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || !selId || send.isPending) return;
    send.mutate(text, { onSuccess: () => setDraft('') });
  };

  return (
    <div className="flex h-full min-h-[560px] bg-surface-100 text-ink">
      <section className={`${selId && narrowOpen ? 'max-[760px]:hidden' : ''} flex w-[340px] flex-none flex-col gap-4 border-e border-divider px-4 py-[22px] max-[760px]:w-full max-[760px]:border-e-0`}>
        <h1 className="m-0 mx-1 mb-1 text-[22px] font-semibold tracking-[-0.01em]">Messages</h1>
        <label className="mx-1 flex h-10 items-center gap-2 rounded-xl border border-border px-3">
          <Search size={15} className="text-ink-muted" aria-hidden="true" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a driver" aria-label="Find a driver" className="min-w-0 flex-1 border-0 bg-transparent text-[13px] text-ink outline-none" />
        </label>
        <div className="-mx-1 flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto px-1">
          {shown.map((c, i) => {
            const on = c.id === selId;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => pick(c.id)}
                className="flex flex-none items-center gap-3.5 rounded-2xl border px-3 py-3 text-start text-ink hover:bg-surface-200"
                style={{ borderColor: on ? 'var(--border)' : 'transparent', background: on ? 'var(--surface-200)' : 'transparent' }}
              >
                <span className="grid h-11 w-11 flex-none place-items-center rounded-[13px] text-[13.5px] font-semibold text-[#151515]" style={{ background: AV[i % AV.length] }}>
                  {initials(c.name)}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-[14px] font-semibold">{c.name}</span>
                    {c.last && <span className="flex-none text-[11px] text-ink-muted">{formatWhen(c.last.created_at, config.timezone, config.locale, new Date(now))}</span>}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-[12px] text-ink-muted" style={{ fontWeight: c.unread ? 600 : 400, color: c.unread ? 'var(--ink)' : undefined }}>
                      {c.last ? `${c.last.from_driver ? '' : 'You: '}${c.last.body}` : 'No messages yet'}
                    </span>
                    {c.unread > 0 && <i aria-label={`${c.unread} unread`} className="h-2 w-2 flex-none rounded-full bg-brand" />}
                  </span>
                </span>
              </button>
            );
          })}
          {drivers.length === 0 && <span className="p-4 text-[13px] text-ink-muted">No drivers yet. Add them on Fleet.</span>}
        </div>
      </section>

      <section className={`${narrowOpen ? '' : 'max-[760px]:hidden'} flex min-h-0 min-w-0 flex-1 flex-col`}>
        {driver ? (
          <>
            <div className="flex items-center gap-3 border-b border-divider px-[22px] py-4">
              <button type="button" onClick={() => router.replace(pathname, { scroll: false })} aria-label="Back to conversations" className="hidden h-9 w-9 place-items-center rounded-xl border border-border bg-surface-100 text-ink max-[760px]:grid" style={{ minHeight: 36, minWidth: 36 }}>
                <ArrowLeft size={16} aria-hidden="true" />
              </button>
              <span className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-brand text-[13px] font-semibold text-brand-ink">{initials(driver.name)}</span>
              <div className="flex min-w-0 flex-1 flex-col leading-tight">
                <span className="truncate text-[14.5px] font-semibold">{driver.name}</span>
                <span className="truncate text-[12px] text-ink-muted">
                  Driver{truck ? ` · ${truck.plate_number}` : ''}
                  {driver.on_shift ? ' · on shift' : ' · off shift'}
                </span>
              </div>
              {delivery && (
                <Link href={`/console?d=${delivery.id}`} className="flex h-9 items-center rounded-xl border border-border bg-surface-100 px-3 text-[12.5px] font-medium no-underline hover:border-ink-subtle" style={{ color: 'var(--ink)' }}>
                  {delivery.reference}
                </Link>
              )}
              <a href={telHref(driver.phone)} aria-label={`Call ${driver.name}`} className="grid h-9 w-9 place-items-center rounded-xl border border-border bg-surface-100 no-underline hover:border-ink-subtle" style={{ color: 'var(--ink)' }}>
                <Phone size={15} strokeWidth={1.6} aria-hidden="true" />
              </a>
            </div>
            <div ref={scroller} className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto p-[22px]">
              {msgs.length === 0 && !thread.isPending && (
                <span className="self-center rounded-full bg-surface-200 px-3 py-1 text-[12px] text-ink-muted">No messages yet. Say hello — {driver.name.split(' ')[0]} sees it in the driver app.</span>
              )}
              {msgs.map((m, i) => {
                const prev = msgs[i - 1];
                const day = formatWhen(m.created_at, config.timezone, config.locale, new Date(now)).split(',')[0];
                const newDay = !prev || new Date(prev.created_at).toDateString() !== new Date(m.created_at).toDateString();
                const mine = !m.from_driver;
                return (
                  <div key={m.id} className="flex flex-col gap-2.5">
                    {newDay && <span className="self-center rounded-full bg-surface-200 px-2.5 py-0.5 text-[11px] text-ink-muted">{day}</span>}
                    <div className="flex" style={{ justifyContent: mine ? 'flex-end' : 'flex-start' }}>
                      <div
                        className="flex max-w-[min(70%,480px)] flex-col gap-1 rounded-2xl border px-3.5 py-2.5 text-[13.5px] leading-[1.45] whitespace-pre-wrap"
                        style={mine ? { background: 'var(--ink)', color: 'var(--surface-100)', borderColor: 'var(--ink)' } : { background: 'var(--surface-200)', color: 'var(--ink)', borderColor: 'var(--divider)' }}
                      >
                        {m.body}
                        <span className="text-[10.5px] opacity-60">
                          {mine ? `${m.sender} · ` : ''}
                          {t(m.created_at)}
                          {mine && m.read_at ? ' · read' : ''}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            {/* pe: room for the round Copilot button in the corner. */}
            <form onSubmit={onSend} className="flex gap-2.5 ps-[22px] pe-[92px] pt-3.5 pb-[18px]">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                maxLength={2000}
                placeholder="Write a message…"
                aria-label={`Message ${driver.name}`}
                className="h-[46px] min-w-0 flex-1 rounded-[14px] border border-border bg-surface-100 px-4 text-[13.5px] text-ink outline-none focus:border-ink-subtle"
              />
              <button type="submit" disabled={!draft.trim() || send.isPending} className="flex h-[46px] items-center gap-2 rounded-[14px] border-0 bg-brand px-[18px] text-[13.5px] font-semibold text-brand-ink hover:opacity-90 disabled:opacity-45">
                Send
                <Send size={15} strokeWidth={1.8} aria-hidden="true" />
              </button>
            </form>
            {send.isError && (
              <span role="alert" className="px-[22px] pb-3 text-[12.5px] text-attention">
                {send.error.message}
              </span>
            )}
          </>
        ) : (
          <div className="grid flex-1 place-items-center text-[13px] text-ink-muted">Pick a driver to message.</div>
        )}
      </section>
    </div>
  );
}
