'use client';

import { formatDuration } from '@/lib/format';
import { useDriver } from './DriverProvider';

/** Inline, once per gap, after unlock. Not a modal, no sound. Clears on OK or at the next stop confirmation. */
export function PausedNotice() {
  const { gap, dismissGap, keepScreenOn, time } = useDriver();
  if (!gap) return null;
  const mins = formatDuration((gap.to - gap.from) / 60_000);
  return (
    <div role="status" className="flex flex-col gap-2.5 rounded-lg border-2 border-status-transit bg-accent-bg p-4">
      <span className="t-h1">Location paused for {mins}</span>
      <span className="t-driver-meta">
        Your phone stopped sharing location from {time(new Date(gap.from))} to {time(new Date(gap.to))} while the screen was locked.
        Dispatch sees a gap on the map.
      </span>
      <div className="mt-1 flex flex-wrap gap-4">
        <button
          type="button"
          onClick={keepScreenOn}
          className="t-driver-meta min-h-14 flex-[1_1_180px] rounded-lg border-2 border-ink bg-surface-100 px-3.5 font-bold text-ink"
        >
          Keep screen on
        </button>
        <button
          type="button"
          onClick={dismissGap}
          className="t-driver-meta min-h-14 flex-[0_1_100px] rounded-lg border-2 border-border bg-transparent px-3.5 font-bold text-ink"
        >
          OK
        </button>
      </div>
    </div>
  );
}
