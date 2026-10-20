'use client';

import { offlineQueue, queueLines } from '@/lib/offlineQueue';
import { useDriver } from './DriverProvider';
import { secondaryCls } from './ui';

/**
 * What's waiting to send, each with the time it happened (not when it sends), plus anything the
 * server refused (a 4xx drops the item; its message is shown here word for word).
 */
export function QueueCard() {
  const { queue, online, time } = useDriver();
  const lines = queueLines(queue.items, time);
  const offline = !online || queue.networkDown;

  return (
    <>
      {queue.dropped.length > 0 && (
        <div role="alert" className="flex flex-col gap-2.5 rounded-lg border-2 border-status-failed bg-status-failed-bg p-4">
          <span className="t-h2">Dispatch didn&apos;t accept this</span>
          <ul className="t-driver-meta m-0 flex list-none flex-col gap-1.5 p-0">
            {queue.dropped.map((d, i) => (
              <li key={d.item.id ?? i} className="font-mono text-[15px]">
                {d.message}
              </li>
            ))}
          </ul>
          <span className="t-driver-meta">Call dispatch if you&apos;re not sure what happened.</span>
          <button type="button" onClick={() => offlineQueue.clearDropped()} className={secondaryCls}>
            OK
          </button>
        </div>
      )}
      {offline && lines.length > 0 && (
        <div className="flex flex-col gap-2.5 rounded-lg border-2 border-ink p-4">
          <span className="t-h2">Waiting to send · {lines.length}</span>
          <ol className="t-driver-meta m-0 flex flex-col gap-1.5 ps-5">
            {lines.map((l, i) => (
              // Two identical steps in the same minute give identical lines: the index keeps keys unique.
              <li key={`${i}:${l}`}>{l}</li>
            ))}
          </ol>
          <span className="t-body text-ink-muted">Sends by itself when signal returns. Closing the app doesn&apos;t lose them.</span>
        </div>
      )}
    </>
  );
}
