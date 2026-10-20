// Sending a failed delivery out again: POST /deliveries/{id}/reopen {mode, truck_id}.
// What makes sense depends on where the goods are and why it failed. The API checks the same
// rules (internal/api/reopen.go); this decides what the console offers and recommends.

import type { DeliveryEvent, FailReason, Stop } from './types';

export type ReopenMode = 'resume' | 'handover' | 'restart';

export interface ReopenOption {
  key: 'reassign' | 'try_again' | 'handover' | 'restart';
  mode: ReopenMode;
  title: string;
  /** One line on what happens. */
  blurb: string;
  /** The button on each truck. */
  verb: string;
  /** Only the truck that had it (try again). */
  sameTruck?: boolean;
  /** Any truck but the one that had it (handover). */
  otherTruck?: boolean;
}

const open = (s: Stop) => s.status === 'pending' || s.status === 'arrived';

/** A pickup was collected and a stop is still to do: the goods are on the truck that failed. */
export const goodsOnTruck = (stops: Stop[]) => stops.some((s) => s.stop_type === 'pickup' && s.status === 'completed') && stops.some(open);

/** The reason on the latest `failed` event. */
export function failReasonOf(events: DeliveryEvent[]): FailReason | null {
  for (let i = events.length - 1; i >= 0; i--) if (events[i]!.event_type === 'failed') return (events[i]!.note as FailReason) ?? null;
  return null;
}

/** The options for this failed delivery, the recommended one first. */
export function reopenOptions(stops: Stop[], reason: FailReason | null, plate: string | null): ReopenOption[] {
  const truck = plate ?? 'the same truck';
  const restart: ReopenOption = {
    key: 'restart',
    mode: 'restart',
    title: 'Start over',
    blurb: 'Fresh goods from the pickup: every stop is done again, on any truck.',
    verb: 'Start over',
  };
  if (!goodsOnTruck(stops)) {
    const reassign: ReopenOption = {
      key: 'reassign',
      mode: 'resume',
      title: 'Reassign',
      blurb: 'Nothing was collected yet, so any truck can do it from the pickup.',
      verb: 'Reassign',
    };
    return reason === 'goods_damaged' ? [restart, reassign] : [reassign, restart];
  }
  const handover: ReopenOption = {
    key: 'handover',
    mode: 'handover',
    title: 'Hand over',
    blurb: `Another truck collects the goods from ${truck} where it stopped, then does the drop-offs left.`,
    verb: 'Hand over',
    otherTruck: true,
  };
  const tryAgain: ReopenOption = {
    key: 'try_again',
    mode: 'resume',
    title: 'Try again',
    blurb: `${truck} still has the goods: it does the drop-offs left again.`,
    verb: 'Send again',
    sameTruck: true,
  };
  if (reason === 'breakdown' || reason === 'accident') return [handover, restart];
  if (reason === 'goods_damaged') return [restart, handover, tryAgain];
  return [tryAgain, handover, restart];
}
