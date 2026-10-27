'use client';

import { Search } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent, type ReactNode } from 'react';
import { telHref } from '@/components/tracking/TrackingPhone';
import { requestMailto } from '@/lib/booking';
import { useConfig } from '@/lib/config';
import { prettyPhone, useSite } from '@/lib/site';

/** Where "Request a quote" goes: the booking form when online booking is on, else an email. */
export function useRequestHref(): string {
  const c = useConfig();
  const site = useSite();
  return c.booking_enabled ? '/book' : requestMailto(site.email, site.name);
}

const mono = 'font-mono text-[11.5px] tracking-[0.06em]';

/** The two-dot mark on a tile (white on the dark header, dark in the footer). */
export function SiteMark({ dark = false, size = 34 }: { dark?: boolean; size?: number }) {
  const dot = Math.round(size * 0.38);
  return (
    <span aria-hidden="true" className="grid flex-none place-items-center rounded-[10px]" style={{ width: size, height: size, background: dark ? '#161616' : '#fff' }}>
      <span className="relative block" style={{ width: size * 0.58, height: size * 0.58 }}>
        <i className="absolute start-0 top-0 rounded-full bg-[#FFCF33]" style={{ width: dot, height: dot }} />
        <i className="absolute end-0 bottom-0 rounded-full bg-[#FFCF33] opacity-75" style={{ width: dot, height: dot }} />
      </span>
    </span>
  );
}

/** "Track a delivery": the code from the customer's tracking link opens its page. */
function TrackBox() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const go = (e: FormEvent) => {
    e.preventDefault();
    const c = code.trim().replace(/^.*\/t\//, '').replace(/^#/, '');
    if (c) router.push(`/t/${encodeURIComponent(c)}`);
  };
  return (
    <form onSubmit={go} role="search" className="flex h-[38px] items-center gap-2 rounded-[10px] border border-white/15 bg-white/[0.08] px-3">
      <Search size={14} strokeWidth={1.8} className="text-[#B8B8B4]" aria-hidden="true" />
      <input
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="Track a delivery: your tracking code"
        aria-label="Tracking code"
        className="w-[min(210px,40vw)] border-0 bg-transparent text-[12.5px] text-[#F2F2EF] outline-none placeholder:text-[#B8B8B4]"
      />
    </form>
  );
}

const NAV: [string, string][] = [
  ['/', 'HOME'],
  ['/#services', 'SERVICES'],
  ['/#visibility', 'TRACKING'],
  ['/#lanes', 'LANES'],
  ['/#quote', 'QUOTE'],
];

/** The dark navigation bar from the design: brand, section links, tracking, staff sign-in, quote. */
export function SiteNav({ current = '/' }: { current?: string }) {
  const site = useSite();
  const request = useRequestHref();
  return (
    <nav aria-label="Site" className="relative flex flex-wrap items-center gap-x-7 gap-y-3 px-[clamp(20px,5vw,72px)] py-[22px] text-[#F2F2EF]">
      <Link href="/" className="flex items-center gap-2.5 no-underline" style={{ color: '#F2F2EF' }}>
        <SiteMark />
        <span className="text-[17px] font-bold tracking-[-0.01em]">{site.name}</span>
      </Link>
      <div className={`hidden flex-wrap gap-1 md:flex ${mono}`}>
        {NAV.map(([href, label]) => {
          const on = href === current;
          return (
            <a
              key={href}
              href={href}
              className="rounded-lg px-2.5 py-1.5 no-underline hover:text-[#FFCF33]"
              style={on ? { background: '#F2F2EF', color: '#151515' } : { color: '#F2F2EF' }}
            >
              {label}
            </a>
          );
        })}
      </div>
      <div className="ms-auto flex flex-wrap items-center gap-2">
        <div className="hidden sm:block">
          <TrackBox />
        </div>
        <Link href="/console" className="flex h-[38px] items-center rounded-[10px] border border-white/20 px-3.5 text-[12.5px] font-medium no-underline" style={{ color: '#F2F2EF' }}>
          Dispatch login
        </Link>
        <a href={request} className={`flex h-[38px] items-center rounded-[10px] bg-[#FFCF33] px-4 font-medium no-underline hover:opacity-90 ${mono}`} style={{ color: '#151515' }}>
          REQUEST A QUOTE
        </a>
      </div>
    </nav>
  );
}

/** The footer from the design: brand, contact, tools and the legal line. */
export function SiteFooter() {
  const site = useSite();
  const request = useRequestHref();
  const head = 'font-mono text-[10.5px] tracking-[0.08em] text-[#8E8E8A]';
  const link = 'no-underline hover:text-[#B98A00]';
  return (
    <footer className="relative z-[1] bg-white px-[clamp(20px,5vw,72px)] pt-16 pb-7 text-[#151515]">
      <div className="mx-auto flex max-w-[1180px] flex-col gap-12">
        <div className="grid gap-8" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
          <div className="flex min-w-0 flex-col gap-3.5 sm:col-span-2">
            <span className="flex items-center gap-2.5">
              <SiteMark dark size={32} />
              <b className="text-[16px]">{site.name}</b>
            </span>
            <span className="max-w-[300px] text-[13px] text-[#6E6E6A]">Road freight and dispatch, tracked live and signed for at every stop.</span>
          </div>
          <div className="flex flex-col gap-2.5 text-[13px]">
            <span className={head}>CONTACT</span>
            <a href={`mailto:${site.email}`} className={link} style={{ color: '#151515' }}>
              {site.email}
            </a>
            <a href={telHref(site.phone)} className={link} style={{ color: '#151515' }}>
              {prettyPhone(site.phone)}
            </a>
          </div>
          <div className="flex flex-col gap-2.5 text-[13px]">
            <span className={head}>TOOLS</span>
            <a href="/#visibility" className={link} style={{ color: '#151515' }}>
              Track a delivery
            </a>
            <a href={request} className={link} style={{ color: '#151515' }}>
              Get a quote
            </a>
            <Link href="/console" className={link} style={{ color: '#151515' }}>
              Dispatch login
            </Link>
            <Link href="/driver" className={link} style={{ color: '#151515' }}>
              Driver app
            </Link>
          </div>
        </div>
        <div className="flex flex-wrap justify-between gap-3 border-t border-[#ECECEA] pt-5 text-[12px] text-[#8E8E8A]">
          <span>
            © {new Date().getFullYear()} {site.name}
          </span>
          <span>
            Every delivery is carried under our{' '}
            <Link href="/terms" className="underline" style={{ color: '#8E8E8A' }}>
              delivery terms
            </Link>
            . Prices and services are subject to change.
          </span>
        </div>
      </div>
    </footer>
  );
}

/**
 * The other public pages (booking, terms): the design's dark bar on top, its footer below. Always
 * light (lib/site.ts).
 */
export function SiteShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-surface-100 text-ink">
      <header className="sticky top-0 z-20 bg-[#161616]" style={{ boxShadow: '0 14px 28px -20px rgb(0 0 0 / 0.4)' }}>
        <SiteNav current="" />
      </header>
      <div className="flex-1">{children}</div>
      <SiteFooter />
    </div>
  );
}
