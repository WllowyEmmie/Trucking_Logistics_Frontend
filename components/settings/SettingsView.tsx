'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { DispatchNav } from '@/components/console/DispatchNav';
import { DispatchMap } from '@/components/map';
import { isRtlLocale, useConfig } from '@/lib/config';
import { formatDistance, formatNumber } from '@/lib/format';

// Operator configuration, read-only. GET /config is read from the API's environment at startup
// and there is no write path (no PUT /config), so this page shows what's in effect and where each
// value is set. TODO(config): make it editable once the API can store config.

/** Fixed sample instant for the preview, so it doesn't tick. */
const SAMPLE = new Date(Date.UTC(2026, 8, 30, 13, 25));

const safe = <T,>(f: () => T, fallback: T): T => {
  try {
    return f();
  } catch {
    return fallback;
  }
};

/**
 * The page scrolls the document under a sticky header whose height changes as it wraps (200% zoom).
 * Keep the root's scroll-padding equal to it, so a focused element never lands underneath.
 */
function useStickyScrollPadding(header: HTMLElement | null) {
  useEffect(() => {
    if (!header) return;
    const root = document.documentElement;
    const ro = new ResizeObserver(() => {
      root.style.scrollPaddingTop = `${header.offsetHeight + 16}px`;
    });
    ro.observe(header);
    return () => {
      ro.disconnect();
      root.style.scrollPaddingTop = '';
    };
  }, [header]);
}

const sectionCls = 'flex flex-col gap-4 rounded-lg border border-border bg-surface-100 p-5';

function Section({ id, title, source, children, strong }: { id: string; title: string; source?: string; children: ReactNode; strong?: boolean }) {
  return (
    <section aria-labelledby={id} className={strong ? sectionCls.replace('border border-border', 'border-2 border-ink') : sectionCls}>
      <div className="flex flex-col gap-1">
        <h2 id={id} className="t-h2 m-0">
          {title}
        </h2>
        {source && <span className="t-body-sm text-ink-muted">{source}</span>}
      </div>
      {children}
    </section>
  );
}

/** One setting: label, value, and the variable that sets it. */
function Rows({ rows }: { rows: [string, ReactNode, string][] }) {
  return (
    <dl className="m-0 flex flex-col">
      {rows.map(([k, v, from]) => (
        <div key={k} className="grid items-baseline gap-x-4 gap-y-0.5 border-t border-divider py-2.5 first:border-t-0 first:pt-0" style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }}>
          <dt className="t-h3">{k}</dt>
          <dd className="t-body m-0 text-end font-semibold wrap-anywhere">{v}</dd>
          <span className="t-mono-sm col-span-2 text-ink-muted">{from}</span>
        </div>
      ))}
    </dl>
  );
}

