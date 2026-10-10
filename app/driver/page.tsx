'use client';

import Link from 'next/link';
import { useDriver } from '@/components/driver/DriverProvider';
import { DriverScreen } from '@/components/driver/DriverScreen';
import { HoldToConfirm } from '@/components/driver/HoldToConfirm';
import { StopList } from '@/components/driver/StopList';
import { primaryCls, primaryStyle, secondaryCls, secondaryStyle, telHref } from '@/components/driver/ui';

// Today: the stops of the current delivery, or the empty state.
export default function DriverToday() {
  const { active, detail, stops, current, config, truckLabel, driverName, gps, time, start, loading, loadError } = useDriver();
  const callDispatch = (
    config.dispatch_phone ? (
      <a href={telHref(config.dispatch_phone)} role="button" className={secondaryCls} style={secondaryStyle}>
        Call dispatch
      </a>
    ) : undefined
  );

  if (!active) {
    if (loading) return <DriverScreen notices={false}>{null}</DriverScreen>;
    return (
      <DriverScreen bottom={callDispatch}>
        <div className="flex flex-col gap-3.5 pt-4">
          <span className="t-label text-ink-muted">
            {truckLabel}
            {driverName ? ` · ${driverName}` : ''}
          </span>
          {loadError ? (
            <>
              <h1 className="t-display m-0">Can&apos;t reach dispatch</h1>
              <p className="t-driver-meta m-0 max-w-[32ch]">Your deliveries will show here as soon as the connection is back.</p>
            </>
          ) : (
            <>
              <h1 className="t-display m-0">No delivery yet</h1>
              <p className="t-driver-meta m-0 max-w-[32ch]">Dispatch will send your next delivery here. You don&apos;t need to refresh.</p>
            </>
          )}
        </div>
      </DriverScreen>
    );
  }

  // Stops only come with the delivery's detail.
  if (!detail) return <DriverScreen notices={false}>{null}</DriverScreen>;

  const started = active.status === 'in_transit';
  const total = stops.length;
  const doneN = stops.filter((s) => s.done).length;
  const next = stops[current];

  return (
    <DriverScreen
      bottom={
        !started ? (
          <HoldToConfirm label="Hold to start delivery" onConfirm={start} />
        ) : next ? (
          <Link href={`/driver/stop/${next.seq}`} role="button" className={primaryCls} style={primaryStyle}>
            Open stop {next.seq}
          </Link>
        ) : null
      }
    >
      <div className="flex flex-col gap-2.5">
        <span className="t-label text-ink-muted">Delivery {active.reference}</span>
        <h1 className="t-display m-0">{started && next ? `Stop ${next.seq} of ${total}` : `${total} stops`}</h1>
        <div role="img" aria-label={`${doneN} of ${total} stops done`} className="grid gap-1" style={{ gridTemplateColumns: `repeat(${total}, 1fr)` }}>
          {stops.map((s, i) => (
            <span
              key={s.seq}
              className="h-2.5 rounded-[2px]"
              style={{
                background: s.done ? 'var(--ink)' : i === current && started ? 'var(--accent)' : 'var(--surface-300)',
                border: s.done || (i === current && started) ? '0' : '1px solid var(--border)',
              }}
            />
          ))}
        </div>
        {!started && <p className="t-driver-meta m-0 text-ink-muted">Start when you leave for the first stop. Dispatch and the customers see the truck move from then.</p>}
      </div>
      <StopList stops={stops} current={started ? current : -1} config={config} pos={gps.pos} time={time} />
    </DriverScreen>
  );
}
