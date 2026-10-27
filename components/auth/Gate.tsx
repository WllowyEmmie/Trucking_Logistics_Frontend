'use client';

import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { useMe, type Me } from '@/lib/auth';
import { ChooseDriverPin, DispatcherSignIn, DriverSignIn } from './SignIn';

const MeContext = createContext<Me | null>(null);

/** Who's signed in, inside a gate. */
export function useSignedInAs(): Me {
  const me = useContext(MeContext);
  if (!me) throw new Error('useSignedInAs outside a sign-in gate');
  return me;
}

function Unreachable({ onRetry }: { onRetry: () => void }) {
  return (
    <main className="flex min-h-dvh flex-col items-start gap-3 bg-surface-100 p-6 text-ink">
      <h1 className="t-h1 m-0">Can&apos;t reach the dispatch server</h1>
      <p className="t-body m-0 text-ink-muted">Check the connection, then try again.</p>
      <button type="button" onClick={onRetry} className="min-h-11 rounded-md border border-border bg-surface-100 px-4 font-semibold text-ink">
        Try again
      </button>
    </main>
  );
}

/** Console, Fleet and Settings: dispatchers only. */
export function DispatcherGate({ children }: { children: ReactNode }) {
  const q = useMe();
  if (q.isPending) return <div className="min-h-dvh bg-surface-200" aria-busy="true" />;
  if (q.isError) return <Unreachable onRetry={() => void q.refetch()} />;
  if (!q.data || q.data.role !== 'dispatcher') return <DispatcherSignIn signedInAs={q.data?.name ?? null} />;
  return <MeContext.Provider value={q.data}>{children}</MeContext.Provider>;
}

/** Kept on the phone so the app still opens in a dead spot; cleared on sign-out. */
export const DRIVER_ME_KEY = 'driver-me';

function readCachedDriver(): Me | null {
  try {
    const s = localStorage.getItem(DRIVER_ME_KEY);
    return s ? (JSON.parse(s) as Me) : null;
  } catch {
    return null;
  }
}

/**
 * The driver app. Offline, the last signed-in driver carries on: the queue holds what they do
 * until there's signal, and the server checks the session again when it sends.
 */
export function DriverGate({ children }: { children: ReactNode }) {
  const q = useMe();
  const me = q.data;
  useEffect(() => {
    try {
      if (me && me.role === 'driver') localStorage.setItem(DRIVER_ME_KEY, JSON.stringify(me));
      else if (me === null) localStorage.removeItem(DRIVER_ME_KEY);
    } catch {
      // Storage blocked: the app just needs signal to open.
    }
  }, [me]);

  if (q.isPending) return <div className="min-h-dvh bg-surface-200" aria-busy="true" />;
  if (q.isError) {
    const cached = readCachedDriver();
    if (cached) return <MeContext.Provider value={cached}>{children}</MeContext.Provider>;
    return <Unreachable onRetry={() => void q.refetch()} />;
  }
  if (!me || me.role !== 'driver') return <DriverSignIn />;
  if (me.must_change_pin) return <ChooseDriverPin name={me.name} />;
  return <MeContext.Provider value={me}>{children}</MeContext.Provider>;
}
