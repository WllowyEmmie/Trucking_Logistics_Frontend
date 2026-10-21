'use client';

import { Mail, Phone, Truck } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { telHref } from '@/components/tracking/TrackingPhone';
import { useConfig } from '@/lib/config';

/** Header and footer for the public pages: home, booking, terms. Same tokens as the console. */
export function SiteShell({ children }: { children: ReactNode }) {
  const c = useConfig();
  return (
    <div className="flex min-h-dvh flex-col bg-surface-100 text-ink">
      <header className="sticky top-0 z-10 border-b border-divider bg-surface-100/95 backdrop-blur">
        <div className="mx-auto flex min-h-16 w-full max-w-[1120px] items-center justify-between gap-4 px-4">
          <Link href="/" className="flex items-center gap-2.5 text-ink no-underline">
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-ink text-surface-100">
              <Truck size={19} strokeWidth={2.25} aria-hidden="true" />
            </span>
            <span className="t-h2">{c.operator_name}</span>
          </Link>
          <nav aria-label="Site" className="flex items-center gap-1 sm:gap-2">
            <a href="/#how" className="hidden rounded-md px-3 py-2 text-[14px] font-semibold text-ink-muted no-underline hover:text-ink md:inline">
              How it works
            </a>
            <a href="/#pricing" className="hidden rounded-md px-3 py-2 text-[14px] font-semibold text-ink-muted no-underline hover:text-ink md:inline">
              Pricing
            </a>
            <a href="/#contact" className="hidden rounded-md px-3 py-2 text-[14px] font-semibold text-ink-muted no-underline hover:text-ink sm:inline">
              Contact
            </a>
            <Link
              href="/book"
              className="inline-flex min-h-10 items-center rounded-md bg-ink px-3.5 text-[14px] font-semibold text-surface-100 no-underline"
            >
              Request a delivery
            </Link>
          </nav>
        </div>
      </header>
      <div className="flex-1">{children}</div>
      <footer className="border-t border-divider">
        <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-6 px-4 py-10 md:flex-row md:justify-between">
          <div className="flex flex-col gap-2">
            <span className="t-h2">{c.operator_name}</span>
            <span className="t-body-sm max-w-[42ch] text-ink-muted">
              Truck deliveries booked online, tracked live, signed for at every stop.
            </span>
          </div>
          <div className="flex flex-col gap-2 text-[14px]">
            {c.dispatch_email && (
              <a href={`mailto:${c.dispatch_email}`} className="inline-flex items-center gap-2 text-ink no-underline hover:underline">
                <Mail size={15} aria-hidden="true" /> {c.dispatch_email}
              </a>
            )}
            {c.support_phone && (
              <a href={telHref(c.support_phone)} className="inline-flex items-center gap-2 text-ink no-underline hover:underline">
                <Phone size={15} aria-hidden="true" /> {c.support_phone}
              </a>
            )}
          </div>
          <div className="flex flex-col gap-2 text-[14px]">
            <Link href="/terms" className="text-ink-muted no-underline hover:text-ink">
              Delivery terms
            </Link>
            <Link href="/console" className="text-ink-muted no-underline hover:text-ink">
              Dispatcher sign-in
            </Link>
            <Link href="/driver" className="text-ink-muted no-underline hover:text-ink">
              Driver app
            </Link>
          </div>
        </div>
        <div className="mx-auto w-full max-w-[1120px] px-4 pb-8">
          <span className="t-body-sm text-ink-muted">
            © {new Date().getFullYear()} {c.operator_name}
          </span>
        </div>
      </footer>
    </div>
  );
}
