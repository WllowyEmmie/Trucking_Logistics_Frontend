'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { inputCls } from '@/components/console/ui';
import { PhoneInput } from '@/components/PhoneInput';
import { primaryCls, primaryStyle } from '@/components/driver/ui';
import { ApiError } from '@/lib/api';
import { useConfig } from '@/lib/config';
import { defaultPhoneCountry, emptyPhone, toE164, type PhoneValue } from '@/lib/phone';
import { ME_KEY, driverSignIn, signIn, type Me } from '@/lib/auth';

function message(e: unknown, fallback: string): string {
  if (e instanceof ApiError) return e.status === 0 ? 'Could not reach the dispatch server. Check the connection.' : e.message;
  return fallback;
}

/** After a sign-in: remember who, and refetch everything as them. */
function useSignedIn() {
  const qc = useQueryClient();
  return (me: Me) => {
    qc.setQueryData(ME_KEY, me);
    void qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== ME_KEY[0] });
  };
}

/** Email and password, for the console, Fleet and Settings. */
export function DispatcherSignIn({ signedInAs }: { signedInAs?: string | null }) {
  const config = useConfig();
  const done = useSignedIn();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const me = await signIn(email.trim(), password);
      if (me.role !== 'dispatcher') throw new Error('That account is not a dispatcher.');
      done(me);
    } catch (err) {
      setError(message(err, err instanceof Error ? err.message : 'Sign-in failed.'));
      setPassword('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-surface-200 px-4 text-ink">
      <form onSubmit={submit} aria-label="Sign in" className="flex w-full max-w-[380px] flex-col gap-4 rounded-lg border border-border bg-surface-100 p-6">
        <div className="flex flex-col gap-1">
          <span className="t-label text-ink-muted">{config.operator_name} · Dispatch</span>
          <h1 className="t-h1 m-0">Sign in</h1>
          {signedInAs && <span className="t-body-sm text-ink-muted">You&apos;re signed in as {signedInAs}. This page needs a dispatcher account.</span>}
        </div>
        {error && (
          <div role="alert" className="t-body-sm rounded-md border border-status-failed bg-status-failed-bg px-3 py-2.5 font-semibold">
            {error}
          </div>
        )}
        <label className="flex flex-col gap-1.5">
          <span className="t-body-sm font-semibold">Email</span>
          <input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls()} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="t-body-sm font-semibold">Password</span>
          <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls()} />
        </label>
        <button type="submit" disabled={busy || !email.trim() || !password} className="min-h-11 rounded-md border-0 bg-ink text-[14px] font-semibold text-surface-100 disabled:opacity-45">
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        <span className="t-body-sm text-ink-muted">No account? Ask whoever runs the dispatch server to add you.</span>
      </form>
    </main>
  );
}

/** Phone number and PIN, sized for a cab. The PIN comes from dispatch. */
export function DriverSignIn() {
  const done = useSignedIn();
  const config = useConfig();
  const [phone, setPhone] = useState<PhoneValue>(() => emptyPhone(defaultPhoneCountry(config)));
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      // Joined the same way as when dispatch added them, so 0803… and +234803… both match.
      done(await driverSignIn(toE164(phone), pin));
    } catch (err) {
      setError(message(err, 'Sign-in failed.'));
      setPin('');
    } finally {
      setBusy(false);
    }
  }

  const field = 'min-h-16 rounded-lg border-2 border-ink bg-surface-100 px-4 text-[20px] font-medium text-ink';
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[560px] flex-col bg-surface-100 px-4 py-6 text-ink">
      <form onSubmit={submit} aria-label="Driver sign in" className="flex flex-1 flex-col gap-5">
        <div className="flex flex-col gap-1">
          <span className="t-label text-ink-muted">{config.operator_name} · Driver</span>
          <h1 className="t-display m-0">Sign in</h1>
          <span className="t-driver-meta text-ink-muted">Your phone number and the PIN dispatch gave you.</span>
        </div>
        {error && (
          <div role="alert" className="t-driver-meta rounded-lg border-2 border-status-failed bg-status-failed-bg p-4 font-bold">
            {error}
          </div>
        )}
        <div className="flex flex-col gap-2">
          <label htmlFor="driver-signin-phone" className="t-driver-action">
            Phone number
          </label>
          <PhoneInput id="driver-signin-phone" value={phone} onChange={setPhone} size="lg" label="Phone number" />
        </div>
        <label className="flex flex-col gap-2">
          <span className="t-driver-action">PIN</span>
          <input
            type="password"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={8}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            className={`${field} tracking-[0.3em]`}
          />
        </label>
        <div className="mt-auto flex flex-col gap-2">
          <button type="submit" disabled={busy || !toE164(phone) || pin.length < 4} className={primaryCls} style={primaryStyle}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
          {config.dispatch_phone && (
            <span className="t-driver-meta text-center text-ink-muted">Forgot your PIN? Call dispatch on {config.dispatch_phone}.</span>
          )}
        </div>
      </form>
    </main>
  );
}
