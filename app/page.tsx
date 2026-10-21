'use client';

import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { MotionPathPlugin } from 'gsap/MotionPathPlugin';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ArrowRight, ChevronDown, Mail, MapPin, PenLine, Phone, Route, ShieldCheck, Truck } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { SiteShell, useRequestHref } from '@/components/site/SiteChrome';
import { StatusPill } from '@/components/StatusPill';
import { fillIn } from '@/components/tracking/CustomerInfo';
import { telHref } from '@/components/tracking/TrackingPhone';
import { useConfig } from '@/lib/config';
import { prettyPhone, useSite } from '@/lib/site';

gsap.registerPlugin(useGSAP, ScrollTrigger, MotionPathPlugin);

// The public home page. Animations (GSAP): the headline rises in word by word, the example tracking
// card fills in stop by stop, and sections rise into view as you scroll. Three quiet roads cut
// diagonally across the page, behind the sections, with even waves: a truck comes in from the left
// and drives down off the right edge, comes back from the right across the middle of the page as you
// scroll, then down from the left into the footer, where it drives under the footer and is gone.
// Everything is skipped for people who've asked their system for reduced motion.
// The developer index that used to live here is at /dev.

const primaryBtn = 'inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-ink px-5 text-[15px] font-semibold text-surface-100 no-underline transition-transform hover:-translate-y-0.5';
const secondaryBtn = 'inline-flex min-h-12 items-center justify-center gap-2 rounded-md border border-border bg-surface-100 px-5 text-[15px] font-semibold text-ink no-underline transition-transform hover:-translate-y-0.5';

const HEADLINE = 'Book a truck in minutes. Watch it all the way there.';
// The roads: three diagonals, each winding evenly, behind the page (sections sit above them).
const WAVE = 300;
const WAVE_HEIGHT = 10;
const OFF = 70; // how far past the screen's edge a road runs

type Pt = [number, number];

interface RoadGeom {
  width: number;
  height: number;
  roads: { d: string; from: Pt; y0: number; y1: number }[];
  gate: Pt;
}

/** A road from a to b, winding either side of the straight line by the same waves everywhere. */
function wavyRoad(a: Pt, b: Pt): string {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const ux = (b[0] - a[0]) / len;
  const uy = (b[1] - a[1]) / len;
  const pt = (t: number) => {
    const off = WAVE_HEIGHT * Math.sin((2 * Math.PI * t) / WAVE) * Math.min(1, t / 60, (len - t) / 60);
    return `${(a[0] + ux * t - uy * off).toFixed(1)} ${(a[1] + uy * t + ux * off).toFixed(1)}`;
  };
  let d = `M ${pt(0)}`;
  for (let t = 8; t < len; t += 8) d += ` L ${pt(t)}`;
  return d + ` L ${pt(len)}`;
}

/** From the left edge near the foot of the hero, down to the right edge; from the right edge, down across
 *  the middle; from the left edge down and under the footer. */
function measureRoad(root: HTMLElement): RoadGeom | null {
  const sections = Array.from(root.querySelectorAll<HTMLElement>(':scope > section'));
  const contact = root.querySelector<HTMLElement>('#contact');
  const footer = document.querySelector('footer');
  if (sections.length < 4 || !contact || !footer) return null;
  const width = root.clientWidth;
  // The section edges, top to bottom, down to the contact section.
  const ci = sections.indexOf(contact);
  const edges = sections.slice(0, ci).map((s) => s.offsetTop + s.offsetHeight);
  const at = (f: number) => edges[Math.min(edges.length - 1, Math.round(f * (edges.length - 1)))]!;
  const gateY = Math.round(footer.getBoundingClientRect().top - root.getBoundingClientRect().top + 70);
  const gate: Pt = [Math.round(width / 2), gateY];
  const legs: [Pt, Pt][] = [
    [[-OFF, edges[0]! - 140], [width + OFF, at(0.35)]],
    [[width + OFF, at(0.5)], [-OFF, at(0.85)]],
    [[-OFF, at(1)], gate],
  ];
  const roads = legs.map(([a, b]) => ({ d: wavyRoad(a, b), from: a, y0: a[1], y1: b[1] }));
  return { width, height: gateY + 30, roads, gate };
}

