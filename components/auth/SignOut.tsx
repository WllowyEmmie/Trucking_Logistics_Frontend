'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { signOut } from '@/lib/auth';
import { offlineQueue } from '@/lib/offlineQueue';
import { DRIVER_ME_KEY } from './Gate';
import { confirmDialog } from '@/components/Confirm';

/** Ends the session on the server and forgets everything this browser kept for it. */
export function SignOutButton({
  className,
  driver,
  role,
  children,
  iconOnly,
}: {
  className: string;
  driver?: boolean;
  role?: string;
  children?: ReactNode;
  /** The words are for screen readers only (the console sidebar's icon button). */
  iconOnly?: boolean;
}) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  async function go() {
    if (driver) {
      const waiting = offlineQueue.getSnapshot().items.length;
      if (
        waiting &&
        !(await confirmDialog({
          title: 'Sign out anyway?',
          body: `${waiting} update${waiting === 1 ? " hasn't" : "s haven't"} reached dispatch yet. They'll be sent the next time you sign in on this phone.`,
          confirm: 'Sign out',
        }))
      )
        return;
      try {
        localStorage.removeItem(DRIVER_ME_KEY);
        localStorage.removeItem('driver-cache');
      } catch {
        // Nothing kept.
      }
    }
    setBusy(true);
    await signOut(qc);
    setBusy(false);
  }
  return (
    <button type="button" role={role} onClick={() => void go()} disabled={busy} className={className} title={iconOnly ? 'Sign out' : undefined}>
      {children}
      <span className={iconOnly ? 'sr-only' : undefined}>{busy ? 'Signing out…' : 'Sign out'}</span>
    </button>
  );
}

