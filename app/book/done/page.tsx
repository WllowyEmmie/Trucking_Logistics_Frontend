'use client';

import { CheckCircle2, Clock, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState, type ReactNode } from 'react';
import { SiteShell } from '@/components/site/SiteChrome';
import { ApiError } from '@/lib/api';
import { bookingStatus, naira, type BookingStatus } from '@/lib/booking';

// Paystack sends the customer back here with ?reference=. The API asks Paystack whether it was paid
// (coming back proves nothing) and, once it was, gives the tracking link.

const POLL_MS = 3000;
const GIVE_UP_MS = 2 * 60_000;

export default function BookingDone() {
  return (
    <SiteShell>
      <main className="mx-auto flex w-full max-w-[640px] flex-col gap-6 px-4 py-16">
        <Suspense fallback={null}>
          <Status />
        </Suspense>
      </main>
    </SiteShell>
  );
}

function Status() {
  const params = useSearchParams();
  const reference = params.get('reference') ?? params.get('trxref') ?? '';
  const [st, setSt] = useState<BookingStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [waitedOut, setWaitedOut] = useState(false);

  useEffect(() => {
    if (!reference) return;
    let stop = false;
    const started = Date.now();
    async function check() {
      try {
        const s = await bookingStatus(reference);
        if (stop) return;
        setSt(s);
        setError(null);
        if (s.status !== 'awaiting_payment') return;
      } catch (e) {
        if (stop) return;
        setError(e instanceof ApiError ? e.message : 'Couldn’t check the payment.');
        if (e instanceof ApiError && e.status === 404) return;
      }
      if (Date.now() - started > GIVE_UP_MS) {
        setWaitedOut(true);
        return;
      }
      setTimeout(() => void check(), POLL_MS);
    }
    void check();
    return () => {
      stop = true;
    };
  }, [reference]);

  if (!reference) {
    return <Message icon={<XCircle size={28} aria-hidden="true" />} title="No booking to show" body="This page needs the link Paystack sends you back with." />;
  }
  if (st?.status === 'paid' && st.tracking_token) {
    const link = `${typeof window !== 'undefined' ? window.location.origin : ''}/t/${st.tracking_token}`;
    return (
      <>
        <Message
          icon={<CheckCircle2 size={28} aria-hidden="true" className="text-status-completed" />}
          title="Booked and paid"
          body={`${naira(st.amount)} received. Your delivery is ${st.delivery_reference}. Dispatch is assigning a truck now.`}
        />
        <div className="flex flex-col gap-2 rounded-lg border border-border p-4">
          <span className="t-label text-ink-muted">Your tracking link</span>
          <span className="t-mono wrap-anywhere">{link}</span>
          <span className="t-body-sm text-ink-muted">Save it, or share it with whoever&apos;s receiving. It shows the truck live and who signed.</span>
          <div className="flex flex-wrap gap-2 pt-1">
            <Link href={`/t/${st.tracking_token}`} className="inline-flex min-h-11 items-center rounded-md bg-ink px-4 text-[14px] font-semibold text-surface-100 no-underline">
              Track your delivery
            </Link>
            <button
              type="button"
              onClick={() => void navigator.clipboard?.writeText(link)}
              className="min-h-11 rounded-md border border-border bg-surface-100 px-4 text-[14px] font-semibold text-ink"
            >
              Copy link
            </button>
          </div>
        </div>
        <span className="t-body-sm text-ink-muted">Booking reference {st.reference}</span>
      </>
    );
  }
  if (st?.status === 'failed') {
    return (
      <>
        <Message icon={<XCircle size={28} aria-hidden="true" className="text-status-failed" />} title="The payment didn't go through" body="Nothing was booked. You can try again." />
        <Link href="/book" className="inline-flex min-h-11 items-center self-start rounded-md bg-ink px-4 text-[14px] font-semibold text-surface-100 no-underline">
          Book again
        </Link>
      </>
    );
  }
  return (
    <Message
      icon={<Clock size={28} aria-hidden="true" />}
      title={waitedOut ? 'Still waiting for Paystack' : 'Checking your payment…'}
      body={
        waitedOut
          ? `We haven't heard from Paystack yet. If you paid, your booking will go through on its own; keep this reference: ${reference}.`
          : error ?? 'This takes a few seconds.'
      }
    />
  );
}

function Message({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return (
    <div className="flex flex-col gap-3">
      {icon}
      <h1 className="t-display m-0">{title}</h1>
      <p className="t-body m-0 text-ink-muted" style={{ textWrap: 'pretty' }}>
        {body}
      </p>
    </div>
  );
}
