'use client';

import Link from 'next/link';
import { StatusPill } from '@/components/StatusPill';
import { useConfig } from '@/lib/config';
import { useDeliveries, useDeliveryDetails } from '@/lib/deliveries';

// Development index: where each surface lives. Not part of any product surface.

/**
 * The tracking-link list shows every recent customer's name and private link to whoever opens "/".
 * Fine on a laptop; not on a deployed site with no login. Off in production builds unless asked for.
 */
const SHOW_LINKS = process.env.NODE_ENV !== 'production' || process.env.NEXT_PUBLIC_SHOW_DEV_INDEX === 'true';

/** How many tracking links to list: the most recent deliveries. */
const RECENT = 20;

/**
 * The real customer links for the latest deliveries. GET /deliveries has no tracking token, so each
 * one comes from that delivery's detail. Works the same against the API and in mock mode.
 */
function TrackingLinks() {
  const list = useDeliveries(60_000);
  const recent = (list.data ?? []).slice(0, RECENT);
  const details = useDeliveryDetails(
    recent.map((d) => d.id),
    false,
  );

  if (list.isPending) return <p className="t-body m-0 text-ink-muted">Loading deliveries…</p>;
  if (list.isError) return <p className="t-body m-0 text-attention">Couldn&apos;t load deliveries: {list.error.message}</p>;
  if (recent.length === 0) return <p className="t-body m-0 text-ink-muted">No deliveries yet. Create one in the console.</p>;

  return (
    <ul className="m-0 flex list-none flex-col gap-2 p-0">
      {recent.map((d, i) => {
        const token = details[i]?.data?.delivery.tracking_token;
        return (
          <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {token ? (
              <Link href={`/t/${token}`} className="t-body font-semibold">
                {d.reference} · {d.customer_name}
              </Link>
            ) : (
              <span className="t-body font-semibold text-ink-muted">
                {d.reference} · {d.customer_name}
              </span>
            )}
            <StatusPill status={d.status} size="sm" />
            <span className="t-mono text-ink-muted">{token ? `/t/${token}` : details[i]?.isError ? 'no link' : '…'}</span>
          </li>
        );
      })}
      <li className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Link href="/t/nosuchlink000000" className="t-body font-semibold">
          A link that doesn&apos;t exist
        </Link>
        <span className="t-mono text-ink-muted">/t/nosuchlink000000</span>
      </li>
    </ul>
  );
}

export default function Home() {
  const config = useConfig();
  return (
    <main className="mx-auto flex max-w-[720px] flex-col gap-8 px-4 py-12">
      <div className="flex flex-col gap-2">
        <span className="t-label text-ink-muted">{config.operator_name}</span>
        <h1 className="t-display m-0">Dispatch</h1>
      </div>
      <section className="flex flex-col gap-3">
        <h2 className="t-h2 m-0">Dispatcher</h2>
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          <li><Link href="/console" className="t-body font-semibold">Console</Link></li>
          <li><Link href="/console/fleet" className="t-body font-semibold">Fleet</Link></li>
          <li><Link href="/console/settings" className="t-body font-semibold">Operator settings</Link></li>
        </ul>
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="t-h2 m-0">Driver</h2>
        <Link href="/driver" className="t-body font-semibold">Driver app (sign in with a driver's phone number and PIN)</Link>
      </section>
      {SHOW_LINKS && (
        <section className="flex flex-col gap-3">
          <h2 className="t-h2 m-0">Customer tracking links</h2>
          <p className="t-body-sm m-0 text-ink-muted">The {RECENT} most recent deliveries, newest first.</p>
          <TrackingLinks />
        </section>
      )}
    </main>
  );
}
