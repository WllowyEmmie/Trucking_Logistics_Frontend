'use client';

import { X } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';

/** A panel that slides in on the right over the page (Fleet and Drivers details, add and edit forms).
 *  Escape or a click outside closes it. */
export function SidePanel({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[2500] flex justify-end bg-black/30" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        role="dialog"
        aria-label={title}
        className="m-3 flex w-[min(480px,calc(100vw-24px))] flex-col overflow-hidden rounded-[22px] border border-border bg-surface-100 text-ink"
        style={{ boxShadow: '0 24px 60px rgb(0 0 0 / 0.28)' }}
      >
        <div className="flex items-center justify-between gap-2 border-b border-divider px-5 py-4">
          <span className="text-[16px] font-semibold">{title}</span>
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-lg border-0 bg-transparent text-ink hover:bg-surface-200" style={{ minHeight: 32, minWidth: 32 }}>
            <X size={16} aria-hidden="true" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