export default function Home() {
  const c = useConfig();
  const site = useSite();
  const request = useRequestHref();
  const root = useRef<HTMLDivElement>(null);
  // The road is drawn to the page's layout, and re-measured when it changes (resize, an FAQ opening).
  const [road, setRoad] = useState<RoadGeom | null>(null);
  const roadKey = road ? `${road.width}:${road.roads.map((x) => `${x.y0}-${x.y1}`).join(',')}` : '';
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const measure = () => setRoad(measureRoad(el));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        // Hero: words rise in, then the rest.
        gsap
          .timeline({ defaults: { ease: 'power3.out' } })
          .from('.hero-word', { yPercent: 110, opacity: 0, duration: 0.8, stagger: 0.06 })
          .from('.hero-fade', { y: 16, opacity: 0, duration: 0.6, stagger: 0.1 }, '-=0.4')
          .from('.hero-card', { x: 40, opacity: 0, duration: 0.8 }, '-=0.6')
          .from('.hero-stop', { x: -12, opacity: 0, duration: 0.45, stagger: 0.25 }, '-=0.2')
          .from('.hero-dot', { scale: 0, duration: 0.3, stagger: 0.25, ease: 'back.out(3)' }, '<');

        gsap.to('.hero-card', { y: -8, duration: 2.6, ease: 'sine.inOut', yoyo: true, repeat: -1, delay: 1.8 });

        // Sections rise in as they arrive.
        gsap.set('.reveal', { y: 32, opacity: 0 });
        ScrollTrigger.batch('.reveal', {
          start: 'top 88%',
          once: true,
          onEnter: (els) => gsap.to(els, { y: 0, opacity: 1, duration: 0.8, stagger: 0.12, ease: 'power3.out' }),
        });

        // How it works: the line fills with the scroll, each step lights up as the line reaches it.
        gsap.fromTo(
          '.how-line',
          { scaleX: 0 },
          { scaleX: 1, ease: 'none', scrollTrigger: { trigger: '#how', start: 'top 70%', end: 'bottom 60%', scrub: 0.6 } },
        );
        gsap.utils.toArray<HTMLElement>('.how-step').forEach((el, i) => {
          gsap.from(el, {
            y: 24,
            opacity: 0,
            duration: 0.6,
            ease: 'power2.out',
            scrollTrigger: { trigger: '#how', start: `top ${70 - i * 8}%`, toggleActions: 'play none none none' },
          });
        });

        // The closing band grows in.
        gsap.from('.cta-band', {
          scale: 0.94,
          opacity: 0,
          duration: 0.9,
          ease: 'power3.out',
          scrollTrigger: { trigger: '.cta-band', start: 'top 85%' },
        });
      });
    },
    { scope: root },
  );

  // The road has its own hook: it's redrawn whenever the layout changes, and only it restarts.
  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        // Each road: as it crosses the screen, its truck drives it end to end, the stretch covered
      // filling in behind. The last truck drives under the footer and is gone.
      if (!road || !root.current) return;
      const top = () => root.current!.getBoundingClientRect().top + window.scrollY;
      road.roads.forEach((rd, i) => {
        const path = root.current!.querySelector<SVGPathElement>(`#road-${i}`);
        if (!path) return;
        const len = path.getTotalLength();
        gsap.set(`#road-done-${i}`, { strokeDasharray: len, strokeDashoffset: len });
        // Drives while its road passes through the screen: from when the start comes into view
        // until the end is two thirds of the way up.
        const end = () => Math.min(top() + rd.y1 - window.innerHeight * 0.35, ScrollTrigger.maxScroll(window));
        let facingBack = false;
        const tl = gsap.timeline({
          defaults: { ease: 'none' },
          scrollTrigger: {
            start: () => Math.max(0, Math.min(top() + rd.y0 - window.innerHeight * 0.85, end() - 200)),
            end,
            scrub: 0.8,
            // Scrolling back up drives the truck back: turn it round so it faces the way it's going.
            onUpdate: (self) => {
              const back = self.direction < 0;
              if (back === facingBack) return;
              facingBack = back;
              gsap.to(`#road-truck-${i} .lorry-turn`, { rotation: back ? 180 : 0, svgOrigin: '0 0', duration: 0.35, ease: 'power2.out', overwrite: true });
            },
          },
        });
        tl.to(`#road-truck-${i}`, { motionPath: { path, align: path, alignOrigin: [0.5, 0.5], autoRotate: true } }, 0).to(
          `#road-done-${i}`,
          { strokeDashoffset: 0 },
          0,
        );
      });
      });
    },
    { scope: root, dependencies: [roadKey], revertOnUpdate: true },
  );

  return (
    <SiteShell>
      <div ref={root} className="relative">
        <Road geom={road} />
        {/* Hero */}
        <section className="relative z-[1] overflow-hidden shadow-[0_14px_28px_-20px_rgb(0_0_0/0.22)]">
          <div className="relative mx-auto grid w-full max-w-[1160px] items-center gap-12 px-4 py-16 md:grid-cols-[1.15fr_1fr] md:py-24">
            <div className="road-cover flex flex-col gap-6">
              <span className="hero-fade t-label text-accent">Truck deliveries · booked in minutes</span>
              <h1 className="m-0 text-[40px] leading-[46px] font-bold tracking-[-1px] md:text-[58px] md:leading-[62px]" aria-label={HEADLINE}>
                {HEADLINE.split(' ').map((w, i) => (
                  <span key={i} aria-hidden="true" className="inline-block overflow-hidden pb-1 align-bottom">
                    <span className="hero-word inline-block">{w}&nbsp;</span>
                  </span>
                ))}
              </h1>
              <p className="hero-fade t-body-lg m-0 max-w-[52ch] text-ink-muted" style={{ textWrap: 'pretty' }}>
                From one pickup to several drop-offs. Follow your truck live on a map, and get a signature at every stop.
              </p>
              <div className="hero-fade flex flex-wrap gap-3">
                <a href={request} className={primaryBtn}>
                  Request a delivery <ArrowRight size={17} aria-hidden="true" />
                </a>
                <a href="#how" className={secondaryBtn}>
                  How it works
                </a>
              </div>
            </div>
            <ExampleTracking company={site.name} />
          </div>
        </section>

        {/* Services */}
        <section id="services" className="relative z-[1] mx-auto w-full max-w-[1160px] scroll-mt-20 px-4 py-20">
          <SectionHead label="What you get" title="Haulage that keeps you posted" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Feature icon={<Truck size={20} aria-hidden="true" />} title="Trucks on demand">
              The nearest available truck with a driver on shift takes your job.
            </Feature>
            <Feature icon={<Route size={20} aria-hidden="true" />} title="Multi-drop runs">
              One pickup and several drop-offs in a single booking, in the order you choose.
            </Feature>
            <Feature icon={<MapPin size={20} aria-hidden="true" />} title="Live tracking link">
              A private link shows where the truck is and when it should arrive. Share it with whoever&apos;s receiving.
            </Feature>
            <Feature icon={<PenLine size={20} aria-hidden="true" />} title="Proof at every stop">
              The receiver signs on the driver&apos;s phone; you see who signed, and when.
            </Feature>
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="relative z-[1] scroll-mt-20 [--cover:var(--surface-200)] border-y border-divider bg-surface-200">
          <div className="mx-auto w-full max-w-[1160px] px-4 py-20">
            <SectionHead label="How it works" title="Four steps, no phone tag" />
            <div className="relative">
              <div aria-hidden="true" className="absolute top-[22px] right-0 left-0 hidden h-[2px] bg-divider md:block">
                <div className="how-line h-full origin-left bg-accent" />
              </div>
              <ol className="relative m-0 grid list-none gap-6 p-0 md:grid-cols-4">
                {[
                  ['Tell us the route', 'Your pickup, your drop-offs, and what’s being moved.'],
                  ['Get your price', 'You’ll know the price before anything is confirmed.'],
                  ['A truck is assigned', 'The nearest free truck with a driver on shift gets the job.'],
                  ['Track and sign', 'Follow the truck live; the receiver signs at each drop-off.'],
                ].map(([t, d], i) => (
                  <li key={t} className="how-step flex flex-col gap-3">
                    <span className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-accent bg-surface-100 font-mono text-[14px] font-bold text-accent">
                      0{i + 1}
                    </span>
                    <span className="t-h2">{t}</span>
                    <span className="t-body-sm text-ink-muted">{d}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        {/* Pricing, deliberately general */}
        <section className="relative z-[1] mx-auto w-full max-w-[1160px] px-4 py-20">
          <div className="grid items-center gap-8 md:grid-cols-[1fr_1.1fr]">
            <SectionHead label="Pricing" title="Upfront prices, no surprises" />
            <div className="road-cover reveal flex flex-col gap-3">
              <p className="t-body-lg m-0 text-ink-muted" style={{ textWrap: 'pretty' }}>
                Every job is priced on its distance, number of stops and load. You&apos;ll see your price before you confirm, and it
                doesn&apos;t change once you&apos;ve booked.
              </p>
              <p className="t-body-sm m-0 inline-flex items-center gap-2 text-ink-muted">
                <ShieldCheck size={15} aria-hidden="true" /> Rates are subject to change.
              </p>
            </div>
          </div>
        </section>

        {/* FAQ */}
        {c.customer_faq.length > 0 && (
          <section className="relative z-[1]">
            <div className="mx-auto w-full max-w-[860px] px-4 py-20">
              <SectionHead label="Questions" title="Good to know" />
              <div className="reveal flex flex-col divide-y divide-divider rounded-lg border border-border bg-surface-100">
                {c.customer_faq.slice(0, 6).map((x, i) => (
                  <details key={i} className="group px-5 py-3">
                    <summary className="t-h2 flex min-h-11 cursor-pointer list-none items-center justify-between gap-3">
                      {fillIn(x.q, site.name, site.phone)}
                      <ChevronDown size={18} aria-hidden="true" className="flex-none transition-transform group-open:rotate-180" />
                    </summary>
                    <p className="t-body m-0 pb-2 text-ink-muted" style={{ textWrap: 'pretty' }}>
                      {fillIn(x.a, site.name, site.phone)}
                    </p>
                  </details>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Contact */}
        <section id="contact" className="relative z-[1] mx-auto w-full max-w-[1160px] scroll-mt-20 px-4 pt-16 pb-20">
          <div className="cta-band grid gap-8 rounded-2xl bg-ink p-8 text-surface-100 md:grid-cols-[1.2fr_1fr] md:p-12">
            <div className="flex flex-col gap-3">
              <span className="t-label text-accent">Contact</span>
              <h2 className="t-display m-0">Need a truck? Talk to dispatch.</h2>
              <p className="t-body m-0 max-w-[46ch] opacity-80">
                Big or unusual load, regular runs, or a question first? Write or call and a dispatcher will get back to you.
              </p>
            </div>
            <div className="flex flex-col justify-center gap-3">
              <a href={request} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-surface-100 px-5 text-[15px] font-semibold text-ink no-underline">
                Request a delivery <ArrowRight size={17} aria-hidden="true" />
              </a>
              <a href={`mailto:${site.email}`} className="inline-flex min-h-12 items-center gap-2 rounded-md border border-surface-100/30 px-5 text-[15px] font-semibold text-surface-100 no-underline">
                <Mail size={17} aria-hidden="true" /> {site.email}
              </a>
              <a href={telHref(site.phone)} className="inline-flex min-h-12 items-center gap-2 rounded-md border border-surface-100/30 px-5 text-[15px] font-semibold text-surface-100 no-underline">
                <Phone size={17} aria-hidden="true" /> {prettyPhone(site.phone)}
              </a>
            </div>
          </div>
        </section>
      </div>
    </SiteShell>
  );
}

function SectionHead({ label, title }: { label: string; title: string }) {
  return (
    <div className="road-cover reveal mb-8 flex w-fit max-w-full flex-col gap-2">
      <span className="t-label text-accent">{label}</span>
      <h2 className="t-display m-0">{title}</h2>
    </div>
  );
}

function Feature({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="reveal group flex flex-col gap-3 rounded-lg border border-border bg-surface-100 p-5 transition-shadow hover:shadow-md">
      <span className="flex h-10 w-10 items-center justify-center rounded-md bg-accent-bg text-accent transition-transform group-hover:-translate-y-0.5">{icon}</span>
      <span className="t-h2">{title}</span>
      <span className="t-body-sm text-ink-muted">{children}</span>
    </div>
  );
}

/** An illustration of the customer's tracking page, built from the same parts. Example data only. */
function ExampleTracking({ company }: { company: string }) {
  return (
    <figure aria-label="Example of a tracking page" className="hero-card m-0 flex flex-col gap-4 rounded-xl border border-border bg-surface-100 p-5 shadow-lg">
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
          <li key={String(place)} className="hero-stop flex items-start gap-3">
            <span aria-hidden="true" className="hero-dot mt-1 h-3 w-3 flex-none rounded-full" style={{ background: done ? 'var(--ink)' : 'var(--accent)' }} />
            <span className="flex flex-col">
              <span className="t-body font-semibold">
                {String(kind)} · {String(place)}
              </span>
              <span className="t-body-sm text-ink-muted">{String(note)}</span>
            </span>
          </li>
        ))}
      </ol>
    </figure>
  );
}

/** The roads: tarmac with lane markings, each with its truck and the trail behind it, and the
 *  last one runs on under the footer. Behind the sections, in the gaps between them. */
function Road({ geom }: { geom: RoadGeom | null }) {
  if (!geom) return null;
  return (
    <svg aria-hidden="true" className="pointer-events-none absolute top-0 left-0 z-0 overflow-hidden" width={geom.width} height={geom.height} viewBox={`0 0 ${geom.width} ${geom.height}`}>
      {geom.roads.map((rd, i) => (
        <g key={i}>
          <path d={rd.d} fill="none" stroke="var(--surface-300)" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.7" />
          <path d={rd.d} fill="none" stroke="var(--surface-100)" strokeWidth="1" strokeDasharray="6 12" />
          <path id={`road-done-${i}`} d={rd.d} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeOpacity="0.7" />
          <path id={`road-${i}`} d={rd.d} fill="none" stroke="none" />
        </g>
      ))}

      {/* A truck per road, each starting at its road's beginning (GSAP drives and turns it). */}
      {geom.roads.map((rd, i) => (
        <g key={i} id={`road-truck-${i}`} transform={`translate(${rd.from[0]} ${rd.from[1]})`}>
          <g className="lorry-turn">
            <Lorry />
          </g>
        </g>
      ))}

    </svg>
  );
}

/** A lorry seen from above, facing right (+x), centred on 0,0: trailer, cab, windscreen, mirrors,
 *  wheels and headlights, with a soft shadow. About 46 × 20. */
function Lorry() {
  return (
    <g>
      <rect x="-22" y="-8" width="46" height="20" rx="4" fill="var(--ink)" opacity="0.12" />
      {/* wheels, peeking out either side */}
      {[-16, -9, 13].map((x) => (
        <g key={x}>
          <rect x={x - 3} y="-11" width="6" height="3" rx="1" fill="var(--ink)" />
          <rect x={x - 3} y="8" width="6" height="3" rx="1" fill="var(--ink)" />
        </g>
      ))}
      {/* trailer, with roof ribs */}
      <rect x="-22" y="-9" width="30" height="18" rx="2.5" fill="var(--ink)" />
      <path d="M -15 -9 V 9 M -8 -9 V 9 M -1 -9 V 9" stroke="var(--surface-300)" strokeOpacity="0.35" strokeWidth="1" />
      {/* cab */}
      <rect x="9" y="-8" width="13" height="16" rx="3.5" fill="var(--accent)" />
      <rect x="17.5" y="-6" width="3.5" height="12" rx="1.5" fill="var(--surface-100)" opacity="0.85" />
      <rect x="11" y="-10.5" width="3" height="2.5" rx="1" fill="var(--accent)" />
      <rect x="11" y="8" width="3" height="2.5" rx="1" fill="var(--accent)" />
      {/* headlights */}
      <circle cx="22.5" cy="-5.5" r="1.3" fill="#ffe7a3" />
      <circle cx="22.5" cy="5.5" r="1.3" fill="#ffe7a3" />
    </g>
  );
}
