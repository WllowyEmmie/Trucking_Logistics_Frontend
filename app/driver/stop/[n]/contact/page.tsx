'use client';

import { ArrowLeft, Phone } from 'lucide-react';
import Link from 'next/link';
import { DriverScreen } from '@/components/driver/DriverScreen';
import { primaryCls, primaryStyle, rowCls, smsHref, telHref, topBtnCls } from '@/components/driver/ui';
import { useStop } from '@/components/driver/useStop';

/** Fixed list: no typing while driving. */
const MESSAGES = ['On my way — about 10 minutes', "I've arrived at the gate", "I can't find the entrance", 'Running late — new time on the tracking link'];

// Contact client: calling is the one primary action; quick messages are one-tap SMS.
// TODO(stop-contacts): stop contacts are stored on create but not returned, so this uses the
// delivery's customer phone for every drop-off.
export default function ContactPage() {
  const { delivery, detail, stop, config, time, progressFor, markMessage } = useStop();

  const back = stop && (
    <Link href={`/driver/stop/${stop.seq}`} className={`${topBtnCls} border-border`} style={{ color: 'var(--ink)' }}>
      <ArrowLeft size={22} strokeWidth={2.5} aria-hidden="true" />
      Stop {stop.seq}
    </Link>
  );
  if (!delivery || !stop) return <DriverScreen top={back}>{null}</DriverScreen>;

  const pickup = stop.kind === 'pickup';
  const who = delivery.customer_name;
  // The customer phone is for drop-offs; at the pickup, dispatch is who to call.
  const phone = pickup ? null : (detail?.delivery.customer_phone ?? null);
  const dispatch = config.dispatch_phone || null;
  const sent = progressFor(delivery.id).msgs[stop.seq] ?? {};

  return (
    <DriverScreen
      top={back}
      bottom={
        phone ? (
          <a href={telHref(phone)} role="button" className={primaryCls} style={primaryStyle}>
            <Phone size={24} strokeWidth={2.5} aria-hidden="true" />
            Call {who}
          </a>
        ) : dispatch ? (
          <a href={telHref(dispatch)} role="button" className={primaryCls} style={primaryStyle}>
            <Phone size={24} strokeWidth={2.5} aria-hidden="true" />
            Call dispatch
          </a>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-1">
        <span className="t-label text-ink-muted">{pickup ? 'Pickup for' : 'Deliver to'}</span>
        <h1 className="t-display m-0">{who}</h1>
        <span className="t-driver-meta text-ink-muted">{phone ?? (pickup ? 'Call dispatch about the pickup.' : 'No number on file. Call dispatch.')}</span>
      </div>

      {phone && (
        <div className="flex flex-col gap-2">
          <span className="t-label text-ink-muted">Quick message</span>
          {MESSAGES.map((text, i) => {
            const at = sent[i];
            return at ? (
              <div key={text} aria-disabled="true" className={`${rowCls} border-status-completed bg-status-completed-bg text-ink`}>
                <span>{text}</span>
                <span className="t-driver-meta flex-none text-status-completed">Sent {time(at)}</span>
              </div>
            ) : (
              <a
                key={text}
                href={smsHref(phone, text)}
                role="button"
                onClick={() => markMessage(stop.seq, i)}
                className={`${rowCls} border-ink bg-surface-100`}
                style={{ color: 'var(--ink)' }}
              >
                <span>{text}</span>
                <span className="t-driver-meta flex-none text-ink-muted">Send</span>
              </a>
            );
          })}
        </div>
      )}

      {phone && dispatch && (
        <div className="flex flex-col gap-2 border-t border-divider pt-3">
          <span className="t-label text-ink-muted">No answer?</span>
          <a href={telHref(dispatch)} role="button" className={`${rowCls} border-border`} style={{ color: 'var(--ink)' }}>
            <span>Call dispatch</span>
            <span className="font-medium text-ink-muted">{config.operator_name}</span>
          </a>
        </div>
      )}
    </DriverScreen>
  );
}
