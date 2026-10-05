'use client';

import { useEffect, useId, useRef, useState } from 'react';

const HOLD_MS = 800;

interface Props {
  label: string;
  onConfirm: () => void;
  disabled?: boolean;
  /** Shown under the bar before a hold. */
  hint?: string;
}

/**
 * The only confirm control in the driver app. Press and hold for 800ms: the fill grows from the
 * inline-start edge, the label changes, and the phone vibrates 40ms on completion. Releasing early
 * resets with a 200ms ease-out. Space or Enter held works the same way (screen readers pass a
 * double-tap-and-hold through as a long press).
 */
export function HoldToConfirm({ label, onConfirm, disabled, hint = 'Hold for about a second' }: Props) {
  const [prog, setProg] = useState(0);
  const [holding, setHolding] = useState(false);
  const [early, setEarly] = useState(false);
  const raf = useRef<number | null>(null);
  const t0 = useRef(0);
  const confirmRef = useRef(onConfirm);
  confirmRef.current = onConfirm;
  const hintId = useId();

  useEffect(() => () => void (raf.current != null && cancelAnimationFrame(raf.current)), []);
  // A new label means a new step: forget the last early release.
  useEffect(() => setEarly(false), [label]);

  function begin() {
    if (disabled || raf.current != null) return;
    t0.current = performance.now();
    setEarly(false);
    setHolding(true);
    const tick = () => {
      const p = Math.min(1, (performance.now() - t0.current) / HOLD_MS);
      setProg(p);
      if (p >= 1) {
        raf.current = null;
        setHolding(false);
        setProg(0);
        try {
          navigator.vibrate?.(40);
        } catch {
          // Not supported (iOS): the label change is the feedback.
        }
        confirmRef.current();
        return;
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  }

  function end() {
    if (raf.current == null) return;
    cancelAnimationFrame(raf.current);
    raf.current = null;
    setHolding(false);
    setProg(0);
    setEarly(true);
  }

  const isKey = (k: string) => k === ' ' || k === 'Enter';

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        disabled={disabled}
        aria-label={`${label}. Press and hold.`}
        aria-describedby={hintId}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            // Synthetic events have no capturable pointer.
          }
          begin();
        }}
        onPointerUp={end}
        onPointerCancel={end}
        onKeyDown={(e) => {
          if (!isKey(e.key)) return;
          e.preventDefault();
          if (!e.repeat) begin();
        }}
        onKeyUp={(e) => {
          if (!isKey(e.key)) return;
          e.preventDefault();
          end();
        }}
        onBlur={end}
        onContextMenu={(e) => e.preventDefault()}
        className="relative min-h-[76px] w-full overflow-hidden rounded-lg border-0 bg-ink p-0 select-none disabled:cursor-not-allowed disabled:opacity-45"
        style={{ touchAction: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none' }}
      >
        <span
          aria-hidden="true"
          className="absolute inset-y-0 start-0 bg-accent"
          style={{ width: `${prog * 100}%`, transition: holding ? 'none' : 'width 200ms ease-out' }}
        />
        <span className="t-driver-action relative flex items-center justify-center gap-3 px-4 text-surface-100">
          {holding ? 'Keep holding…' : label}
        </span>
      </button>
      <span id={hintId} role={early ? 'status' : undefined} className="t-driver-meta text-center" style={{ color: early ? 'var(--ink)' : 'var(--ink-muted)' }}>
        {early ? 'Keep holding until the bar fills' : hint}
      </span>
    </div>
  );
}
