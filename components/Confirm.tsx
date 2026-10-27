'use client';

import { AlertTriangle } from 'lucide-react';
import { useEffect, useRef, useSyncExternalStore } from 'react';

// The app's own "are you sure?", instead of the browser's window.confirm. Call `confirmDialog(...)`
// anywhere and await the answer; <ConfirmHost /> (in app/providers.tsx) draws it. Esc or a click
// outside is Cancel. Destructive questions put the focus on Cancel, so Enter can't remove by accident.

export interface ConfirmOptions {
  title: string;
  body?: string;
  /** The confirm button's words, e.g. "Remove driver". Default "OK". */
  confirm?: string;
  cancel?: string;
  /** Red confirm button, and Cancel gets the focus. */
  danger?: boolean;
}

type Pending = ConfirmOptions & { resolve: (ok: boolean) => void };

let current: Pending | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  current?.resolve(false);
  return new Promise((resolve) => {
    current = { ...opts, resolve };
    emit();
  });
}

function answer(ok: boolean) {
  const c = current;
  current = null;
  emit();
  c?.resolve(ok);
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function ConfirmHost() {
  const c = useSyncExternalStore(subscribe, () => current, () => null);
  const okRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!c) return;
    const back = document.activeElement as HTMLElement | null;
    (c.danger ? cancelRef : okRef).current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        answer(false);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      back?.focus?.();
    };
  }, [c]);

  if (!c) return null;
  return (
    <div
      className="confirm-backdrop fixed inset-0 z-[3000] flex items-center justify-center bg-black/45 p-4"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) answer(false);
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby={c.body ? 'confirm-body' : undefined}
        className="confirm-card w-full max-w-[400px] rounded-[18px] border border-border bg-surface-100 p-5"
      >
        <div className="flex items-start gap-3">
          {c.danger && (
            <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-status-failed-bg text-status-failed">
              <AlertTriangle size={18} strokeWidth={2.2} aria-hidden="true" />
            </span>
          )}
          <div className="min-w-0">
            <h2 id="confirm-title" className="text-[16px] font-semibold text-ink">
              {c.title}
            </h2>
            {c.body && (
              <p id="confirm-body" className="mt-1.5 text-[14px] leading-relaxed text-ink-muted">
                {c.body}
              </p>
            )}
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button ref={cancelRef} type="button" onClick={() => answer(false)} className="min-h-11 rounded-[12px] border border-border bg-surface-100 px-4 text-[14px] font-medium text-ink hover:bg-surface-200">
            {c.cancel ?? 'Cancel'}
          </button>
          <button
            ref={okRef}
            type="button"
            onClick={() => answer(true)}
            className={`min-h-11 rounded-[12px] border-0 px-4 text-[14px] font-semibold hover:opacity-90 ${
              c.danger ? 'bg-status-failed text-white' : 'bg-brand text-brand-ink'
            }`}
          >
            {c.confirm ?? 'OK'}
          </button>
        </div>
      </div>
    </div>
  );
}
