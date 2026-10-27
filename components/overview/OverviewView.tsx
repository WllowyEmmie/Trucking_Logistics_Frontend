'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight } from 'lucide-react';
import Link from 'next/link';
import { useMemo } from 'react';
import { StatusPill } from '@/components/StatusPill';
import { useSignedInAs } from '@/components/auth/Gate';
import { api } from '@/lib/api';
import { useConfig } from '@/lib/config';
import { useDeliveries, useDrivers } from '@/lib/deliveries';
import { formatTime } from '@/lib/format';
import { zonedDay } from '@/lib/history';
import { usePositions } from '@/lib/positions';
import { useNow } from '@/lib/useNow';

/**
 * The console's Overview, from the design: a greeting with the mix of open deliveries, today's
 * due times, the open deliveries, the on-time record for the last 7 days, 12 weeks of volume and
 * the fleet. Everything is real: the board (/deliveries), the trucks, the drivers and
 * GET /reports/deliveries for the history (counted by the database, not here).
 */

interface Report {
  total: number;
  by_status: Record<string, number>;
  on_time: { on_time: number; late: number; no_due: number };
  by_day: { date: string; created: number; completed: number; cancelled: number; failed: number }[];
}

const card = 'flex min-w-0 flex-col gap-3 rounded-[26px] border border-divider bg-surface-100 p-5';
const OPEN = new Set(['pending', 'assigned', 'in_transit']);

function useReport(from: string, to: string) {
  return useQuery({
    queryKey: ['report', from, to],
    queryFn: () => api<Report>(`/reports/deliveries?from=${from}&to=${to}`),
    staleTime: 5 * 60_000,
  });
}

function greeting(tz: string, now: number): string {
  const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: 'numeric', hourCycle: 'h23' }).format(new Date(now)));
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

