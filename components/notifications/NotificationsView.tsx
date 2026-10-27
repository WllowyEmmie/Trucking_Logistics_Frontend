'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Bell, Sparkles, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useAcks } from '@/lib/acks';
import { post } from '@/lib/api';
import { PROPOSALS_KEY, useAttention } from '@/lib/attention';
import { useConfig } from '@/lib/config';
import { formatDuration } from '@/lib/format';
import type { ExceptionRow } from '@/lib/exceptions';

/**
 * Notifications, from the console design: everything in Needs attention as a card, unread until
 * opened or marked read. Opening one marks it read and shows the delivery (or truck) on the
 * console. × on an agent flag dismisses it for everyone (rejects the flag); read marks are this
 * browser's.
 */

type Tone = 'delayed' | 'upcoming' | 'transit' | 'agent';
const KIND: { test: (x: ExceptionRow) => boolean; kind: string; tone: Tone }[] = [
  { test: (x) => x.agent, kind: 'Agent', tone: 'agent' },
  { test: (x) => x.issue === 'Failed', kind: 'Failed', tone: 'delayed' },
  { test: (x) => x.issue === 'Late', kind: 'Late', tone: 'delayed' },
  { test: (x) => x.issue === 'At risk', kind: 'At risk', tone: 'upcoming' },
  { test: (x) => x.issue === 'Truck silent', kind: 'Silent truck', tone: 'upcoming' },
  { test: () => true, kind: 'Waiting', tone: 'transit' },
];
const TONE: Record<Tone, { fg: string; bg: string }> = {
  delayed: { fg: 'var(--status-failed)', bg: 'var(--status-failed-bg)' },
  upcoming: { fg: 'var(--status-assigned)', bg: 'var(--status-assigned-bg)' },
  transit: { fg: 'var(--status-transit)', bg: 'var(--status-transit-bg)' },
  agent: { fg: 'var(--agent)', bg: 'var(--agent-bg)' },
};
const RANK: Record<Tone, number> = { delayed: 0, agent: 1, upcoming: 2, transit: 3 };
const kindOf = (x: ExceptionRow) => KIND.find((k) => k.test(x))!;

