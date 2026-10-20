'use client';

import { ChevronDown, LogOut, Settings } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';
import { useSignedInAs } from './Gate';
import { SignOutButton } from './SignOut';

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('') || '?';

const item =
  't-body-sm flex min-h-11 w-full items-center gap-2.5 rounded-md border-0 bg-transparent px-2.5 text-start font-semibold no-underline hover:bg-surface-200 focus-visible:bg-surface-200';

/**
 * The signed-in dispatcher, as an avatar at the end of the header. Opens a small menu with who
 * you are, Settings and Sign out, the way most web apps do it, so the header stays quiet.
 */
export function AccountMenu() {
  const me = useSignedInAs();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  // Close on a click outside or Escape; Escape hands focus back to the avatar.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    root.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={root} className="relative">
      <button
        ref={button}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={`Account: ${me.name}`}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-11 items-center gap-1.5 rounded-full border border-transparent bg-transparent ps-1 pe-2 text-ink hover:border-border hover:bg-surface-200"
      >
        <span
          aria-hidden="true"
          className="flex h-8 w-8 items-center justify-center rounded-full bg-ink text-[13px] font-bold"
          style={{ color: 'var(--surface-100)' }}
        >
          {initials(me.name)}
        </span>
        <ChevronDown size={16} strokeWidth={2.5} aria-hidden="true" style={{ transform: open ? 'rotate(180deg)' : 'none' }} />
      </button>

      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label="Account"
          className="menu-surface absolute end-0 top-full z-[1100] mt-2 flex w-64 flex-col gap-0.5 p-1.5"
        >
          <div className="flex items-center gap-2.5 px-2.5 pt-1.5 pb-2.5">
            <span
              aria-hidden="true"
              className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-ink text-[13px] font-bold"
              style={{ color: 'var(--surface-100)' }}
            >
              {initials(me.name)}
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="t-body-sm truncate font-bold">{me.name}</span>
              {me.email && <span className="t-body-sm truncate text-ink-muted">{me.email}</span>}
            </span>
          </div>
          <div aria-hidden="true" className="mx-1 border-t border-divider" />
          <Link href="/console/settings" role="menuitem" onClick={() => setOpen(false)} className={item} style={{ color: 'var(--ink)' }}>
            <Settings size={16} strokeWidth={2.25} aria-hidden="true" />
            Settings
          </Link>
          <SignOutButton role="menuitem" className={`${item} text-ink`}>
            <LogOut size={16} strokeWidth={2.25} aria-hidden="true" />
          </SignOutButton>
        </div>
      )}
    </div>
  );
}