function CardHead({ title, href, children }: { title: string; href?: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2.5">
      <span className="flex flex-wrap items-center gap-4 text-[19px] font-medium">
        {title}
        {children}
      </span>
      {href && (
        <Link href={href} aria-label={`Open ${title}`} className="grid h-[34px] w-[34px] place-items-center rounded-full border border-border text-ink no-underline hover:border-ink-subtle" style={{ color: 'var(--ink)' }}>
          <ArrowUpRight size={14} strokeWidth={1.7} aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}

export function OverviewView() {
  const config = useConfig();
  const me = useSignedInAs();
  const tz = config.timezone;
  const now = useNow(60_000);
  const t = (iso: string) => formatTime(iso, tz, config.locale);

  const deliveries = useDeliveries().data ?? [];
  const trucks = usePositions().data ?? [];
  const drivers = useDrivers().data ?? [];
  const today = zonedDay(tz, 0, now);
  const week = useReport(zonedDay(tz, 6, now), today);
  const quarter = useReport(zonedDay(tz, 83, now), today);

  const plate = useMemo(() => new Map(trucks.map((x) => [x.id, x])), [trucks]);
  const driverName = useMemo(() => new Map(drivers.map((d) => [d.id, d.name])), [drivers]);

  const open = deliveries.filter((d) => OPEN.has(d.status));
  const late = open.filter((d) => d.due_by && (Date.parse(d.eta ?? '') > Date.parse(d.due_by) || Date.parse(d.due_by) < now));
  const lateIds = new Set(late.map((d) => d.id));
  const count = (s: string) => open.filter((d) => d.status === s && !lateIds.has(d.id)).length;
  const mix = [
    { label: 'In transit', n: count('in_transit'), bg: 'var(--ink)', fg: 'var(--surface-100)', bd: 'var(--ink)' },
    { label: 'Assigned', n: count('assigned'), bg: 'var(--brand)', fg: 'var(--brand-ink)', bd: 'var(--brand)' },
    { label: 'Pending', n: count('pending'), bg: 'repeating-linear-gradient(135deg,var(--border) 0 2px,transparent 2px 7px)', fg: 'var(--ink)', bd: 'var(--border)' },
    { label: 'Late', n: late.length, bg: 'transparent', fg: 'var(--ink)', bd: 'var(--ink-subtle)' },
  ].filter((m) => m.n > 0);
  const mixTotal = mix.reduce((a, m) => a + m.n, 0);

  const onShift = drivers.filter((d) => d.on_shift).length;
  const moving = trucks.filter((x) => x.status === 'on_delivery').length;
  const idle = trucks.filter((x) => x.status === 'available').length;
  const shop = trucks.length - moving - idle;
  const kpis = [
    { label: 'Open', value: open.length },
    { label: 'On shift', value: onShift },
    { label: 'Trucks', value: trucks.length },
  ];

  // Today's due times, earliest first; late ones stand out.
  const schedule = open
    .filter((d) => d.due_by && zonedDay(tz, 0, Date.parse(d.due_by)) === today)
    .sort((a, b) => Date.parse(a.due_by!) - Date.parse(b.due_by!))
    .slice(0, 7);

  // The week strip: Sunday to Saturday around today.
  const dow = new Date(`${today}T12:00:00Z`).getUTCDay();
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(`${today}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i - dow);
    return { d: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][i]!, n: d.getUTCDate(), on: i === dow };
  });

  // On time, last 7 days: one dot per completed delivery (at most 48).
  const ot = week.data?.on_time;
  const judged = ot ? ot.on_time + ot.late : 0;
  const pct = judged ? Math.round((ot!.on_time / judged) * 100) : null;
  const dots = ot
    ? [...Array(ot.on_time).fill('var(--brand)'), ...Array(ot.late).fill('#ff6b6b'), ...Array(ot.no_due).fill('#3a3a3a')].slice(0, 48)
    : [];

  // Volume: 12 weeks of created (dashed) and completed (accent).
  const weeks = useMemo(() => {
    const byDay = quarter.data?.by_day ?? [];
    return Array.from({ length: 12 }, (_, w) => {
      const slice = byDay.slice(w * 7, w * 7 + 7);
      return { created: slice.reduce((a, x) => a + x.created, 0), completed: slice.reduce((a, x) => a + x.completed, 0) };
    });
  }, [quarter.data]);
  const vMax = Math.max(1, ...weeks.map((w) => Math.max(w.created, w.completed)));
  const path = (k: 'created' | 'completed') =>
    weeks.map((w, i) => `${i ? 'L' : 'M'}${((i * 600) / 11).toFixed(1)} ${(150 - (w[k] / vMax) * 130).toFixed(1)}`).join(' ');
  const best = weeks.reduce((bi, w, i) => (w.completed > weeks[bi]!.completed ? i : bi), 0);

  // Fleet ring.
  const C = 2 * Math.PI * 60;
  const fA = trucks.length ? moving / trucks.length : 0;
  const fB = trucks.length ? shop / trucks.length : 0;
  const seg = (f: number) => `${Math.max(0, C * f - (f > 0 && f < 1 ? 8 : 0)).toFixed(1)} ${C.toFixed(1)}`;

  return (
    <div className="flex min-h-full flex-col gap-6 p-5 sm:p-[30px]" style={{ background: 'radial-gradient(120% 80% at 100% 0%, var(--accent-bg) 0%, var(--surface-100) 55%)' }}>
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div className="flex max-w-[680px] min-w-[min(100%,320px)] flex-1 flex-col gap-[18px]">
          <h1 className="m-0 text-[clamp(32px,4vw,44px)] font-light tracking-[-0.02em]">
            {greeting(tz, now)}, {me.name.split(/\s+/)[0]}
          </h1>
          {mixTotal > 0 ? (
            <div className="flex items-end gap-1.5" aria-label="Open deliveries by state">
              {mix.map((m) => (
                <div key={m.label} className="flex min-w-[58px] flex-col gap-[7px]" style={{ flex: m.n }}>
                  <span className="text-[12px] whitespace-nowrap text-ink-muted">{m.label}</span>
                  <div className="flex h-10 items-center rounded-full border px-3.5 text-[12px] font-medium" style={{ background: m.bg, color: m.fg, borderColor: m.bd }}>
                    {Math.round((m.n / mixTotal) * 100)}%
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <span className="text-[14px] text-ink-muted">No open deliveries right now.</span>
          )}
        </div>
        <div className="flex gap-[34px]">
          {kpis.map((k) => (
            <div key={k.label} className="flex items-end gap-2.5">
              <span className="pb-2 text-[11.5px] text-ink-muted">{k.label}</span>
              <span className="text-[58px] leading-none font-light tracking-[-0.03em] tabular-nums">{k.value}</span>
            </div>
          ))}
        </div>
      </header>

      <section className="grid gap-3.5 min-[1100px]:grid-cols-[minmax(240px,1fr)_minmax(0,2.1fr)_minmax(240px,1fr)]">
        {/* Schedule */}
        <div className={`${card} gap-4 min-[1100px]:row-span-2`}>
          <CardHead title="Due today" href="/console" />
          <div className="grid grid-cols-7 text-center">
            {days.map((w) => (
              <div key={w.d} className="flex flex-col gap-0.5" style={{ color: w.on ? 'var(--ink)' : 'var(--ink-muted)' }}>
                <span className="text-[11px]">{w.d}</span>
                <span className="text-[18px]" style={{ fontWeight: w.on ? 600 : 300 }}>
                  {w.n}
                </span>
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-2.5">
            {schedule.length === 0 && <span className="text-[13px] text-ink-muted">Nothing is due today.</span>}
            {schedule.map((d) => {
              const hot = lateIds.has(d.id);
              return (
                <Link key={d.id} href={`/console?d=${d.id}`} className="grid grid-cols-[58px_1fr] items-start gap-2.5 no-underline" style={{ color: 'var(--ink)' }}>
                  <span
                    className="justify-self-start rounded-full border px-2 py-1 text-[11.5px] tabular-nums"
                    style={hot ? { background: 'var(--brand)', borderColor: 'var(--brand)', color: 'var(--brand-ink)' } : { borderColor: 'var(--border)' }}
                  >
                    {t(d.due_by!)}
                  </span>
                  <span
                    className="flex flex-col gap-0.5 rounded-[14px] border px-3 py-2.5"
                    style={hot ? { background: 'var(--ink)', color: 'var(--surface-100)', borderColor: 'var(--ink)' } : { background: 'var(--surface-200)', borderColor: 'var(--divider)' }}
                  >
                    <span className="text-[13px] font-medium">
                      {hot ? 'Running late' : 'Due'} · {d.reference}
                    </span>
                    <span className="text-[11px] opacity-65">{d.customer_name}</span>
                  </span>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Open deliveries */}
        <div className={card}>
          <div className="flex items-center justify-between gap-2.5">
            <span className="text-[19px] font-medium">Open deliveries</span>
            <Link href="/console" className="inline-flex h-[34px] items-center gap-1.5 rounded-full border border-border px-3.5 text-[12.5px] no-underline hover:border-ink-subtle" style={{ color: 'var(--ink)' }}>
              Open dispatch <ArrowUpRight size={13} aria-hidden="true" />
            </Link>
          </div>
          <div className="overflow-x-auto">
            <div className="min-w-[560px]">
              <div className="grid grid-cols-[1fr_1.4fr_1fr_1.1fr_0.8fr_1fr] gap-2.5 border-b border-dashed border-border px-2.5 py-2 text-[11.5px] text-ink-muted">
                <span>Delivery</span>
                <span>Customer</span>
                <span>Truck</span>
                <span>Driver</span>
                <span>Due</span>
                <span>Status</span>
              </div>
              {open.length === 0 && <div className="px-2.5 py-4 text-[13px] text-ink-muted">Nothing open.</div>}
              {open.slice(0, 8).map((d) => {
                const tr = d.truck_id ? plate.get(d.truck_id) : undefined;
                const dn = tr?.driver_id ? driverName.get(tr.driver_id) : undefined;
                return (
                  <Link
                    key={d.id}
                    href={`/console?d=${d.id}`}
                    className="grid grid-cols-[1fr_1.4fr_1fr_1.1fr_0.8fr_1fr] items-center gap-2.5 rounded-xl px-2.5 py-2 text-[12.5px] no-underline hover:bg-surface-200"
                    style={{ color: 'var(--ink)' }}
                  >
                    <span className="t-mono font-medium">{d.reference}</span>
                    <span className="truncate">{d.customer_name}</span>
                    <span className="t-mono truncate">{tr?.plate_number ?? '—'}</span>
                    <span className="truncate">{dn ?? '—'}</span>
                    <span className="tabular-nums" style={{ color: lateIds.has(d.id) ? 'var(--attention)' : undefined }}>
                      {d.due_by ? t(d.due_by) : '—'}
                    </span>
                    <span>
                      <StatusPill status={d.status} size="sm" />
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>

        {/* On time, last 7 days */}
        <div className="flex flex-col gap-3.5 rounded-[26px] border border-[#262626] bg-[#151515] p-5 text-[#f2f2ef]">
          <div className="flex items-center justify-between">
            <span className="text-[19px] font-medium">On-time report</span>
            <Link href="/console/history" aria-label="Open history" className="grid h-[34px] w-[34px] place-items-center rounded-full bg-[#2a2a2a] no-underline" style={{ color: '#f2f2ef' }}>
              <ArrowUpRight size={14} strokeWidth={1.7} aria-hidden="true" />
            </Link>
          </div>
          <div className="flex items-baseline gap-[18px]">
            <span className="text-[36px] font-light">{pct === null ? '—' : `${pct}%`}</span>
            <span className="text-[36px] font-light">
              {ot?.late ?? 0}
              <span className="text-[15px] text-[#8a8a86]"> late</span>
            </span>
          </div>
          <div className="mt-auto grid grid-cols-12 gap-[5px]">
            {dots.map((c, i) => (
              <i key={i} className="aspect-square rounded-full" style={{ background: c }} />
            ))}
          </div>
          <span className="text-[11px] text-[#8a8a86]">
            {week.isError ? "Couldn't load the last 7 days." : dots.length ? 'Each dot is one completed delivery, last 7 days' : 'No completed deliveries in the last 7 days'}
          </span>
        </div>

        {/* Volume */}
        <div className={card}>
          <CardHead title="Delivery volume">
            <span className="flex items-center gap-1.5 text-[12px] text-ink-muted">
              <i className="h-2 w-2 rounded-full bg-brand" />
              Completed
            </span>
            <span className="flex items-center gap-1.5 text-[12px] text-ink-muted">
              <i className="h-2 w-2 rounded-full bg-ink" />
              Booked
            </span>
          </CardHead>
          <div className="relative h-[170px]">
            <svg width="100%" height="100%" viewBox="0 0 600 170" preserveAspectRatio="none" className="block overflow-visible" aria-label="Deliveries per week, last 12 weeks">
              {[20, 75, 130].map((y) => (
                <line key={y} x1="0" x2="600" y1={y} y2={y} stroke="var(--divider)" vectorEffect="non-scaling-stroke" />
              ))}
              {quarter.data && (
                <>
                  <line x1={(best * 600) / 11} x2={(best * 600) / 11} y1="0" y2="150" stroke="var(--ink)" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
                  <path d={path('created')} fill="none" stroke="var(--ink)" strokeWidth="2" strokeDasharray="2 5" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                  <path d={path('completed')} fill="none" stroke="var(--brand)" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
                </>
              )}
            </svg>
            {quarter.data && (
              <span
                className="absolute -top-1 -translate-x-1/2 rounded-full bg-ink px-2.5 py-1 text-[11px] whitespace-nowrap text-surface-100"
                style={{ left: `${Math.min(92, Math.max(8, (best / 11) * 100))}%` }}
              >
                Wk {best + 1} · {weeks[best]!.completed} completed
              </span>
            )}
            {quarter.isError && <span className="absolute inset-0 grid place-items-center text-[13px] text-ink-muted">Couldn&apos;t load the report.</span>}
          </div>
          <div className="grid grid-cols-12 text-center text-[11px] text-ink-muted">
            {weeks.map((_, i) => (
              <span key={i}>W{i + 1}</span>
            ))}
          </div>
        </div>

        {/* Fleet */}
        <div className={`${card} items-center`}>
          <span className="self-stretch text-[19px] font-medium">Fleet status</span>
          <div className="relative h-[150px] w-[150px]">
            <svg width="150" height="150" viewBox="0 0 150 150" aria-hidden="true">
              <circle cx="75" cy="75" r="60" fill="none" stroke="var(--border)" strokeWidth="12" />
              {fA > 0 && <circle cx="75" cy="75" r="60" fill="none" stroke="var(--brand)" strokeWidth="12" strokeLinecap="round" strokeDasharray={seg(fA)} transform="rotate(-90 75 75)" />}
              {fB > 0 && (
                <circle cx="75" cy="75" r="60" fill="none" stroke="var(--ink)" strokeWidth="12" strokeLinecap="round" strokeDasharray={seg(fB)} strokeDashoffset={(-C * fA).toFixed(1)} transform="rotate(-90 75 75)" />
              )}
            </svg>
            <div className="absolute inset-0 grid place-content-center text-center">
              <span className="text-[34px] leading-none font-light">{trucks.length}</span>
              <span className="text-[11px] text-ink-muted">Trucks</span>
            </div>
          </div>
          <div className="flex flex-wrap justify-center gap-4 text-[12.5px]">
            <span className="flex items-center gap-1.5">
              <i className="h-2 w-2 rounded-full bg-brand" />
              {moving} moving
            </span>
            <span className="flex items-center gap-1.5">
              <i className="h-2 w-2 rounded-full bg-ink" />
              {shop} off road
            </span>
            <span className="flex items-center gap-1.5">
              <i className="h-2 w-2 rounded-full" style={{ background: 'var(--border)' }} />
              {idle} free
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
