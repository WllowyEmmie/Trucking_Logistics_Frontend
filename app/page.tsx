'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { SiteFooter, SiteNav, useRequestHref } from '@/components/site/SiteChrome';
import { telHref } from '@/components/tracking/TrackingPhone';
import {
  BOARD_FOOT,
  FEATURES,
  INDUSTRIES,
  LANE_COLOR,
  LANES,
  LOG,
  REGION_TABS,
  SCHEDULE,
  SERVICES,
  STATS,
  STEPS,
  type Region,
} from '@/lib/landing';
import { useSite } from '@/lib/site';

// The public home page, from the Landing Page design (Claude Design project): a dark hero over a
// truck at dusk, a live-lanes dispatch board with a map, then the network, services, how it works,
// scheduled lanes, tracking, industries and the quote band. Copy and figures live in lib/landing.ts.
// The hero photo is public/hero-truck.png; without it the hero shows a dusk gradient.
// The developer index that used to live here is at /dev.

const LaneMap = dynamic(() => import('@/components/site/LaneMap'), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-[#EDEDEA]" />,
});

const PAD = 'px-[clamp(20px,5vw,72px)]';
const mono = 'font-mono';
const ink = { color: '#151515' } as const;

function Eyebrow({ children, light = false }: { children: ReactNode; light?: boolean }) {
  return <span className={`${mono} text-[11px] tracking-[0.1em]`} style={{ color: light ? '#FFCF33' : '#8E8E8A' }}>{children}</span>;
}

/** The section title: upper case, the second half on a yellow highlighter. */
function Title({ a, b }: { a: string; b: string }) {
  return (
    <h2 className="m-0 text-[clamp(32px,4.4vw,56px)] leading-[1.05] font-bold tracking-[-0.03em] uppercase">
      {a} <span className="bg-[#FFCF33] px-[.12em] [box-decoration-break:clone]">{b}</span>
    </h2>
  );
}

function TruckGlyph({ size = 14, fill = '#151515' }: { size?: number; fill?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} aria-hidden="true">
      <path d="M2 6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v10H2z" />
      <path d="M14 8h3.5l3.5 4.2V16h-7z" />
      <circle cx="7" cy="17.5" r="2" />
      <circle cx="17" cy="17.5" r="2" />
    </svg>
  );
}

