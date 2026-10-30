'use client';

import { X } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

/**
 * A small floating card next to the button that opened it (like the card over the map): settings,
 * PIN, add forms. Escape or a click outside closes it.
 */
export function FloatCard({
  anchor,
  title,
  onClose,
  width = 340,
  place = 'below',
  children,
}: {
  anchor: DOMRect | null;
  title: string;
  onClose: () => void;
  width?: number;
  /** below: under the button. beside: just right of `anchor` (a whole pane), at its bottom. */
  place?: 'below' | 'beside';
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  // Under the button, right edges lined up; kept on screen, and above the button if it won't fit below.
  // Measured again whenever the card's own size changes (a form swapping to a taller result, say),
  // not only when the parent re-renders: otherwise a taller card hangs off the bottom until then.
  useLayoutEffect(() => {
    const place_ = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const w = Math.min(width, vw - 24);
      const h = ref.current?.offsetHeight ?? 300;
      const r = anchor ?? new DOMRect(vw / 2, 80, 0, 0);
      let next: { top: number; left: number };
      if (place === 'beside') {
        next = { left: Math.max(12, Math.min(r.right + 12, vw - w - 12)), top: Math.max(12, Math.min(r.bottom - h, vh - h - 12)) };
      } else {
        const left = Math.max(12, Math.min(r.right - w, vw - w - 12));
        let top = r.bottom + 8;
        if (top + h > vh - 12) top = Math.max(12, r.top - h - 8);
        next = { top, left };
      }
      setPos((p) => (p && p.top === next.top && p.left === next.left ? p : next));
    };
    place_();
    const el = ref.current;
    const ro = el ? new ResizeObserver(place_) : null;
    if (el) ro!.observe(el);
    window.addEventListener('resize', place_);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', place_);
    };
  }, [anchor, width, place]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      // A click in the confirm dialog it opened isn't a click away from it.
      if ((t as Element | null)?.closest?.('.confirm-backdrop')) return;
      if (ref.current && !ref.current.contains(t)) onClose();
    };
    window.addEventListener('keydown', onKey);
    // Next tick: the click that opened it mustn't close it.
    const id = setTimeout(() => document.addEventListener('pointerdown', onDown), 0);
    return () => {
      clearTimeout(id);
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={title}
      className="fixed z-[2500] flex max-h-[min(70vh,560px)] flex-col overflow-hidden rounded-[18px] border border-divider bg-surface-100 text-ink"
      style={{ width: `min(${width}px, calc(100vw - 24px))`, top: pos?.top ?? -9999, left: pos?.left ?? -9999, boxShadow: '0 18px 44px rgb(0 0 0 / 0.22)' }}
    >
      <div className="flex items-center justify-between gap-2 border-b border-divider px-4 py-3">
        <span className="truncate text-[13.5px] font-semibold">{title}</span>
        <button type="button" onClick={onClose} aria-label="Close" className="grid h-7 w-7 place-items-center rounded-lg border-0 bg-transparent text-ink hover:bg-surface-200" style={{ minHeight: 28, minWidth: 28 }}>
          <X size={15} strokeWidth={2.2} aria-hidden="true" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}
