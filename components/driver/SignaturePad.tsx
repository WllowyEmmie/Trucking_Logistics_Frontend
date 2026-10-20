'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * A box to sign in with a finger. Ink is drawn dark on a transparent background and exported as a
 * PNG (a few KB). `onChange(null)` when cleared.
 */
export function SignaturePad({ onChange, label = 'Sign here' }: { onChange: (png: string | null) => void; label?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [empty, setEmpty] = useState(true);

  // Sharp on high-density screens: the bitmap is the box's size times the pixel ratio.
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const r = c.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = Math.round(r.width * dpr);
    c.height = Math.round(r.height * dpr);
    const ctx = c.getContext('2d')!;
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#111';
  }, []);

  const at = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    last.current = at(e);
    const ctx = e.currentTarget.getContext('2d')!;
    ctx.beginPath();
    ctx.arc(last.current.x, last.current.y, 1.2, 0, Math.PI * 2);
    ctx.fillStyle = '#111';
    ctx.fill();
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || !last.current) return;
    const p = at(e);
    const ctx = e.currentTarget.getContext('2d')!;
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
  };
  const up = () => {
    if (!drawing.current) return;
    drawing.current = false;
    last.current = null;
    setEmpty(false);
    onChange(canvas.current!.toDataURL('image/png'));
  };
  const clear = () => {
    const c = canvas.current!;
    c.getContext('2d')!.clearRect(0, 0, c.width, c.height);
    setEmpty(true);
    onChange(null);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <canvas
          ref={canvas}
          aria-label={`${label}: draw a signature with your finger`}
          role="img"
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          className="block h-44 w-full touch-none rounded-lg border-2 border-ink bg-white"
        />
        {empty && (
          <span className="t-driver-meta pointer-events-none absolute inset-0 flex items-center justify-center text-[#777]">{label}</span>
        )}
        <span aria-hidden="true" className="pointer-events-none absolute right-6 bottom-8 left-6 border-b border-dashed border-[#999]" />
      </div>
      {!empty && (
        <button type="button" onClick={clear} className="t-driver-meta min-h-12 self-start rounded-lg border-2 border-border bg-surface-100 px-4 font-bold text-ink">
          Clear and sign again
        </button>
      )}
    </div>
  );
}
