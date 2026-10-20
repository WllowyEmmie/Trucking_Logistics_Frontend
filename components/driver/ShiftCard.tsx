'use client';

import { useDriver } from './DriverProvider';

const smallBtn = 't-driver-meta min-h-14 flex-none rounded-lg border-2 border-ink bg-surface-100 px-3.5 font-bold text-ink';

/**
 * On shift or off, on every driver screen. The driver can end the shift unless a delivery is
 * under way (the API refuses that too: the goods would be on board with GPS off).
 * `action` false: the screen has its own big shift button.
 */
export function ShiftCard({ action = true }: { action?: boolean }) {
  const { onShift, setShift, active } = useDriver();
  const underWay = active?.status === 'in_transit';
  const text = onShift
    ? underWay
      ? 'Dispatch can see where the truck is. You can end your shift after this delivery.'
      : 'Dispatch can see where the truck is. End your shift when you finish for the day.'
    : active
      ? 'Your location isn’t shared. Starting the delivery starts your shift.'
      : 'Your location isn’t shared. Start your shift when you’re ready to drive. Signing in or starting a delivery starts it too.';
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border-2 border-border px-4 py-3">
      <div className="flex min-w-0 flex-col gap-1">
        <span className="t-driver-action">{onShift ? 'On shift' : 'Off shift'}</span>
        <span className="t-driver-meta text-ink-muted">{text}</span>
      </div>
      {action && onShift && !underWay && (
        <button type="button" onClick={() => setShift(false)} className={smallBtn}>
          End shift
        </button>
      )}
      {action && !onShift && (
        <button type="button" onClick={() => setShift(true)} className={smallBtn}>
          Start shift
        </button>
      )}
    </div>
  );
}
