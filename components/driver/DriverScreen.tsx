'use client';

import type { ReactNode } from 'react';
import { GpsStrip } from './GpsStrip';
import { PausedNotice } from './PausedNotice';
import { QueueCard } from './QueueCard';

interface Props {
  /** Row under the strip: Back / Problem / Cancel. */
  top?: ReactNode;
  children: ReactNode;
  /** The bottom bar: one primary action, within thumb reach. */
  bottom?: ReactNode;
  allSent?: boolean;
  /** Notices (paused, queue) go above the content. */
  notices?: boolean;
}

/** Strip at the top, scrolling body, primary action at the bottom. */
export function DriverScreen({ top, children, bottom, allSent, notices = true }: Props) {
  return (
    <div className="mx-auto flex h-dvh w-full max-w-[560px] flex-col bg-surface-100 text-ink sm:border-x sm:border-border">
      <GpsStrip allSent={allSent} />
      {top && <div className="flex flex-none items-center justify-between gap-4 px-4 py-3">{top}</div>}
      <main className="scroll-pad flex min-h-0 flex-1 flex-col gap-5 overflow-auto px-4 pt-4 pb-4">
        {notices && (
          <>
            <PausedNotice />
            <QueueCard />
          </>
        )}
        {children}
      </main>
      {bottom && <div className="flex flex-none flex-col gap-2 border-t border-border p-4">{bottom}</div>}
    </div>
  );
}
