'use client';

import { WifiOff } from 'lucide-react';
import type { ReactNode } from 'react';
import { formatDuration, secondsSince } from '@/lib/format';
import { queueLines } from '@/lib/offlineQueue';
import { useNow } from '@/lib/useNow';
import { useDriver } from './DriverProvider';

const dot = (bg: string, border = 'none') => (
  <span aria-hidden="true" className="h-3 w-3 flex-none rounded-full" style={{ background: bg, border, boxSizing: 'border-box' }} />
);

/** Always visible, always says whether GPS is reaching dispatch. Offline inverts it to ink. */
export function GpsStrip({ allSent }: { allSent?: boolean }) {
  const { gps, gap, queue, online, time } = useDriver();
  const now = useNow(1000);
  const waiting = queueLines(queue.items, time).length;
  const offline = !online || queue.networkDown;

  let left: ReactNode;
  if (gps.state === 'off') {
    left = (
      <>
        {dot('transparent', '2px solid var(--border)')}
        Off shift · GPS off
      </>
    );
  } else if (gps.state === 'denied' || gps.state === 'unsupported') {
    left = (
      <>
        {dot('transparent', '2px solid var(--attention)')}
        {gps.state === 'denied' ? 'GPS off · location not allowed' : 'GPS not available on this phone'}
      </>
    );
  } else if (offline) {
    left = (
      <>
        {dot('var(--surface-100)')}
        GPS recording
      </>
    );
  } else if (gps.state === 'starting' || gps.lastFixAt == null) {
    left = (
      <>
        {dot('transparent', '2px solid var(--status-completed)')}
        GPS starting…
      </>
    );
  } else if (gap) {
    left = (
      <>
        {dot('var(--status-completed)')}
        GPS live · gap {formatDuration((gap.to - gap.from) / 60_000)}
      </>
    );
  } else {
    const last = queue.lastLocationSentAt ?? gps.lastFixAt;
    left = (
      <>
        {dot('var(--status-completed)')}
        GPS live · {secondsSince(last, now)} s ago
      </>
    );
  }

  const right = offline ? (
    <>
      <WifiOff size={20} strokeWidth={2.5} aria-hidden="true" />
      {waiting ? `Offline · ${waiting} waiting` : 'Offline'}
    </>
  ) : waiting ? (
    `Online · ${waiting} waiting`
  ) : allSent ? (
    'Online · all sent'
  ) : (
    'Online'
  );

  return (
    <div
      className="flex min-h-12 flex-none items-center justify-between gap-3 px-4 py-2"
      style={
        offline
          ? { background: 'var(--ink)', color: 'var(--surface-100)' }
          : { background: 'var(--surface-200)', color: 'var(--ink)', borderBottom: '1px solid var(--border)' }
      }
    >
      <span className="t-driver-meta flex items-center gap-2 font-bold">{left}</span>
      <span className="t-driver-meta flex items-center gap-2 text-end font-bold">{right}</span>
    </div>
  );
}
