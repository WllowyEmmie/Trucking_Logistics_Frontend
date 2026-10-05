'use client';

import { Navigation } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useDriver } from '@/components/driver/DriverProvider';
import { DriverScreen } from '@/components/driver/DriverScreen';
import { navHref, primaryCls, primaryStyle } from '@/components/driver/ui';
import { StatusPill } from '@/components/StatusPill';
import { FAIL_REASONS } from '@/lib/labels';

// Delivery done: a plain summary, then one action. A new assignment replaces this screen.
export default function DonePage() {
  const router = useRouter();
  const { active, ended, progressFor, time, loading } = useDriver();

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
  const drops = ended.stops.filter((s) => s.kind === 'dropoff');
  const delivered = failed ? drops.filter((s) => s.status === 'done' || p.done[s.seq]).length : drops.length;
  const reason = ended.failure_reason ?? p.failReason ?? null;
  const depot = ended.stops[0];
  const rows: [string, string][] = [
    ['Stops delivered', `${delivered} of ${drops.length}`],
    ['Problems reported', reason ? (FAIL_REASONS.find((r) => r.key === reason)?.label ?? 'Other') : 'None'],
  ];
  if (ended.started_at) rows.push(['Started', time(ended.started_at)]);
  if (p.podName) rows.push(['Signed for by', p.podName]);

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
          {ended.id}
          {ended.ended_at ? ` · finished ${time(ended.ended_at)}` : ''}
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
