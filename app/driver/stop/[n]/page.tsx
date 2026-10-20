'use client';

import { ArrowLeft, Navigation, Phone, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { DriverScreen } from '@/components/driver/DriverScreen';
import { HoldToConfirm } from '@/components/driver/HoldToConfirm';
import { navHref, primaryCls, primaryStyle, secondaryCls, secondaryStyle, topBtnCls } from '@/components/driver/ui';
import { kindLabel, useStop } from '@/components/driver/useStop';
import { SignaturePad } from '@/components/driver/SignaturePad';
import { shrinkPhoto } from '@/lib/image';
import { StatusPill } from '@/components/StatusPill';

// Current stop: arrive → complete by press-and-hold. Every drop-off collects proof of delivery
// first: who received it, their signature, and a photo (Settings decides which are required).
export default function StopPage() {
  const router = useRouter();
  const { delivery, detail, stop, index, isCurrent, total, stops, current, time, arrive, completeStop, completeDelivery, submitProof, config, loading } = useStop();
  // Proof of delivery, at every drop-off: who received it, their signature, a photo.
  const [podName, setPodName] = useState('');
  const [signature, setSignature] = useState<string | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoNote, setPhotoNote] = useState<string | null>(null);
  // The page stays mounted from one stop to the next: start each drop-off's proof empty.
  const seqNow = stop?.seq;
  useEffect(() => {
    setPodName('');
    setSignature(null);
    setPhoto(null);
    setPhotoNote(null);
  }, [seqNow]);

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
  } else if (!pickup) {
    // A drop-off: proof first, then hold.
    const missing = [
      !podName.trim() && 'who received it',
      config.pod_signature_required && !signature && 'their signature',
      config.pod_photo_required && !photo && 'a photo',
    ].filter(Boolean) as string[];
    bottom = (
      <HoldToConfirm
        label={isLast ? 'Hold to complete delivery' : 'Hold to complete stop'}
        disabled={missing.length > 0}
        hint={missing.length ? `Add ${missing.join(' and ')} first` : 'Hold for about a second'}
        onConfirm={() => {
          submitProof(stop.seq, { receiverName: podName.trim(), signature, photo });
          if (isLast) {
            completeDelivery();
            router.push('/driver/done');
          } else completeStop(stop.seq);
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

  const showPod = started && isCurrent && arrived && !pickup;

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
          <label className="flex flex-col gap-2">
            <span className="t-driver-action">Who received it?</span>
            <input
              value={podName}
              onChange={(e) => setPodName(e.target.value)}
              autoComplete="off"
              maxLength={100}
              placeholder="Name"
              className="min-h-16 rounded-lg border-2 border-ink bg-surface-100 px-4 text-[20px] font-medium text-ink"
            />
          </label>
          <div className="flex flex-col gap-2">
            <span className="t-driver-action">
              Their signature
              {!config.pod_signature_required && <span className="t-driver-meta ms-2 font-normal text-ink-muted">optional</span>}
            </span>
            <span className="t-driver-meta text-ink-muted">Ask them to check the goods before they sign.</span>
            <SignaturePad key={stop.seq} onChange={setSignature} label="Receiver signs here" />
          </div>
          {photo ? (
            <button
              type="button"
              onClick={() => setPhoto(null)}
              className="t-driver-action flex min-h-16 items-center justify-between gap-3 rounded-lg border-2 border-status-completed bg-status-completed-bg px-4 text-start text-ink"
            >
              <span className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo} alt="" className="h-11 w-11 rounded object-cover" />
                Photo added
              </span>
              <span className="t-driver-meta text-ink-muted">Tap to remove</span>
            </button>
          ) : (
            <label className="t-driver-action flex min-h-16 cursor-pointer items-center justify-between gap-3 rounded-lg border-2 border-border bg-surface-100 px-4 text-ink focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--focus-ring)]">
              <span>Add a photo</span>
              <span className="t-driver-meta text-ink-muted">{photoNote ?? (config.pod_photo_required ? 'Required' : 'Optional')}</span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (!f) return;
                  setPhotoNote('Preparing…');
                  shrinkPhoto(f)
                    .then((url) => {
                      setPhoto(url);
                      setPhotoNote(null);
                    })
                    .catch((err: Error) => setPhotoNote(err.message));
                }}
              />
            </label>
          )}
        </>
      ) : (
        <>
          <div className="flex flex-col gap-1">
            <span className="t-label text-ink-muted">Delivery for</span>
            <span className="t-driver-meta font-bold">{delivery.customer_name}</span>
          </div>
          {stop.contactPhone && (
            <div className="flex flex-col gap-1">
              <span className="t-label text-ink-muted">Site contact</span>
              <span className="t-driver-meta font-bold">{stop.contactName ?? stop.contactPhone}</span>
            </div>
          )}
          {detail?.delivery.goods_desc && (
            <div className="flex flex-col gap-1">
              <span className="t-label text-ink-muted">Goods</span>
              <span className="t-driver-meta">{detail.delivery.goods_desc}</span>
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
