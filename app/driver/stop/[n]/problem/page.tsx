'use client';

import { X } from 'lucide-react';
import Link from 'next/link';
import { useRef, useState, type KeyboardEvent } from 'react';
import { DriverScreen } from '@/components/driver/DriverScreen';
import { primaryCls, primaryStyle, secondaryCls, secondaryStyle, topBtnCls } from '@/components/driver/ui';
import { splitContact, useStop } from '@/components/driver/useStop';
import { FAIL_REASONS } from '@/lib/labels';
import type { FailReason } from '@/lib/types';

// Report a problem: a fixed list, no free text. Sent as POST /deliveries/{id}/fail {reason}.
export default function ProblemPage() {
  const { delivery, stop, fail } = useStop();
  const [reason, setReason] = useState<FailReason | null>(null);
  const [sent, setSent] = useState(false);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const cancel = stop && !sent && (
    <Link href={`/driver/stop/${stop.seq}`} className={`${topBtnCls} border-border`} style={{ color: 'var(--ink)' }}>
      <X size={22} strokeWidth={2.5} aria-hidden="true" />
      Cancel
    </Link>
  );
  if (!delivery || !stop) return <DriverScreen top={cancel}>{null}</DriverScreen>;

  // Radio group keyboard model: arrows move and select.
  function onKey(e: KeyboardEvent, i: number) {
    const d = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0;
    if (!d || sent) return;
    e.preventDefault();
    const j = (i + d + FAIL_REASONS.length) % FAIL_REASONS.length;
    setReason(FAIL_REASONS[j]!.key);
    refs.current[j]?.focus();
  }
  const focusable = reason ? FAIL_REASONS.findIndex((r) => r.key === reason) : 0;

  return (
    <DriverScreen
      top={cancel}
      bottom={
        <>
          <button
            type="button"
            disabled={!reason || sent}
            onClick={() => {
              if (!reason) return;
              fail(reason);
              setSent(true);
            }}
            className={primaryCls}
            style={primaryStyle}
          >
            {sent ? 'Sent — dispatch will call' : 'Send report'}
          </button>
          {sent ? (
            <Link href="/driver/done" role="button" className={secondaryCls} style={secondaryStyle}>
              See delivery summary
            </Link>
          ) : (
            <span className="t-driver-meta text-center text-ink-muted">Dispatch calls you back after you send</span>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-1">
        <h1 className="t-display m-0">What&apos;s wrong?</h1>
        <span className="t-driver-meta text-ink-muted">
          Stop {stop.seq} · {splitContact(stop.contact_name)[0] ?? delivery.customer_name}
        </span>
      </div>
      <div role="radiogroup" aria-label="Problem" className="flex flex-col gap-2">
        {FAIL_REASONS.map((r, i) => {
          const on = reason === r.key;
          return (
            <button
              key={r.key}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={i === focusable ? 0 : -1}
              disabled={sent}
              onClick={() => setReason(r.key)}
              onKeyDown={(e) => onKey(e, i)}
              className="t-driver-action flex min-h-16 items-center gap-3.5 rounded-lg px-4 text-start text-ink disabled:opacity-60"
              style={{ border: on ? '3px solid var(--ink)' : '2px solid var(--border)', background: on ? 'var(--surface-300)' : 'var(--surface-100)' }}
            >
              <span aria-hidden="true" className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full border-[3px] border-ink">
                <span className="h-3 w-3 rounded-full" style={{ background: on ? 'var(--ink)' : 'transparent' }} />
              </span>
              {r.label}
            </button>
          );
        })}
      </div>
      {reason === 'accident' && (
        <p className="t-driver-meta m-0 rounded-md border border-status-failed bg-status-failed-bg px-3.5 py-3 text-ink">
          If anyone is hurt, call emergency services first. Then send this.
        </p>
      )}
    </DriverScreen>
  );
}