export function NotificationsView() {
  const config = useConfig();
  const router = useRouter();
  const qc = useQueryClient();
  const { rows } = useAttention();
  const acks = useAcks();
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  const sorted = [...rows].sort((a, b) => RANK[kindOf(a).tone] - RANK[kindOf(b).tone]);
  const unread = sorted.filter((x) => !acks.has(x.key));
  const list = filter === 'all' ? sorted : unread;

  function open(x: ExceptionRow) {
    acks.ack(x.key);
    if (x.deliveryId) router.push(`/console?d=${encodeURIComponent(x.deliveryId)}`);
    else if (x.truckId) router.push(`/console?t=${encodeURIComponent(x.truckId)}`);
  }
  function dismissFlag(x: ExceptionRow) {
    acks.ack(x.key);
    void post(`/proposals/${encodeURIComponent(x.key.slice('agent-'.length))}/reject`)
      .catch(() => undefined)
      .finally(() => void qc.invalidateQueries({ queryKey: PROPOSALS_KEY }));
  }

  const rules = [
    `silent ${config.stale_minutes}+ min`,
    `pending ${formatDuration(config.pending_minutes)}+ with trucks free`,
    'failed recently',
    'late or at risk',
    ...(config.agent_enabled ? ['raised by the agent'] : []),
  ].join(' · ');

  return (
    <div className="min-h-full bg-surface-100 p-5 sm:p-[26px]">
      <div className="flex max-w-[860px] flex-col gap-[18px]">
        <div className="flex flex-wrap items-center justify-between gap-3.5">
          <div className="flex flex-col gap-0.5">
            <h1 className="m-0 text-[22px] font-semibold tracking-[-0.01em]">Notifications</h1>
            <span className="text-[12px] text-ink-muted">
              {unread.length} unread · {rows.length} need attention
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex gap-0.5 rounded-[14px] border border-border bg-surface-100 p-1">
              {(
                [
                  ['all', 'All', sorted.length],
                  ['unread', 'Unread', unread.length],
                ] as const
              ).map(([k, label, n]) => {
                const on = filter === k;
                return (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setFilter(k)}
                    className="flex items-center gap-1.5 rounded-[10px] border-0 px-3 text-[12.5px] font-medium"
                    style={{ background: on ? 'var(--brand)' : 'transparent', color: on ? 'var(--brand-ink)' : 'var(--ink)', minHeight: 34 }}
                  >
                    {label}
                    <span className="rounded-md px-1.5 text-[10.5px]" style={{ background: on ? 'rgb(0 0 0 / .1)' : 'var(--surface-200)' }}>
                      {n}
                    </span>
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => acks.ackAll(rows.map((x) => x.key))}
              disabled={unread.length === 0}
              className="h-[42px] rounded-[14px] border border-border bg-surface-100 px-3.5 text-[12.5px] font-medium text-ink hover:border-ink-subtle disabled:opacity-45"
            >
              Mark all read
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-2.5">
          {list.map((x) => {
            const k = kindOf(x);
            const t = TONE[k.tone];
            const un = !acks.has(x.key);
            return (
              <div
                key={x.key}
                className="flex items-start gap-3.5 rounded-[18px] border p-4 transition-shadow hover:shadow-[var(--shadow-card)]"
                style={{ background: un ? 'var(--surface-100)' : 'var(--surface-200)', borderColor: un ? 'var(--border)' : 'var(--divider)' }}
              >
                <span className="grid h-10 w-10 flex-none place-items-center rounded-xl" style={{ background: t.bg, color: t.fg }}>
                  {x.agent ? <Sparkles size={18} strokeWidth={1.6} aria-hidden="true" /> : <Bell size={18} strokeWidth={1.6} aria-hidden="true" />}
                </span>
                <button type="button" onClick={() => open(x)} className="flex min-w-0 flex-1 flex-col gap-1 border-0 bg-transparent p-0 text-start text-ink" style={{ minHeight: 0 }}>
                  <span className="flex items-center gap-2">
                    <span className="text-[14px] font-semibold">
                      {x.issue} · <span className="t-mono">{x.subject}</span>
                    </span>
                    {un && <i aria-label="Unread" className="h-[7px] w-[7px] flex-none rounded-full bg-brand" />}
                  </span>
                  <span className="text-[13px] text-ink-muted">{x.detail}</span>
                  <span className="mt-1 flex items-center gap-2.5">
                    <span
                      className="rounded-md border px-2 py-0.5 text-[11px] font-medium"
                      style={{ background: t.bg, color: t.fg, borderColor: `color-mix(in srgb, ${t.fg} 35%, transparent)` }}
                    >
                      {k.kind}
                    </span>
                    <span className="text-[11.5px] text-ink-muted">since {x.since}</span>
                  </span>
                </button>
                <span className="flex flex-none flex-col items-end gap-1">
                  <button type="button" onClick={() => open(x)} className="border-0 bg-transparent pt-0.5 text-[12px] whitespace-nowrap text-ink-muted hover:text-ink" style={{ minHeight: 0, minWidth: 0 }}>
                    {x.action === 'Assign' ? 'Assign →' : x.deliveryId ? 'View delivery →' : 'View truck →'}
                  </button>
                  {x.agent && x.key.startsWith('agent-') && (
                    <button
                      type="button"
                      onClick={() => dismissFlag(x)}
                      title="Dismiss for everyone (rejects the agent's flag)"
                      aria-label={`Dismiss ${x.issue}`}
                      className="grid h-8 w-8 place-items-center rounded-lg border-0 bg-transparent text-ink-muted hover:bg-surface-200 hover:text-ink"
                      style={{ minHeight: 32, minWidth: 32 }}
                    >
                      <X size={15} aria-hidden="true" />
                    </button>
                  )}
                </span>
              </div>
            );
          })}
          {list.length === 0 && <div className="p-10 text-center text-[13px] text-ink-muted">You&apos;re all caught up.</div>}
        </div>
        <span className="text-[11.5px] text-ink-subtle">Shown here: {rules}.</span>
      </div>
    </div>
  );
}
