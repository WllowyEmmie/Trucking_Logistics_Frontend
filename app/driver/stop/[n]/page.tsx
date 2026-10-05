'use client';

import { ArrowLeft, Navigation, Phone, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { DriverScreen } from '@/components/driver/DriverScreen';
import { HoldToConfirm } from '@/components/driver/HoldToConfirm';
import { navHref, primaryCls, primaryStyle, secondaryCls, secondaryStyle, topBtnCls } from '@/components/driver/ui';
import { kindLabel, useStop } from '@/components/driver/useStop';
import { StatusPill } from '@/components/StatusPill';

// Current stop: arrive → complete by press-and-hold. The last drop-off asks who received it.
export default function StopPage() {
  const router = useRouter();
  const { delivery, stop, index, isCurrent, total, stops, current, time, arrive, completeStop, completeDelivery, loading } = useStop();
  const [podName, setPodName] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);

  const back = (
    <Link href="/driver" className={`${topBtnCls} border-border`} style={{ color: 'var(--ink)' }}>
      <ArrowLeft size={22} strokeWidth={2.5} aria-hidden="true" />
      All stops
    </Link>
  );

  if (!delivery || !stop) {
    return (
      <DriverScreen top={back}>
        {!loading && (
          <div className="flex flex-col gap-3 pt-2">
            <h1 className="t-display m-0">This stop isn&apos;t on your delivery</h1>
            <p className="t-driver-meta m-0">Go back to Today to see your stops.</p>
          </div>
        )}
      </DriverScreen>
    );
  }

  const started = delivery.status === 'in_transit';
  const isLast = index === total - 1;
  const arrived = !!stop.arrivedAt && !stop.done;
  const notSent = stop.unsent ? ' · not sent' : '';
  const pill = stop.done
    ? { status: 'completed' as const, label: `Completed${stop.doneAt ? ` ${time(stop.doneAt)}` : ''}${notSent}` }
    : arrived
      ? { status: 'in_transit' as const, label: `Arrived ${time(stop.arrivedAt!)}${notSent}` }
      : null;
  const next = stops[index + 1];
  const curStop = stops[current];
  const pickup = stop.kind === 'pickup';

  let bottom;
  if (!started && delivery.status === 'assigned') {
    bottom = (
      <>
        <Link href="/driver" role="button" className={primaryCls} style={primaryStyle}>
          Back to today
        </Link>
        <span className="t-driver-meta text-center text-ink-muted">Start the delivery from Today first</span>
      </>
    );
  } else if (!started) {
    bottom = (
      <Link href="/driver/done" role="button" className={primaryCls} style={primaryStyle}>
        See summary
      </Link>
    );
  } else if (stop.done) {
    bottom = (
      <>
        <Link href={next ? `/driver/stop/${next.seq}` : '/driver'} role="button" className={primaryCls} style={primaryStyle}>
          {next ? `Next: stop ${next.seq}` : 'All stops'}
        </Link>
        <span className="t-driver-meta text-center text-ink-muted">
          Stop {stop.seq} completed{stop.doneAt ? ` at ${time(stop.doneAt)}` : ''}
        </span>
      </>
    );
  } else if (!isCurrent && curStop) {
    bottom = (
      <>
        <Link href={`/driver/stop/${curStop.seq}`} role="button" className={primaryCls} style={primaryStyle}>
          Open stop {curStop.seq}
        </Link>
        <span className="t-driver-meta text-center text-ink-muted">Stop {curStop.seq} comes first</span>
      </>
    );
  } else if (!arrived) {
    bottom = <HoldToConfirm label="Hold to confirm arrival" onConfirm={() => arrive(stop.seq)} />;
  } else if (isLast) {
    const named = podName.trim().length > 0;
    bottom = (
      <HoldToConfirm
        label="Hold to complete delivery"
        disabled={!named}
        hint={named ? 'Hold for about a second' : 'Enter who received it first'}
        onConfirm={() => {
          completeDelivery(podName.trim());
          router.push('/driver/done');
        }}
      />
    );
  } else {
    bottom = (
      <HoldToConfirm
        label="Hold to complete stop"
        hint={`Arrived ${time(stop.arrivedAt!)} — hold again when ${pickup ? 'loaded' : 'unloaded'}`}
        onConfirm={() => completeStop(stop.seq)}
      />
    );
  }

  const showPod = started && isCurrent && isLast && arrived;

  return (
    <DriverScreen
      top={
        <>
          {back}
          {started && !stop.done && (
            <Link
              href={`/driver/stop/${stop.seq}/problem`}
              className={`${topBtnCls} border-status-failed`}
              style={{ color: 'var(--status-failed)' }}
            >
              <TriangleAlert size={22} strokeWidth={2.5} aria-hidden="true" />
              Problem
            </Link>
          )}
        </>
      }
      bottom={bottom}
    >
      <div className="flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="t-label text-ink-muted">
            Stop {stop.seq} of {total} · {isLast && !pickup ? 'Last drop-off' : kindLabel(stop.kind)}
          </span>
          {pill && <StatusPill status={pill.status} label={pill.label} size="md" />}
        </div>
        <h1 className={`${showPod ? 'text-[20px] leading-[26px] font-bold' : 't-driver-address'} wrap-anywhere m-0`}>{stop.address}</h1>
      </div>

      {showPod ? (
        <>
          {/* TODO(pod-api): the name and photo need a proof-of-delivery field on POST /complete; not sent yet. */}
          <label className="flex flex-col gap-2">
            <span className="t-driver-action">Who received it?</span>
            <input
              value={podName}
              onChange={(e) => setPodName(e.target.value)}
              autoComplete="off"
              placeholder="Name"
              className="min-h-16 rounded-lg border-2 border-ink bg-surface-100 px-4 text-[20px] font-medium text-ink"
            />
          </label>
          {photo ? (
            <button
              type="button"
              onClick={() => setPhoto(null)}
              className="t-driver-action flex min-h-16 items-center justify-between gap-3 rounded-lg border-2 border-status-completed bg-status-completed-bg px-4 text-start text-ink"
            >
              <span>Photo added</span>
              <span className="t-driver-meta text-ink-muted">Tap to remove</span>
            </button>
          ) : (
            <label className="t-driver-action flex min-h-16 cursor-pointer items-center justify-between gap-3 rounded-lg border-2 border-border bg-surface-100 px-4 text-ink focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--focus-ring)]">
              <span>Add a photo</span>
              <span className="t-driver-meta text-ink-muted">Optional</span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
              />
            </label>
          )}
        </>
      ) : (
        <>
          {stop.contact_name && (
            <div className="flex flex-col gap-1">
              <span className="t-label text-ink-muted">{pickup ? 'Collect from' : 'Deliver to'}</span>
              <span className="t-driver-meta font-bold">{stop.contact_name}</span>
            </div>
          )}
          {stop.notes && (
            <div className="flex flex-col gap-1">
              <span className="t-label text-ink-muted">From dispatch</span>
              <span className="t-driver-meta">{stop.notes}</span>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <Link href={`/driver/stop/${stop.seq}/contact`} role="button" className={secondaryCls} style={secondaryStyle}>
              <Phone size={24} strokeWidth={2.5} aria-hidden="true" />
              Call
            </Link>
            <a href={navHref(stop.lat, stop.lng, stop.address)} role="button" className={secondaryCls} style={secondaryStyle}>
              <Navigation size={24} strokeWidth={2.5} aria-hidden="true" />
              Navigate
            </a>
          </div>
        </>
      )}
    </DriverScreen>
  );
}