export function SettingsView() {
  const [header, setHeader] = useState<HTMLElement | null>(null);
  useStickyScrollPadding(header);
  const c = useConfig();

  // ---- Preview, through Intl for the configured language and zone ----
  const loc = safe(() => new Intl.DateTimeFormat(c.locale).resolvedOptions().locale, 'en');
  const rtl = isRtlLocale(c.locale);
  const pv = {
    time: safe(() => new Intl.DateTimeFormat(loc, { timeZone: c.timezone, hour: 'numeric', minute: '2-digit' }).format(SAMPLE), '—'),
    date: safe(
      () => new Intl.DateTimeFormat(loc, { timeZone: c.timezone, weekday: 'long', day: 'numeric', month: 'long', timeZoneName: 'short' }).format(SAMPLE),
      '',
    ),
    dist: formatDistance(9.4, c.units, loc),
    clock: safe(() => new Intl.DateTimeFormat(loc, { timeZone: c.timezone, hour: '2-digit', minute: '2-digit', timeZoneName: 'short' }).format(SAMPLE), ''),
    stale: safe(() => new Intl.NumberFormat(loc, { style: 'unit', unit: 'minute', unitDisplay: 'long' }).format(c.stale_minutes), `${c.stale_minutes} min`),
  };

  const n = (v: number) => formatNumber(v, c.locale);
  const corners = [
    { lat: c.min_lat, lng: c.min_lng },
    { lat: c.min_lat, lng: c.max_lng },
    { lat: c.max_lat, lng: c.max_lng },
    { lat: c.max_lat, lng: c.min_lng },
  ];

  return (
    <div className="flex min-h-dvh flex-col bg-surface-200 text-ink">
      <header ref={setHeader} className="sticky top-0 z-[5] flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-border bg-surface-100 px-6 py-3">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <div className="flex flex-col">
            <span className="t-label text-ink-muted">{c.operator_name} · Dispatch</span>
            <h1 className="t-h1 m-0">Operator configuration</h1>
          </div>
          <DispatchNav current="/console/settings" />
        </div>
        <span className="t-body-sm font-semibold text-ink-muted">Read-only · set where each value says, then restart</span>
      </header>

      <div className="grid max-w-[1360px] gap-6 p-6" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))' }}>
        <div className="flex min-w-0 flex-col gap-6">
          <Section id="s-region" title="Region" source="From the dispatch server (GET /config)">
            <Rows
              rows={[
                ['Distance units', c.units === 'imperial' ? 'Miles' : 'Kilometres', 'OPERATOR_UNITS · metric or imperial'],
                ['Operator time zone', c.timezone, 'OPERATOR_TIMEZONE · IANA name'],
                ['Language and number format', c.language, 'OPERATOR_LANGUAGE · BCP-47, e.g. en-GB'],
              ]}
            />
          </Section>

          <Section id="s-map" title="Map and service area" source="From the dispatch server (GET /config)">
            <Rows
              rows={[
                ['Map centre', `${n(c.center_lat)}, ${n(c.center_lng)}`, 'MAP_CENTER_LAT · MAP_CENTER_LNG'],
                ['Default zoom', n(c.default_zoom), 'MAP_DEFAULT_ZOOM'],
                [
                  'Service area',
                  c.hasServiceArea ? `${n(c.min_lat)} to ${n(c.max_lat)} lat · ${n(c.min_lng)} to ${n(c.max_lng)} lng` : 'Not set: anywhere',
                  'SERVICE_MIN_LAT · SERVICE_MAX_LAT · SERVICE_MIN_LNG · SERVICE_MAX_LNG',
                ],
              ]}
            />
            {!c.hasServiceArea && (
              <p className="t-body-sm m-0 rounded-md border border-status-transit bg-accent-bg px-3 py-2.5">
                No service area is set, so the server accepts stops and GPS positions anywhere in the world. Set the four SERVICE_* values to
                catch swapped latitude and longitude.
              </p>
            )}
            <div className="h-[240px] overflow-hidden rounded-md border border-border">
              <DispatchMap
                center={c.center}
                zoom={c.default_zoom}
                stops={[{ id: 'centre', n: 1, kind: 'pickup', lat: c.center.lat, lng: c.center.lng, done: true, label: 'Map centre' }]}
                route={c.hasServiceArea ? { travelled: [], remaining: [...corners, corners[0]!] } : null}
                note={c.hasServiceArea ? 'Service area outlined' : null}
                fitKey={`${c.center_lat},${c.center_lng},${c.min_lat},${c.max_lat},${c.min_lng},${c.max_lng}`}
                fitPoints={c.hasServiceArea ? corners : [c.center]}
                animateSeconds={0}
                ariaLabel="Map centre and service area"
              />
            </div>
          </Section>

          <Section id="s-org" title="Organisation" source="Set in this frontend's environment: the API doesn't serve these yet">
            <Rows
              rows={[
                ['Name shown to customers', c.operator_name, 'NEXT_PUBLIC_OPERATOR_NAME'],
                ['Customer support phone', c.support_phone || 'Not set', 'NEXT_PUBLIC_SUPPORT_PHONE'],
                ['Dispatch phone (driver app)', c.dispatch_phone || 'Not set', 'NEXT_PUBLIC_DISPATCH_PHONE'],
                ['Depot (new delivery pickup)', c.depot?.address ?? 'Not set', 'NEXT_PUBLIC_DEPOT_ADDRESS · _LAT · _LNG'],
                ['Agent proposals and answers', c.agent_enabled ? 'On' : 'Off', 'NEXT_PUBLIC_AGENT_ENABLED'],
              ]}
            />
          </Section>
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <Section id="s-rules" title="Tracking and exceptions" source="Fixed in this frontend (THRESHOLDS in lib/types.ts): the API can't serve or store them yet">
            <Rows
              rows={[
                ['Truck counts as silent after', `${c.stale_minutes} min`, 'Marker turns hollow and grey; customers see the position age.'],
                ['Flag pending deliveries after', `${c.pending_minutes} min`, 'Only while at least one truck is available.'],
                ['Failed deliveries stay in the exception table for', `${c.failed_window_minutes} min`, 'Then they stay in the list under Failed.'],
                ['Driver position interval', `${c.ping_seconds} s`, 'Markers glide across one interval.'],
              ]}
            />
          </Section>

          <Section id="s-prev" title="Preview with these settings" strong>
            <span className="t-body-sm -mt-2 text-ink-muted">Rendered with Intl for the configured language, zone and units.</span>
            <div dir={rtl ? 'rtl' : 'ltr'} lang={c.locale} className="flex flex-col gap-1 rounded-md bg-surface-200 p-4">
              <span className="t-label text-ink-muted">{c.operator_name} · tracking page</span>
              <span className="t-display">{pv.time}</span>
              <span className="t-body">{pv.dist} away</span>
              <span className="t-body-sm text-ink-muted">{pv.date}</span>
            </div>
            <dl className="t-body-sm m-0 grid gap-x-4 gap-y-1.5" style={{ gridTemplateColumns: 'auto minmax(0,1fr)' }}>
              <dt className="text-ink-muted">Console clock</dt>
              <dd className="t-mono m-0">{pv.clock}</dd>
              <dt className="text-ink-muted">Stale after</dt>
              <dd className="m-0">{pv.stale}</dd>
              <dt className="text-ink-muted">Text direction</dt>
              <dd className="m-0">{rtl ? 'Right to left' : 'Left to right'}</dd>
            </dl>
          </Section>
        </div>
      </div>
    </div>
  );
}
