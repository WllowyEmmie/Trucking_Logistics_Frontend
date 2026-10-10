'use client';

import { X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import type { AppConfig } from '@/lib/config';
import { hasPosition, isStale } from '@/lib/exceptions';
import { formatDistance, formatTime, haversineKm } from '@/lib/format';
import type { Truck } from '@/lib/types';

interface Answer {
  title: string;
  rows: { key: string; text: string; sub: string; onClick: () => void }[];
  foot: string;
}

interface Props {
  trucks: Truck[];
  driverName: (driverId: string | null) => string | null;
  config: AppConfig;
  now: number;
  onSelectTruck: (id: string) => void;
}

/**
 * Ask box with an inline answer card: one answer at a time, no message history.
 * TODO(agent-api): until there's an agent endpoint, questions are answered by filtering locally.
 */
export function AskBox({ trucks, driverName, config, now, onSelectTruck }: Props) {
  const [q, setQ] = useState('');
  const [answer, setAnswer] = useState<Answer | null>(null);

  function ask(e: FormEvent) {
    e.preventDefault();
    const text = q.toLowerCase();
    const foot = `From positions at ${formatTime(new Date(now), config.timezone, config.locale)}.`;
    if (/late|behind|delay|slow/.test(text)) {
      // TODO(eta-api): stops carry no ETA or promised time, so lateness can't be worked out.
      setAnswer({
        title: "I can't tell which deliveries are late yet.",
        rows: [],
        foot: "That needs an ETA and a promised time for each stop, which the dispatch server doesn't provide yet. I can tell you which trucks are free.",
      });
    } else if (/free|available|idle/.test(text)) {
      const free = trucks
        .filter((t) => t.status === 'available' && hasPosition(t) && !isStale(t, config, now))
        .map((t) => ({ t, km: haversineKm(config.center, { lat: t.lat!, lng: t.lng! }) }))
        .sort((a, b) => a.km - b.km);
      setAnswer({
        title: free.length === 1 ? '1 truck is free' : `${free.length} trucks are free`,
        rows: free.map(({ t, km }) => ({
          key: t.id,
          text: `${t.plate_number} · ${driverName(t.driver_id) ?? 'no driver'}`,
          sub: `${formatDistance(km, config.units, config.locale)} from the map centre`,
          onClick: () => onSelectTruck(t.id),
        })),
        foot: `${foot} Nearest to the map centre first, straight-line distance.`,
      });
    } else {
      setAnswer({
        title: "I can answer questions about today's trucks and positions.",
        rows: [],
        foot: 'For example: which trucks are free.',
      });
    }
  }

  return (
    <>
      <form onSubmit={ask} role="search" className="flex gap-2 border-b border-divider p-3">
        <label className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-md border border-border bg-surface-100 ps-3 pe-1">
          <span className="t-label text-agent">Ask</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Which trucks are free?"
            aria-label="Ask about deliveries and trucks"
            className="min-h-10 min-w-0 flex-1 border-0 bg-transparent text-[14px] text-ink outline-offset-0"
          />
        </label>
        <button type="submit" className="min-h-11 rounded-md border border-agent bg-agent-bg px-3.5 text-[14px] font-semibold text-agent">
          Ask
        </button>
      </form>
      {answer && (
        <div role="region" aria-label="Answer" className="mx-3 mt-2 mb-1 flex flex-col gap-2 rounded-md border border-agent bg-agent-bg p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="t-label text-agent">Answer</span>
              <span className="t-h3">{answer.title}</span>
            </div>
            <button
              type="button"
              onClick={() => setAnswer(null)}
              aria-label="Dismiss answer"
              className="-me-2 -mt-2.5 flex h-11 w-11 flex-none items-center justify-center border-0 bg-transparent text-ink"
            >
              <X size={18} strokeWidth={2.5} aria-hidden="true" />
            </button>
          </div>
          {answer.rows.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={r.onClick}
              className="flex flex-col gap-0.5 rounded-md border border-border bg-surface-100 px-2.5 py-2 text-start text-ink"
            >
              <span className="t-body-sm font-bold">{r.text}</span>
              <span className="t-body-sm text-ink-muted">{r.sub}</span>
            </button>
          ))}
          <span className="t-body-sm text-ink-muted">{answer.foot}</span>
        </div>
      )}
    </>
  );
}
