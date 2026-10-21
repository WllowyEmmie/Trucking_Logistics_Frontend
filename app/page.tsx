'use client';

import { ArrowRight, ChevronDown, CreditCard, Mail, MapPin, PenLine, Phone, Route, Truck, Zap } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { SiteShell } from '@/components/site/SiteChrome';
import { StatusPill } from '@/components/StatusPill';
import { fillIn } from '@/components/tracking/CustomerInfo';
import { telHref } from '@/components/tracking/TrackingPhone';
import { naira, requestMailto } from '@/lib/booking';
import { useConfig } from '@/lib/config';

// The public home page: what the company does, what it costs, and how to book or get in touch.
// The developer index that used to live here is at /dev.

const primaryBtn = 'inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-ink px-5 text-[15px] font-semibold text-surface-100 no-underline';
const secondaryBtn = 'inline-flex min-h-12 items-center justify-center gap-2 rounded-md border border-border bg-surface-100 px-5 text-[15px] font-semibold text-ink no-underline';

export default function Home() {
  const c = useConfig();
  const phone = c.support_phone || null;
  const canBook = c.booking_enabled;
  const book = canBook ? (
    <Link href="/book" className={primaryBtn}>
      Request a delivery <ArrowRight size={17} aria-hidden="true" />
    </Link>
  ) : c.dispatch_email ? (
    <a href={requestMailto(c.dispatch_email, c.operator_name)} className={primaryBtn}>
      Request a delivery <Mail size={17} aria-hidden="true" />
    </a>
  ) : (
    <a href="#contact" className={primaryBtn}>
      Request a delivery <ArrowRight size={17} aria-hidden="true" />
    </a>
  );

  return (
    <SiteShell>
      {/* Hero */}
      <section className="border-b border-divider">
        <div className="mx-auto grid w-full max-w-[1120px] items-center gap-10 px-4 py-14 md:grid-cols-[1.15fr_1fr] md:py-20">
          <div className="flex flex-col gap-5">
            <span className="t-label text-accent">Truck deliveries · booked online</span>
            <h1 className="m-0 text-[38px] leading-[42px] font-bold tracking-[-0.8px] md:text-[52px] md:leading-[56px]">
              Book a truck in minutes. Watch it all the way there.
            </h1>
            <p className="t-body-lg m-0 max-w-[52ch] text-ink-muted" style={{ textWrap: 'pretty' }}>
              From one pickup to up to five drop-offs. See the price before you pay, follow the truck live on a map, and get a
              signature at every stop.
            </p>
            <div className="flex flex-wrap gap-3">
              {book}
              <a href="#how" className={secondaryBtn}>
                How it works
              </a>
            </div>
            <p className="t-body-sm m-0 text-ink-muted">
              {canBook ? 'Pay securely online with Paystack.' : 'Tell us where and what; dispatch replies with a price.'}
            </p>
          </div>
          <ExampleTracking company={c.operator_name} />
        </div>
      </section>

      {/* What we do */}
      <section className="mx-auto w-full max-w-[1120px] px-4 py-16">
        <SectionHead label="What you get" title="Haulage that keeps you posted" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Feature icon={<Truck size={20} aria-hidden="true" />} title="Same-day trucks">
            Once your booking is paid, the nearest free truck with a driver on shift is assigned.
          </Feature>
          <Feature icon={<Route size={20} aria-hidden="true" />} title="Multi-drop runs">
            One pickup, up to five drop-offs in one booking, in the order you choose.
          </Feature>
          <Feature icon={<MapPin size={20} aria-hidden="true" />} title="Live tracking link">
            A private link shows where the truck is and when it should arrive. Share it with whoever&apos;s receiving.
          </Feature>
          <Feature icon={<PenLine size={20} aria-hidden="true" />} title="Proof at every stop">
            The receiver signs on the driver&apos;s phone. You see who signed, and when, on your link.
          </Feature>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="scroll-mt-20 border-y border-divider bg-surface-200">
        <div className="mx-auto w-full max-w-[1120px] px-4 py-16">
          <SectionHead label="How it works" title="Four steps, no phone tag" />
          <ol className="m-0 grid list-none gap-4 p-0 md:grid-cols-4">
            {[
              ['Tell us the route', 'Search the pickup and drop-off addresses, and say what’s being moved.'],
              ['See the price, pay', canBook ? 'The price shows before you pay. Pay with Paystack.' : 'Dispatch confirms the price with you.'],
              ['A truck is assigned', 'The nearest truck whose driver is on shift gets the job.'],
              ['Track and sign', 'Follow the truck live; the receiver signs at each drop-off.'],
            ].map(([t, d], i) => (
              <li key={t} className="flex flex-col gap-2 rounded-lg border border-border bg-surface-100 p-5">
                <span className="font-mono text-[13px] font-semibold text-accent">0{i + 1}</span>
                <span className="t-h2">{t}</span>
                <span className="t-body-sm text-ink-muted">{d}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="mx-auto w-full max-w-[1120px] scroll-mt-20 px-4 py-16">
        <SectionHead label="Pricing" title="One clear price, worked out from the distance" />
        <div className="grid gap-4 md:grid-cols-[1fr_1.2fr]">
          <div className="flex flex-col gap-1 rounded-lg border-2 border-ink p-6">
            <span className="t-label text-ink-muted">From</span>
            <span className="text-[44px] leading-[48px] font-bold tracking-[-1px]">{naira(Math.max(c.price_minimum, c.price_base))}</span>
            <span className="t-body-sm text-ink-muted">per booking, all stops included</span>
          </div>
          <div className="flex flex-col justify-center gap-3 rounded-lg border border-border p-6">
            <PriceLine k="Base fee" v={naira(c.price_base)} />
            <PriceLine k="Per km of road distance" v={`${naira(c.price_per_km)} / km`} />
            <PriceLine k="Minimum" v={naira(c.price_minimum)} />
            <span className="t-body-sm text-ink-muted">
              Distance runs through all your stops in order. You see the exact price before paying; nothing is added after.
            </span>
          </div>
        </div>
      </section>

      {/* FAQ */}
      {c.customer_faq.length > 0 && (
        <section className="border-t border-divider">
          <div className="mx-auto w-full max-w-[860px] px-4 py-16">
            <SectionHead label="Questions" title="Good to know" />
            <div className="flex flex-col divide-y divide-divider rounded-lg border border-border">
              {c.customer_faq.slice(0, 6).map((x, i) => (
                <details key={i} className="group px-5 py-3">
                  <summary className="t-h2 flex min-h-11 cursor-pointer list-none items-center justify-between gap-3">
                    {fillIn(x.q, c.operator_name, phone)}
                    <ChevronDown size={18} aria-hidden="true" className="flex-none transition-transform group-open:rotate-180" />
                  </summary>
                  <p className="t-body m-0 pb-2 text-ink-muted" style={{ textWrap: 'pretty' }}>
                    {fillIn(x.a, c.operator_name, phone)}
                  </p>
                </details>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Contact */}
      <section id="contact" className="scroll-mt-20 border-t border-divider bg-surface-200">
        <div className="mx-auto grid w-full max-w-[1120px] gap-8 px-4 py-16 md:grid-cols-2">
          <div className="flex flex-col gap-3">
            <span className="t-label text-accent">Contact</span>
            <h2 className="t-display m-0">Talk to dispatch</h2>
            <p className="t-body m-0 max-w-[46ch] text-ink-muted">
              Big or unusual load, regular runs, or a question before you book? Write or call, and a dispatcher will get back to you.
            </p>
            {c.depot && <p className="t-body-sm m-0 text-ink-muted">Depot: {c.depot.address}</p>}
          </div>
          <div className="flex flex-col gap-3">
            {c.dispatch_email && (
              <a href={requestMailto(c.dispatch_email, c.operator_name)} className={`${secondaryBtn} justify-start`}>
                <Mail size={17} aria-hidden="true" /> {c.dispatch_email}
              </a>
            )}
            {phone && (
              <a href={telHref(phone)} className={`${secondaryBtn} justify-start`}>
                <Phone size={17} aria-hidden="true" /> {phone}
              </a>
            )}
            {canBook && (
              <Link href="/book" className={`${primaryBtn} justify-start`}>
                <Zap size={17} aria-hidden="true" /> Book and pay online
              </Link>
            )}
            {!c.dispatch_email && !phone && !canBook && (
              <span className="t-body text-ink-muted">Contact details are coming soon.</span>
            )}
          </div>
        </div>
      </section>
    </SiteShell>
  );
}

function SectionHead({ label, title }: { label: string; title: string }) {
  return (
    <div className="mb-8 flex flex-col gap-2">
      <span className="t-label text-accent">{label}</span>
      <h2 className="t-display m-0">{title}</h2>
    </div>
  );
}

function Feature({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-5">
      <span className="flex h-10 w-10 items-center justify-center rounded-md bg-accent-bg text-accent">{icon}</span>
      <span className="t-h2">{title}</span>
      <span className="t-body-sm text-ink-muted">{children}</span>
    </div>
  );
}

function PriceLine({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-divider pb-2">
      <span className="t-body">{k}</span>
      <span className="font-mono text-[15px] font-semibold">{v}</span>
    </div>
  );
}

/** An illustration of the customer's tracking page, built from the same parts. Example data only. */
function ExampleTracking({ company }: { company: string }) {
  return (
    <figure aria-label="Example of a tracking page" className="m-0 flex flex-col gap-4 rounded-xl border border-border bg-surface-200 p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col">
          <span className="t-h2">{company}</span>
          <span className="t-mono-sm text-ink-muted">DEL-2026-10042 · example</span>
        </div>
        <StatusPill status="in_transit" size="md" />
      </div>
      <div className="flex flex-col gap-1">
        <span className="t-label text-ink-muted">Estimated arrival</span>
        <span className="text-[34px] leading-[38px] font-bold">2:40 PM</span>
        <span className="t-body-sm text-ink-muted">In about 25 min · 6.2 km away</span>
      </div>
      <ol className="m-0 flex list-none flex-col gap-3 p-0">
        {[
          ['Pickup', 'Apapa Wharf', 'Collected 1:55 PM', true],
          ['Drop-off', 'Ikeja GRA', 'Signed for by Bola A.', true],
          ['Drop-off', 'Lekki Phase 1', 'Next · about 2:40 PM', false],
        ].map(([kind, place, note, done]) => (
          <li key={String(place)} className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className="mt-1 h-3 w-3 flex-none rounded-full"
              style={{ background: done ? 'var(--ink)' : 'var(--accent)' }}
            />
            <span className="flex flex-col">
              <span className="t-body font-semibold">
                {String(kind)} · {String(place)}
              </span>
              <span className="t-body-sm text-ink-muted">{String(note)}</span>
            </span>
          </li>
        ))}
      </ol>
      <figcaption className="t-body-sm flex items-center gap-2 text-ink-muted">
        <CreditCard size={14} aria-hidden="true" /> Paid online · the link updates by itself
      </figcaption>
    </figure>
  );
}
