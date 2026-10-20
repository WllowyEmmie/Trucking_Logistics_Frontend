'use client';

import { Check, Copy, MessageCircle, MessageSquare } from 'lucide-react';
import { useState } from 'react';
import { useConfig } from '@/lib/config';

/** "482 910": easier to read out over the phone. */
const spaced = (pin: string) => (pin.length === 6 ? `${pin.slice(0, 3)} ${pin.slice(3)}` : pin);

const btn =
  'inline-flex min-h-11 items-center gap-2 rounded-md border border-border bg-surface-100 px-3 text-[13px] font-semibold text-ink no-underline hover:bg-surface-200';

/**
 * A PIN the server just generated, shown once: only its hash is stored, so it can't be looked up
 * later. Copy it, or open a text or WhatsApp message to the driver with it filled in.
 */
export function PinReveal({ pin, name, phone, onDone }: { pin: string; name: string; phone: string; onDone: () => void }) {
  const config = useConfig();
  const [copied, setCopied] = useState(false);
  const digits = phone.replace(/[^\d+]/g, '');
  const appUrl = typeof window !== 'undefined' ? `${window.location.origin}/driver` : '/driver';
  const message = `${config.operator_name} driver app: open ${appUrl} and sign in with your phone number and PIN ${pin}. Don't share this PIN.`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(pin);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: the PIN is on screen to read out.
    }
  }

  return (
    <div role="status" className="flex flex-col gap-3 rounded-lg border-2 border-status-completed bg-status-completed-bg p-4">
      <div className="flex flex-col gap-0.5">
        <span className="t-label text-ink-muted">App PIN for {name}</span>
        <span className="font-mono text-[32px] leading-10 font-bold tracking-[0.12em] text-ink" aria-label={`PIN ${pin.split('').join(' ')}`}>
          {spaced(pin)}
        </span>
        <span className="t-body-sm text-ink">
          Shown this once. Send it to the driver now; generating a new one stops this one working.
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => void copy()} className={btn}>
          {copied ? <Check size={16} strokeWidth={2.5} aria-hidden="true" /> : <Copy size={16} strokeWidth={2.25} aria-hidden="true" />}
          {copied ? 'Copied' : 'Copy PIN'}
        </button>
        <a href={`sms:${digits}?&body=${encodeURIComponent(message)}`} className={btn} style={{ color: 'var(--ink)' }}>
          <MessageSquare size={16} strokeWidth={2.25} aria-hidden="true" />
          Text it
        </a>
        <a
          href={`https://wa.me/${digits.replace('+', '')}?text=${encodeURIComponent(message)}`}
          target="_blank"
          rel="noreferrer"
          className={btn}
          style={{ color: 'var(--ink)' }}
        >
          <MessageCircle size={16} strokeWidth={2.25} aria-hidden="true" />
          WhatsApp
        </a>
        <button type="button" onClick={onDone} className={`${btn} ms-auto`}>
          Done
        </button>
      </div>
    </div>
  );
}
