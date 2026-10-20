'use client';

import { Navigation } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useDriver } from '@/components/driver/DriverProvider';
import { DriverScreen } from '@/components/driver/DriverScreen';
import { navHref, primaryCls, primaryStyle } from '@/components/driver/ui';
import { StatusPill } from '@/components/StatusPill';
import { endedAt, eventAt, failReasonOf, useDeliveryDetail } from '@/lib/deliveries';
import { FAIL_REASONS } from '@/lib/labels';

// Delivery done: a plain summary, then one action. A new assignment replaces this screen.
export default function DonePage() {
  const router = useRouter();
  const { active, ended, progressFor, localStatusAt, time, loading } = useDriver();
  // Stops and times are only in the delivery's detail. While the final action is still queued,
  // the server hasn't recorded the end yet, so this phone's own times fill in.
  const detail = useDeliveryDetail(ended?.id ?? null, false).data;

  useEffect(() => {
    if (active) router.replace('/driver');
  }, [active, router]);

  if (!ended) {
    return (
      <DriverScreen
        bottom={
          <Link href="/driver" role="button" className={primaryCls} style={primaryStyle}>
            Today
          </Link>
        }
      >
        {!loading && <h1 className="t-display m-0 pt-4">Nothing finished yet today</h1>}
      </DriverScreen>
    );
  }

  const p = progressFor(ended.id);
  const failed = ended.status === 'failed';
  const events = detail?.events ?? [];
  const stops = detail?.stops ?? [];
  const drops = stops.filter((s) => s.stop_type === 'dropoff');
  const delivered = drops.filter((s) => s.status === 'completed' || p.done[s.sequence]).length;
  const reason = failReasonOf(events) ?? p.failReason ?? null;
  const started = eventAt(events, 'in_transit');
  const finished = endedAt(events) ?? localStatusAt(ended.id);
  const depot = stops[0];

  const rows: [string, string][] = [];
  if (detail) rows.push(['Stops delivered', `${failed ? delivered : drops.length} of ${drops.length}`]);
  rows.push(['Problems reported', reason ? (FAIL_REASONS.find((r) => r.key === reason)?.label ?? 'Other') : 'None']);
  if (started) rows.push(['Started', time(started)]);
  const signed = Object.entries(p.received ?? {});
  if (signed.length === 1) rows.push(['Signed for by', signed[0]![1]]);
  else for (const [seq, name] of signed) rows.push([`Stop ${seq} signed by`, name]);
  if (!signed.length && p.podName) rows.push(['Signed for by', p.podName]);

  return (
    <DriverScreen
      allSent
      bottom={
        depot && (
          <a href={navHref(depot.lat, depot.lng, depot.address)} role="button" className={primaryCls} style={primaryStyle}>
            <Navigation size={24} strokeWidth={2.5} aria-hidden="true" />
            Navigate to depot
          </a>
        )
      }
    >
      <div className="flex flex-col gap-5 pt-3">
        <div className="flex">
          <StatusPill status={ended.status} size="lg" />
        </div>
        <h1 className="t-display m-0">{failed ? 'Delivery stopped' : 'Delivery done'}</h1>
        <span className="t-driver-meta">
          {ended.reference}
          {finished ? ` · finished ${time(finished)}` : ''}
        </span>
        <dl className="m-0 grid gap-x-4 gap-y-3 border-y border-divider py-4" style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }}>
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="t-driver-meta">{k}</dt>
              <dd className="t-driver-action m-0 text-end">{v}</dd>
            </div>
          ))}
        </dl>
        <span className="t-driver-meta text-ink-muted">
          {failed ? 'Dispatch will call you about the goods still on board. ' : ''}No next delivery yet. Dispatch will send it here.
        </span>
      </div>
    </DriverScreen>
  );
}
