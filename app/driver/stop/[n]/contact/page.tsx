'use client';

import { ArrowLeft, Phone } from 'lucide-react';
import Link from 'next/link';
import { DriverScreen } from '@/components/driver/DriverScreen';
import { primaryCls, primaryStyle, rowCls, smsHref, telHref, topBtnCls } from '@/components/driver/ui';
import { splitContact, useStop } from '@/components/driver/useStop';

/** Fixed list: no typing while driving. */
const MESSAGES = ['On my way — about 10 minutes', "I've arrived at the gate", "I can't find the entrance", 'Running late — new time on the tracking link'];

// Contact client: calling is the one primary action; quick messages are one-tap SMS.
export default function ContactPage() {
  const { delivery, stop, config, time, progressFor, markMessage } = useStop();

  const back = stop && (
    <Link href={`/driver/stop/${stop.seq}`} className={`${topBtnCls} border-border`} style={{ color: 'var(--ink)' }}>
      <ArrowLeft size={22} strokeWidth={2.5} aria-hidden="true" />
      Stop {stop.seq}
    </Link>
  );
  if (!delivery || !stop) return <DriverScreen top={back}>{null}</DriverScreen>;

  const [name, role] = splitContact(stop.contact_name);
  const who = name ?? delivery.customer_name;
  const phone = stop.contact_phone;
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
        ) : (
          <a href={telHref(config.dispatch_phone)} role="button" className={primaryCls} style={primaryStyle}>
            <Phone size={24} strokeWidth={2.5} aria-hidden="true" />
            Call dispatch
          </a>
        )
      }
    >
      <div className="flex flex-col gap-1">
        <span className="t-label text-ink-muted">{stop.kind === 'pickup' ? 'Collect from' : 'Deliver to'}</span>
        <h1 className="t-display m-0">{who}</h1>
        {/* Only the contact's role: delivery.customer_name is the booking customer, not necessarily this stop's. */}
        {role && <span className="t-driver-meta">{role[0]!.toUpperCase() + role.slice(1)}</span>}
        <span className="t-driver-meta text-ink-muted">{phone ?? 'No number on file. Call dispatch.'}</span>
      </div>

      {phone && (
        <div className="flex flex-col gap-2">
          <span className="t-label text-ink-muted">Quick message</span>
          {MESSAGES.map((text, i) => {
            const at = sent[i];
            return at ? (
              <div
                key={text}
                aria-disabled="true"
                className={`${rowCls} border-status-completed bg-status-completed-bg text-ink`}
              >
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

      <div className="flex flex-col gap-2 border-t border-divider pt-3">
        <span className="t-label text-ink-muted">No answer?</span>
        {stop.alt_phone && (
          <a href={telHref(stop.alt_phone)} role="button" className={`${rowCls} border-border`} style={{ color: 'var(--ink)' }}>
            <span>Call site reception</span>
            <span className="font-medium text-ink-muted">Alternative contact</span>
          </a>
        )}
        <a href={telHref(config.dispatch_phone)} role="button" className={`${rowCls} border-border`} style={{ color: 'var(--ink)' }}>
          <span>Call dispatch</span>
          <span className="font-medium text-ink-muted">{config.operator_name}</span>
        </a>
      </div>
    </DriverScreen>
  );
}
