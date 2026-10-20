'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { signOut } from '@/lib/auth';
import { offlineQueue } from '@/lib/offlineQueue';
import { DRIVER_ME_KEY } from './Gate';

/** Ends the session on the server and forgets everything this browser kept for it. */
export function SignOutButton({ className, driver, role, children }: { className: string; driver?: boolean; role?: string; children?: ReactNode }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  async function go() {
    if (driver) {
      const waiting = offlineQueue.getSnapshot().items.length;
      if (waiting && !window.confirm(`${waiting} update${waiting === 1 ? " hasn't" : "s haven't"} reached dispatch yet. They'll be sent the next time you sign in on this phone. Sign out anyway?`)) return;
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
    <button type="button" role={role} onClick={() => void go()} disabled={busy} className={className}>
      {children}
      {busy ? 'Signing out…' : 'Sign out'}
    </button>
  );
}

