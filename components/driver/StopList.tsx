'use client';

import { Check } from 'lucide-react';
import Link from 'next/link';
import { formatDistance, haversineKm } from '@/lib/format';
import type { AppConfig } from '@/lib/config';
import type { DriverStop } from './DriverProvider';

const kindLabel = (k: DriverStop['kind']) => (k === 'pickup' ? 'Pickup' : 'Drop-off');

interface Props {
  stops: DriverStop[];
  current: number;
  config: AppConfig;
  pos: { lat: number; lng: number } | null;
  time: (iso: string) => string;
}

/** Done stops recede with a check; the current stop is the only tinted, outlined row. */
export function StopList({ stops, current, config, pos, time }: Props) {
  return (
    <ol className="-mx-4 my-0 flex list-none flex-col gap-1 p-0">
      {stops.map((s, i) => {
        if (s.done) {
          return (
            <li key={s.seq} className="grid gap-3 px-4 py-2.5 text-ink-muted" style={{ gridTemplateColumns: '36px minmax(0,1fr)' }}>
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-300" aria-hidden="true">
                <Check size={18} strokeWidth={3} />
              </span>
              <div className="flex min-w-0 flex-col">
                <span className="t-driver-meta">
                  {s.seq} · {kindLabel(s.kind)} · Done{s.doneAt ? ` ${time(s.doneAt)}` : ''}
                  <span className="sr-only"> (done)</span>
                </span>
                <span className="t-body wrap-anywhere">{s.address}</span>
              </div>
            </li>
          );
        }
        if (i === current) {
          const meta = pos && s.lat != null && s.lng != null ? `${formatDistance(haversineKm(pos, { lat: s.lat, lng: s.lng }), config.units, config.locale)} away` : null;
          return (
            <li key={s.seq}>
              <Link
                href={`/driver/stop/${s.seq}`}
                aria-current="step"
                className="mx-3 grid gap-3 rounded-lg border-[3px] border-accent bg-accent-bg px-3 py-4 text-start no-underline"
                style={{ gridTemplateColumns: '36px minmax(0,1fr)', color: 'var(--ink)' }}
              >
                <span
                  aria-hidden="true"
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-[18px] font-bold"
                  style={{ color: 'var(--surface-100)' }}
                >
                  {s.seq}
                </span>
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="t-label text-accent">Now · {kindLabel(s.kind)}</span>
                  <span className="wrap-anywhere text-[20px] leading-[26px] font-bold">{s.address}</span>
                  {meta && <span className="t-driver-meta">{meta}</span>}
                </span>
              </Link>
            </li>
          );
        }
        return (
          <li key={s.seq} className="grid gap-3 px-4 py-2.5" style={{ gridTemplateColumns: '36px minmax(0,1fr)' }}>
            <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-ink font-bold">
              {s.seq}
            </span>
            <div className="flex min-w-0 flex-col">
              <span className="t-driver-meta text-ink-muted">
                <span className="sr-only">Stop {s.seq}, </span>
                {kindLabel(s.kind)}
              </span>
              <span className="t-body-lg wrap-anywhere">{s.address}</span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
