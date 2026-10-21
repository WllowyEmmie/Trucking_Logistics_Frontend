'use client';

import { Mail, Phone, Truck } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { telHref } from '@/components/tracking/TrackingPhone';
import { requestMailto } from '@/lib/booking';
import { useConfig } from '@/lib/config';
import { prettyPhone, useSite } from '@/lib/site';

/** Where "Request a delivery" goes: the booking form when online booking is on, else an email. */
export function useRequestHref(): string {
  const c = useConfig();
  const site = useSite();
  return c.booking_enabled ? '/book' : requestMailto(site.email, site.name);
}

/**
 * Header and footer for the public pages (home, booking, terms). Always light (lib/site.ts). The
 * console and driver app aren't linked from here: staff use their own addresses (/console, /driver).
 */
export function SiteShell({ children }: { children: ReactNode }) {
  const site = useSite();
  const request = useRequestHref();
  return (
    <div className="flex min-h-dvh flex-col bg-surface-100 text-ink">
      <header className="sticky top-0 z-20 border-b border-divider bg-surface-100/90 backdrop-blur">
        <div className="mx-auto flex min-h-16 w-full max-w-[1160px] items-center justify-between gap-4 px-4">
          <Link href="/" className="flex items-center gap-2.5 text-ink no-underline">
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-ink text-surface-100">
              <Truck size={19} strokeWidth={2.25} aria-hidden="true" />
            </span>
            <span className="t-h2">{site.name}</span>
          </Link>
          <nav aria-label="Site" className="flex items-center gap-1 sm:gap-2">
            <a href="/#how" className="hidden rounded-md px-3 py-2 text-[14px] font-semibold text-ink-muted no-underline hover:text-ink md:inline">
              How it works
            </a>
            <a href="/#services" className="hidden rounded-md px-3 py-2 text-[14px] font-semibold text-ink-muted no-underline hover:text-ink md:inline">
              Services
            </a>
            <a href="/#contact" className="hidden rounded-md px-3 py-2 text-[14px] font-semibold text-ink-muted no-underline hover:text-ink sm:inline">
              Contact
            </a>
            <a href={request} className="inline-flex min-h-10 items-center rounded-md bg-ink px-3.5 text-[14px] font-semibold text-surface-100 no-underline">
              Request a delivery
            </a>
          </nav>
        </div>
      </header>
      <div className="flex-1">{children}</div>
      <footer className="relative z-[1] border-t border-divider bg-surface-200">
        <div className="mx-auto grid w-full max-w-[1160px] gap-8 px-4 py-12 md:grid-cols-[1.4fr_1fr_1fr]">
          <div className="flex flex-col gap-2">
            <span className="t-h2">{site.name}</span>
            <span className="t-body-sm max-w-[44ch] text-ink-muted">Truck deliveries across the city, tracked live and signed for at every stop.</span>
          </div>
          <div className="flex flex-col gap-2 text-[14px]">
            <span className="t-label text-ink-muted">Contact</span>
            <a href={`mailto:${site.email}`} className="inline-flex items-center gap-2 text-ink no-underline hover:underline">
              <Mail size={15} aria-hidden="true" /> {site.email}
            </a>
            <a href={telHref(site.phone)} className="inline-flex items-center gap-2 text-ink no-underline hover:underline">
              <Phone size={15} aria-hidden="true" /> {prettyPhone(site.phone)}
            </a>
          </div>
          <div className="flex flex-col gap-2 text-[14px]">
            <span className="t-label text-ink-muted">Legal</span>
            <Link href="/terms" className="text-ink no-underline hover:underline">
              Delivery terms and conditions
            </Link>
          </div>
        </div>
        <div className="border-t border-divider">
          <div className="mx-auto flex w-full max-w-[1160px] flex-col gap-1 px-4 py-5 sm:flex-row sm:justify-between">
            <span className="t-body-sm text-ink-muted">
              © {new Date().getFullYear()} {site.name}
            </span>
            <span className="t-body-sm text-ink-muted">
              Every delivery is carried under our{' '}
              <Link href="/terms" className="text-ink-muted underline">
                delivery terms
              </Link>
              . Prices and services are subject to change.
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