export default function HomePage() {
  const site = useSite();
  const request = useRequestHref();
  const [region, setRegion] = useState<Region>('us');
  const lanes = LANES[region];

  return (
    <div className="min-h-screen bg-white text-[#151515]">
      {/* ---- Hero ---- */}
      <header className="relative flex min-h-[640px] flex-col overflow-hidden bg-[#161616] text-[#F2F2EF]">
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage:
              "url('/hero-truck.png'), radial-gradient(120% 70% at 50% 18%, #c2732a 0%, #7a4320 34%, #2b1d14 62%, #161616 100%)",
          }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{ background: 'linear-gradient(180deg,rgba(22,22,22,.7) 0%,rgba(22,22,22,0) 30%,rgba(22,22,22,0) 50%,rgba(22,22,22,.9) 100%)' }}
        />
        <SiteNav current="/" />
        <div className={`pointer-events-none relative flex justify-between gap-5 py-2.5 ${PAD} ${mono} text-[11px] tracking-[0.08em] text-[#B8B8B4]`}>
          <span>
            {site.name.toUpperCase()} ROAD FREIGHT · <span className="text-[#FFCF33]">US</span> · <span className="text-[#FFCF33]">UK</span> ·{' '}
            <span className="text-[#FFCF33]">NIGERIA</span>
          </span>
          <span className="hidden sm:inline">DISPATCH DESK OPEN 24/7</span>
        </div>
        <div className={`relative mt-auto flex flex-col gap-[22px] pb-12 ${PAD}`}>
          <span className={`${mono} text-[11.5px] tracking-[0.1em] text-[#FFCF33]`}>● FULL TRUCKLOAD · LTL · CROSS-BORDER</span>
          <h1 className="m-0 max-w-[900px] text-[clamp(40px,6.4vw,84px)] leading-[1.02] font-bold tracking-[-0.035em] text-balance">
            Freight on schedule.
            <br />
            Tracked every mile.
          </h1>
          <div className={`flex flex-wrap gap-x-7 gap-y-2.5 ${mono} text-[11px] tracking-[0.08em] text-[#D8D8D4]`}>
            <span>✓ LIVE TRACKING LINK ON EVERY LOAD</span>
            <span>✓ CHECK CALLS LOGGED EN ROUTE</span>
            <span>✓ PROOF OF DELIVERY SAME DAY</span>
          </div>
        </div>
      </header>

      {/* ---- Dispatch board ---- */}
      <section className={`bg-[#F2F2EF] py-14 ${PAD}`}>
        <div className="mx-auto max-w-[1180px] overflow-hidden rounded-3xl border border-[#E2E2DF] bg-white" style={{ boxShadow: '0 20px 50px rgba(20,20,20,.07)' }}>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#ECECEA] px-[18px] py-3.5">
            <span className={`flex items-center gap-2 ${mono} text-[11px] tracking-[0.08em]`}>
              <i className="h-2 w-2 rounded-full bg-[#1E9A55]" />
              DISPATCH BOARD · LIVE LANES
            </span>
            <div role="tablist" aria-label="Region" className="flex gap-0.5 rounded-[10px] border border-[#E2E2DF] p-[3px]">
              {REGION_TABS.map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  aria-selected={region === k}
                  onClick={() => setRegion(k)}
                  className={`rounded-lg border-0 px-3 py-1.5 ${mono} text-[11px] tracking-[0.06em]`}
                  style={{ background: region === k ? '#FFCF33' : 'transparent', color: '#151515', minHeight: 32, minWidth: 0 }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 380px), 1fr))' }}>
            <div className="relative min-h-[340px] border-e border-[#ECECEA]">
              <div className="absolute inset-0">
                <LaneMap lanes={lanes} />
              </div>
            </div>
            <div className="flex flex-col">
              {lanes.map((l) => {
                const c = LANE_COLOR[l.status];
                return (
                  <div key={l.name} className="grid grid-cols-[28px_1fr_auto] items-center gap-3.5 border-b border-[#ECECEA] px-[18px] py-4">
                    <span className="grid h-7 w-7 place-items-center rounded-[9px] border border-[#E2E2DF] bg-[#F7F7F6]">
                      <TruckGlyph />
                    </span>
                    <div className="flex min-w-0 flex-col gap-[3px]">
                      <span className="text-[14px] font-semibold">{l.name}</span>
                      <span className={`${mono} text-[10.5px] tracking-[0.04em] text-[#8E8E8A]`}>{l.meta}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="hidden h-1 w-[70px] overflow-hidden rounded-full bg-[#ECECEA] sm:block">
                        <div className="h-full" style={{ width: `${Math.round(l.p * 100)}%`, background: c }} />
                      </div>
                      <span className={`min-w-[84px] ${mono} text-[10.5px] tracking-[0.06em]`} style={{ color: c }}>
                        ● {l.status}
                      </span>
                    </div>
                  </div>
                );
              })}
              <div className={`mt-auto flex flex-wrap justify-between gap-2.5 px-[18px] py-3.5 ${mono} text-[10.5px] tracking-[0.06em] text-[#8E8E8A]`}>
                <span>{BOARD_FOOT[region]}</span>
                <a href="#visibility" className="no-underline" style={ink}>
                  HOW TRACKING WORKS →
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---- 01 Network ---- */}
      <section className={`pt-24 pb-20 ${PAD}`}>
        <div className="mx-auto flex max-w-[1180px] flex-col gap-12">
          <div className="flex flex-col gap-3.5">
            <Eyebrow>01 — THE NETWORK</Eyebrow>
            <Title a="One network," b="measured daily." />
          </div>
          <div className="grid border-t border-[#151515]" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
            {STATS.map((s) => (
              <div key={s.k} className="flex flex-col gap-2.5 pt-[26px] pe-[22px]">
                <span className="text-[clamp(40px,4.6vw,60px)] leading-none font-light tracking-[-0.04em]">
                  {s.v}
                  <span className="ms-1 text-[.4em] font-medium tracking-normal">{s.u}</span>
                </span>
                <span className={`${mono} text-[10.5px] tracking-[0.08em]`}>{s.k}</span>
                <span className="text-[12px] text-[#8E8E8A]">{s.note}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---- 02 Services ---- */}
      <section id="services" className={`scroll-mt-4 bg-[#F7F7F6] py-24 ${PAD}`}>
        <div className="mx-auto flex max-w-[1180px] flex-col gap-9">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="flex flex-col gap-3.5">
              <Eyebrow>02 — SERVICES</Eyebrow>
              <Title a="Five services." b="One dispatch desk." />
            </div>
            <a href="#quote" className={`${mono} text-[11px] tracking-[0.08em] no-underline`} style={ink}>
              ASK FOR A QUOTE →
            </a>
          </div>
          <div className="flex flex-col">
            {SERVICES.map((s) => (
              <a
                key={s.n}
                href="#quote"
                className="grid items-center gap-x-[18px] gap-y-1.5 border-t border-[#E2E2DF] px-1 py-[22px] no-underline hover:bg-white md:grid-cols-[48px_minmax(160px,1.2fr)_minmax(0,2fr)_150px_20px]"
                style={ink}
              >
                <span className={`${mono} text-[11px] text-[#8E8E8A]`}>{s.n}</span>
                <span className="text-[19px] font-semibold tracking-[-0.01em]">{s.name}</span>
                <span className="text-[13px] text-pretty text-[#6E6E6A]">{s.desc}</span>
                <span className={`${mono} text-[10.5px] tracking-[0.06em] text-[#6E6E6A] md:text-end`}>{s.spec}</span>
                <span className="hidden text-[15px] md:inline">→</span>
              </a>
            ))}
            <a
              href={request}
              className="mt-2.5 grid items-center gap-x-[18px] gap-y-1.5 rounded-2xl bg-[#FFCF33] px-[18px] py-6 no-underline hover:opacity-[.92] md:grid-cols-[48px_minmax(160px,1.2fr)_minmax(0,2fr)_150px_20px]"
              style={ink}
            >
              <span className={`${mono} text-[11px]`}>→</span>
              <span className="text-[19px] font-bold tracking-[-0.01em]">Not sure which service?</span>
              <span className="text-[13px]">Tell us the origin, destination and cargo. Our dispatch desk recommends the right fit.</span>
              <span className={`${mono} text-[10.5px] tracking-[0.06em] md:text-end`}>REPLY WITHIN 1 HOUR</span>
              <span className="hidden text-[15px] md:inline">→</span>
            </a>
          </div>
        </div>
      </section>

      {/* ---- 03 How it works ---- */}
      <section id="how" className={`py-24 ${PAD}`}>
        <div className="mx-auto flex max-w-[1180px] flex-col gap-11">
          <div className="flex flex-col gap-3.5">
            <Eyebrow>03 — HOW IT WORKS</Eyebrow>
            <Title a="Quote to delivery," b="in three moves." />
          </div>
          <div className="grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
            {STEPS.map((s) => (
              <div key={s.n} className="flex flex-col gap-3 rounded-[22px] border border-[#ECECEA] bg-white p-6">
                <span className={`grid h-9 w-9 place-items-center rounded-[11px] bg-[#161616] text-[#FFCF33] ${mono} text-[12px]`}>{s.n}</span>
                <span className="text-[18px] font-semibold tracking-[-0.01em]">{s.t}</span>
                <span className="text-[13.5px] leading-[1.55] text-pretty text-[#6E6E6A]">{s.d}</span>
                <a href={s.href === 'request' ? request : s.href} className={`mt-auto pt-2 ${mono} text-[10.5px] tracking-[0.08em] no-underline`} style={ink}>
                  {s.cta} →
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---- 04 Lanes ---- */}
      <section id="lanes" className={`scroll-mt-4 bg-[#F7F7F6] py-24 ${PAD}`}>
        <div className="mx-auto flex max-w-[1180px] flex-col gap-9">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="flex flex-col gap-3.5">
              <Eyebrow>04 — SCHEDULED LANES</Eyebrow>
              <Title a="Lanes that run" b="on a clock." />
            </div>
            <a href="#quote" className={`${mono} text-[11px] tracking-[0.08em] no-underline`} style={ink}>
              ASK ABOUT A LANE →
            </a>
          </div>
          <div className="overflow-x-auto rounded-[20px] border border-[#ECECEA] bg-white">
            <div className="min-w-[720px]">
              <div className={`grid grid-cols-[2fr_1fr_1fr_1fr_1.2fr_80px] gap-3 border-b border-[#ECECEA] px-5 py-3.5 ${mono} text-[10.5px] tracking-[0.08em] text-[#8E8E8A]`}>
                <span>LANE</span>
                <span>COUNTRY</span>
                <span>TRANSIT</span>
                <span>FREQUENCY</span>
                <span>NEXT DEPARTURE</span>
                <span />
              </div>
              {SCHEDULE.map((r) => (
                <div key={r.code} className="grid grid-cols-[2fr_1fr_1fr_1fr_1.2fr_80px] items-center gap-3 border-b border-[#F2F2EF] px-5 py-4 text-[13px]">
                  <span className="flex flex-col gap-0.5">
                    <b className="font-semibold">{r.lane}</b>
                    <span className={`${mono} text-[10px] tracking-[0.06em] text-[#8E8E8A]`}>{r.code}</span>
                  </span>
                  <span className={`flex items-center gap-1.5 ${mono} text-[11px]`}>
                    <i className="h-[7px] w-[7px] rounded-full" style={{ background: r.dot }} />
                    {r.country}
                  </span>
                  <span className={`${mono} text-[11.5px]`}>{r.transit}</span>
                  <span className={`${mono} text-[11.5px]`}>{r.freq}</span>
                  <span className={`${mono} text-[11.5px]`}>{r.next}</span>
                  <a href={request} className={`${mono} text-[11px] no-underline`} style={{ color: '#2F6FE0' }}>
                    Quote →
                  </a>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ---- 05 Visibility ---- */}
      <section id="visibility" className={`scroll-mt-4 py-24 ${PAD}`}>
        <div className="mx-auto grid max-w-[1180px] items-start gap-14" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))' }}>
          <div className="flex flex-col gap-[22px]">
            <Eyebrow>05 — VISIBILITY</Eyebrow>
            <Title a="Every stop visible." b="Every delay flagged early." />
            <p className="m-0 max-w-[480px] text-[15px] leading-[1.6] text-[#6E6E6A]">
              Each load gets a live timeline that our dispatchers and your team see at the same moment. You get the answer to &ldquo;where is my truck?&rdquo; before you need to ask.
            </p>
            <div className="flex flex-col">
              {FEATURES.map((f) => (
                <div key={f.n} className="grid grid-cols-[40px_1fr] gap-3.5 border-t border-[#ECECEA] py-4">
                  <span className={`${mono} pt-0.5 text-[11px] text-[#8E8E8A]`}>{f.n}</span>
                  <div className="flex flex-col gap-1">
                    <span className="text-[15px] font-semibold">{f.t}</span>
                    <span className="text-[13px] text-[#6E6E6A]">{f.d}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className={`overflow-hidden rounded-[22px] bg-[#161616] text-[#E8E8E4] ${mono}`} style={{ boxShadow: '0 30px 60px rgba(20,20,20,.18)' }}>
            <div className="flex justify-between gap-2.5 border-b border-[#2A2A2A] px-[18px] py-3.5 text-[10.5px] tracking-[0.08em] text-[#8A8A86]">
              <span>SAMPLE LOAD · HOUSTON → CHICAGO</span>
              <span className="text-[#FFCF33]">● LIVE</span>
            </div>
            <div className="flex flex-col py-2">
              {LOG.map((e) => (
                <div key={e.t} className="grid grid-cols-[86px_1fr] gap-3 px-[18px] py-3 text-[11.5px] leading-[1.5]" style={{ background: e.hot ? 'rgba(255,207,51,.06)' : 'transparent' }}>
                  <span className="text-[#8A8A86]">{e.t}</span>
                  <div className="flex flex-col gap-0.5">
                    <span style={{ color: e.hot ? '#FFCF33' : e.muted ? '#8A8A86' : '#E8E8E4' }}>{e.ev}</span>
                    <span className="text-[10.5px] text-[#8A8A86]">{e.sub}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-between gap-2.5 border-t border-[#2A2A2A] px-[18px] py-3.5 text-[10.5px] tracking-[0.06em] text-[#8A8A86]">
              <span>Timestamps in local time</span>
              <a href={request} className="no-underline" style={{ color: '#FFCF33' }}>
                Get a tracking link on your load →
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ---- 06 Industries ---- */}
      <section className={`bg-[#F7F7F6] py-24 ${PAD}`}>
        <div className="mx-auto flex max-w-[1180px] flex-col gap-10">
          <div className="flex flex-col gap-3.5">
            <Eyebrow>06 — INDUSTRIES</Eyebrow>
            <Title a="Built for how your" b="goods actually move." />
          </div>
          <div className="grid gap-3.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))' }}>
            {INDUSTRIES.map((i) => (
              <div key={i.code} className="flex flex-col gap-2 rounded-[20px] border border-[#ECECEA] bg-white p-[22px]">
                <div className="flex justify-between">
                  <span className={`${mono} text-[10.5px] tracking-[0.08em] text-[#8E8E8A]`}>{i.code}</span>
                  <span className="text-[13px]">↗</span>
                </div>
                <span className="text-[17px] font-semibold tracking-[-0.01em]">{i.t}</span>
                <span className="text-[13px] text-[#6E6E6A]">{i.d}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---- Quote ---- */}
      <section id="quote" className={`scroll-mt-4 bg-[#161616] py-[110px] text-[#F2F2EF] ${PAD}`}>
        <div className="mx-auto flex max-w-[1180px] flex-col gap-[26px]">
          <Eyebrow light>GET A QUOTE</Eyebrow>
          <h2 className="m-0 max-w-[960px] text-[clamp(40px,6vw,80px)] leading-[1.02] font-bold tracking-[-0.035em] uppercase">
            Book the truck for your <span className="text-[#FFCF33]">next load.</span>
          </h2>
          <p className="m-0 max-w-[520px] text-[15px] leading-[1.6] text-[#B8B8B4]">
            Origin, destination, weight and pickup date are enough for an estimate in under an hour. A dispatcher follows up to lock the rate.
          </p>
          <div className={`flex flex-wrap gap-6 ${mono} text-[10.5px] tracking-[0.08em] text-[#8A8A86]`}>
            <span>RESPONSE · UNDER 1 HOUR</span>
            <span>TRACKING LINK INCLUDED</span>
            <span>NO MINIMUM VOLUME</span>
          </div>
          <div className="flex flex-wrap gap-2.5">
            <a href={request} className="flex h-12 items-center rounded-xl bg-[#FFCF33] px-[22px] text-[14px] font-semibold no-underline hover:opacity-90" style={ink}>
              Start a quote
            </a>
            <a href={telHref(site.phone)} className="flex h-12 items-center rounded-xl border border-[#3A3A3A] px-[22px] text-[14px] font-medium no-underline" style={{ color: '#F2F2EF' }}>
              Talk to dispatch
            </a>
            <Link href="/terms" className="flex h-12 items-center rounded-xl px-2 text-[13px] text-[#8A8A86] underline">
              Delivery terms
            </Link>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
