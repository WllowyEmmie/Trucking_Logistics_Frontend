'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { DispatchNav } from '@/components/console/DispatchNav';
import { DispatchMap } from '@/components/map';
import { isConflict, put } from '@/lib/api';
import { CONFIG_KEY, isRtlLocale, useConfig } from '@/lib/config';
import { formatTime } from '@/lib/format';
import type { Config } from '@/lib/types';

const LOCALES: [string, string][] = [
  ['en-GB', 'English (UK)'],
  ['en-US', 'English (US)'],
  ['fr-FR', 'Français'],
  ['pt-BR', 'Português (Brasil)'],
  ['id-ID', 'Bahasa Indonesia'],
  ['yo-NG', 'Yorùbá'],
  ['ar-EG', 'العربية'],
];
const ZONES = ['Europe/London', 'America/Chicago', 'America/New_York', 'Africa/Lagos', 'Asia/Jakarta', 'Asia/Dubai', 'America/Sao_Paulo'];
/** Fixed sample instant for the preview, so it doesn't tick. */
const SAMPLE = new Date(Date.UTC(2026, 8, 30, 13, 25));

/** Everything editable, as the inputs hold it. */
interface Draft {
  name: string;
  phone: string;
  locale: string;
  tz: string;
  units: 'km' | 'mi';
  lat: string;
  lng: string;
  radius: string;
  stale: string;
  pending: string;
  failedWindow: string;
  ping: string;
  agent: boolean;
}
type NumKey = 'lat' | 'lng' | 'radius' | 'stale' | 'pending' | 'failedWindow' | 'ping';

const toDraft = (c: Config): Draft => ({
  name: c.operator_name,
  phone: c.support_phone,
  locale: c.locale,
  tz: c.timezone,
  units: c.units,
  lat: String(c.map_center.lat),
  lng: String(c.map_center.lng),
  radius: String(c.service_radius),
  stale: String(c.stale_minutes),
  pending: String(c.pending_minutes),
  failedWindow: String(c.failed_window_minutes),
  ping: String(c.ping_seconds),
  agent: c.agent_enabled,
});

const fromDraft = (d: Draft, base: Config): Config => ({
  ...base,
  operator_name: d.name.trim(),
  support_phone: d.phone.trim(),
  locale: d.locale,
  timezone: d.tz,
  units: d.units,
  map_center: { lat: Number(d.lat), lng: Number(d.lng) },
  service_radius: Number(d.radius),
  stale_minutes: Number(d.stale),
  pending_minutes: Number(d.pending),
  failed_window_minutes: Number(d.failedWindow),
  ping_seconds: Number(d.ping),
  agent_enabled: d.agent,
});

const sameDraft = (a: Draft, b: Draft) => (Object.keys(a) as (keyof Draft)[]).every((k) => a[k] === b[k]);

function validate(d: Draft): Partial<Record<keyof Draft, string>> {
  const e: Partial<Record<keyof Draft, string>> = {};
  const num = (k: NumKey, min: number, max: number, int: boolean, msg: string) => {
    const s = d[k].trim();
    const n = Number(s);
    if (!s || !Number.isFinite(n) || n < min || n > max || (int && !Number.isInteger(n))) e[k] = msg;
  };
  if (!d.name.trim()) e.name = 'Enter the name customers see';
  num('lat', -90, 90, false, 'A latitude between -90 and 90');
  num('lng', -180, 180, false, 'A longitude between -180 and 180');
  num('radius', 1, 1000, false, 'A radius above 0');
  num('stale', 1, 240, true, 'Whole minutes, 1–240');
  num('pending', 1, 1440, true, 'Whole minutes, 1–1440');
  num('failedWindow', 1, 1440, true, 'Whole minutes, 1–1440');
  num('ping', 5, 300, true, 'Whole seconds, 5–300');
  return e;
}

const safe = <T,>(f: () => T, fallback: T): T => {
  try {
    return f();
  } catch {
    return fallback;
  }
};

const fieldCls = (err?: boolean, mono?: boolean) =>
  `min-h-11 rounded-md bg-surface-100 px-3 text-ink ${mono ? 'font-mono text-[14px]' : 'text-[15px]'} ${
    err ? 'border-2 border-attention' : 'border border-border'
  }`;
const sectionCls = 'flex flex-col gap-4 rounded-lg border border-border bg-surface-100 p-5';

function Err({ id, msg }: { id: string; msg?: string }) {
  return msg ? (
    <span id={id} className="t-body-sm font-semibold text-attention">
      {msg}
    </span>
  ) : null;
}

function Section({ id, title, children, strong }: { id: string; title: string; children: ReactNode; strong?: boolean }) {
  return (
    <section aria-labelledby={id} className={strong ? sectionCls.replace('border border-border', 'border-2 border-ink') : sectionCls}>
      <h2 id={id} className="t-h2 m-0">
        {title}
      </h2>
      {children}
    </section>
  );
}

/**
 * The page scrolls the document under a sticky header whose height changes as it wraps (200% zoom).
 * Keep the root's scroll-padding equal to it, so a focused field never lands underneath.
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

export function SettingsView() {
  const [header, setHeader] = useState<HTMLElement | null>(null);
  useStickyScrollPadding(header);
  const saved = useConfig();
  const qc = useQueryClient();
  const base = toDraft(saved);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [errs, setErrs] = useState<Partial<Record<keyof Draft, string>>>({});
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const d = draft ?? base;
  const clean = sameDraft(d, base);
  const set = (p: Partial<Draft>) => {
    setDraft({ ...d, ...p });
    setErrs((e) => {
      const c = { ...e };
      for (const k of Object.keys(p)) delete c[k as keyof Draft];
      return c;
    });
    save.reset();
  };

  // TODO(config): confirm PUT /config with the backend.
  const save = useMutation({
    mutationFn: (c: Config) => put<Partial<Config>>('/config', c),
    onSuccess: (res, c) => {
      qc.setQueryData(CONFIG_KEY, { ...c, ...res });
      setDraft(null);
      setSavedAt(formatTime(new Date(), c.timezone, c.locale));
    },
  });

  function onSave() {
    const e = validate(d);
    setErrs(e);
    if (Object.keys(e).length === 0) save.mutate(fromDraft(d, saved));
  }
  function onDiscard() {
    setDraft(null);
    setErrs({});
    save.reset();
  }

  // ---- Preview, through Intl for the chosen locale and zone ----
  const loc = safe(() => new Intl.DateTimeFormat(d.locale).resolvedOptions().locale, 'en-GB');
  const rtl = isRtlLocale(d.locale);
  const distV = d.units === 'km' ? 9.4 : 5.8;
  const pv = {
    time: safe(() => new Intl.DateTimeFormat(loc, { timeZone: d.tz, hour: 'numeric', minute: '2-digit' }).format(SAMPLE), '—'),
    date: safe(
      () => new Intl.DateTimeFormat(loc, { timeZone: d.tz, weekday: 'long', day: 'numeric', month: 'long', timeZoneName: 'short' }).format(SAMPLE),
      '',
    ),
    dist: safe(
      () =>
        new Intl.NumberFormat(loc, { style: 'unit', unit: d.units === 'km' ? 'kilometer' : 'mile', unitDisplay: 'short', maximumFractionDigits: 1 }).format(
          distV,
        ),
      `${distV} ${d.units}`,
    ),
    clock: safe(() => new Intl.DateTimeFormat(loc, { timeZone: d.tz, hour: '2-digit', minute: '2-digit', timeZoneName: 'short' }).format(SAMPLE), ''),
    stale: safe(() => new Intl.NumberFormat(loc, { style: 'unit', unit: 'minute', unitDisplay: 'long' }).format(Number(d.stale) || 0), `${d.stale} min`),
  };

  const lat = Number(d.lat);
  const lng = Number(d.lng);
  const centreOk = !errs.lat && !errs.lng && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && d.lat.trim() !== '' && d.lng.trim() !== '';
  const centre = centreOk ? { lat, lng } : saved.map_center;

  const rules: [NumKey, string, string, string][] = [
    ['stale', 'Truck counts as silent after', 'min', 'Marker turns hollow and grey; customers see "position is N minutes old".'],
    ['pending', 'Flag pending deliveries after', 'min', 'Only while at least one truck is available.'],
    ['failedWindow', 'Keep failed deliveries in the exception table for', 'min', 'Then they stay in the list under Failed.'],
    ['ping', 'Driver position interval', 's', 'Markers glide across one interval, so a shorter interval means less lag.'],
  ];

  const statusText = !clean ? 'Unsaved changes' : savedAt ? `Saved ${savedAt}` : 'No unsaved changes';
  const hasErrs = Object.keys(errs).length > 0;

  return (
    <div className="flex min-h-dvh flex-col bg-surface-200 text-ink">
      <header ref={setHeader} className="sticky top-0 z-[5] flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-border bg-surface-100 px-6 py-3">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <div className="flex flex-col">
            <span className="t-label text-ink-muted">{saved.operator_name} · Dispatch</span>
            <h1 className="t-h1 m-0">Operator configuration</h1>
          </div>
          <DispatchNav current="/console/settings" />
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <span role="status" className="t-body-sm font-semibold" style={{ color: clean ? 'var(--ink-muted)' : 'var(--status-transit)' }}>
            {statusText}
          </span>
          <button
            type="button"
            onClick={onDiscard}
            disabled={clean}
            className="min-h-11 rounded-md border border-border bg-surface-100 px-4 text-[14px] font-semibold text-ink disabled:opacity-45"
          >
            Discard
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={clean || save.isPending}
            className="min-h-11 rounded-md border-0 bg-ink px-5 text-[14px] font-semibold text-surface-100 disabled:opacity-45"
          >
            {save.isPending ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </header>

      {(save.isError || hasErrs) && (
        <div role="alert" className="mx-6 mt-6 flex max-w-[1312px] flex-col gap-1 rounded-md border border-status-failed bg-status-failed-bg px-3 py-2.5">
          <span className="t-body-sm font-bold">Not saved</span>
          {save.isError ? (
            <span className="t-mono">{isConflict(save.error) ? `409 · ${save.error.message}` : save.error.message}</span>
          ) : (
            <span className="t-body-sm">Fix the highlighted fields, then save again.</span>
          )}
        </div>
      )}

      <div className="grid max-w-[1360px] gap-6 p-6" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))' }}>
        <div className="flex min-w-0 flex-col gap-6">
          <Section id="s-org" title="Organisation">
            <label className="flex flex-col gap-1.5">
              <span className="t-h3">Name shown to customers</span>
              <input
                value={d.name}
                onChange={(e) => set({ name: e.target.value })}
                aria-invalid={!!errs.name}
                aria-describedby={errs.name ? 'e-name' : undefined}
                className={fieldCls(!!errs.name)}
              />
              <Err id="e-name" msg={errs.name} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="t-h3">Customer support phone</span>
              <input value={d.phone} onChange={(e) => set({ phone: e.target.value })} type="tel" className={fieldCls()} aria-describedby="h-phone" />
              <span id="h-phone" className="t-body-sm text-ink-muted">
                Shown on tracking pages and failed-delivery notices.
              </span>
            </label>
          </Section>

          <Section id="s-region" title="Region">
            <label className="flex flex-col gap-1.5">
              <span className="t-h3">Language and number format</span>
              <select value={d.locale} onChange={(e) => set({ locale: e.target.value })} className={fieldCls()}>
                {LOCALES.map(([v, l]) => (
                  <option key={v} value={v} lang={v}>
                    {l}
                  </option>
                ))}
                {!LOCALES.some(([v]) => v === d.locale) && <option value={d.locale}>{d.locale}</option>}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="t-h3">Operator time zone</span>
              <select value={d.tz} onChange={(e) => set({ tz: e.target.value })} className={fieldCls()} aria-describedby="h-tz">
                {(ZONES.includes(d.tz) ? ZONES : [d.tz, ...ZONES]).map((z) => (
                  <option key={z} value={z}>
                    {z}
                  </option>
                ))}
              </select>
              <span id="h-tz" className="t-body-sm text-ink-muted">
                Console times use this zone. Customers always see their own zone, marked when it differs.
              </span>
            </label>
            <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
              <legend className="t-h3 mb-1.5 p-0">Distance units</legend>
              <div role="radiogroup" aria-label="Distance units" className="flex flex-wrap gap-2">
                {(
                  [
                    ['km', 'Kilometres'],
                    ['mi', 'Miles'],
                  ] as const
                ).map(([k, l]) => (
                  <button
                    key={k}
                    type="button"
                    role="radio"
                    aria-checked={d.units === k}
                    onClick={() => set({ units: k })}
                    className={`min-h-11 rounded-full px-4 text-[14px] font-semibold ${
                      d.units === k ? 'border-2 border-ink bg-ink text-surface-100' : 'border border-border bg-surface-100 text-ink'
                    }`}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </fieldset>
          </Section>

          <Section id="s-map" title="Map and service area">
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
              {(
                [
                  ['lat', 'Centre latitude', 'decimal'],
                  ['lng', 'Centre longitude', 'decimal'],
                  ['radius', `Service radius (${d.units})`, 'decimal'],
                ] as const
              ).map(([k, label, mode]) => (
                <label key={k} className="flex flex-col gap-1.5">
                  <span className="t-h3">{label}</span>
                  <input
                    value={d[k]}
                    onChange={(e) => set({ [k]: e.target.value })}
                    inputMode={mode}
                    aria-invalid={!!errs[k]}
                    aria-describedby={errs[k] ? `e-${k}` : undefined}
                    className={fieldCls(!!errs[k], true)}
                  />
                  <Err id={`e-${k}`} msg={errs[k]} />
                </label>
              ))}
            </div>
            <div className="h-[220px] overflow-hidden rounded-md border border-border">
              <DispatchMap
                center={centre}
                zoom={9}
                stops={[{ id: 'centre', n: 1, kind: 'pickup', lat: centre.lat, lng: centre.lng, done: true, label: 'Map centre' }]}
                note={`Service area: ${d.radius} ${d.units} around ${d.lat}, ${d.lng}`}
                fitKey={`${centre.lat},${centre.lng}`}
                fitPoints={[centre]}
                animateSeconds={0}
                ariaLabel="Map centre preview"
              />
            </div>
          </Section>
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <Section id="s-rules" title="Tracking and exceptions">
            {rules.map(([k, label, unit, help]) => (
              <div key={k} className="grid items-center gap-x-4 gap-y-1" style={{ gridTemplateColumns: 'minmax(0,1fr) 120px' }}>
                <label htmlFor={`r-${k}`} className="t-h3">
                  {label}
                </label>
                <span className="row-span-2 flex items-center gap-2">
                  <input
                    id={`r-${k}`}
                    value={d[k]}
                    onChange={(e) => set({ [k]: e.target.value })}
                    inputMode="numeric"
                    aria-invalid={!!errs[k]}
                    aria-describedby={`h-${k}`}
                    className={`${fieldCls(!!errs[k], true)} w-[72px] px-2.5`}
                  />
                  <span className="t-body-sm">{unit}</span>
                </span>
                <span id={`h-${k}`} className={`t-body-sm ${errs[k] ? 'font-semibold text-attention' : 'text-ink-muted'}`}>
                  {errs[k] ?? help}
                </span>
              </div>
            ))}
            <label className="flex cursor-pointer items-start gap-3 border-t border-divider pt-3">
              <input
                type="checkbox"
                checked={d.agent}
                onChange={(e) => set({ agent: e.target.checked })}
                className="m-[11px] h-[22px] w-[22px] flex-none"
                style={{ accentColor: 'var(--agent)' }}
              />
              <span className="flex flex-col gap-0.5 pt-2.5">
                <span className="t-h3">Agent proposals and answers</span>
                <span className="t-body-sm text-ink-muted">
                  The agent can raise exceptions, answer questions and propose changes in the console. It never acts without a dispatcher&apos;s
                  approval, and never contacts drivers or customers.
                </span>
              </span>
            </label>
          </Section>

          <Section id="s-prev" title="Preview with these settings" strong>
            <span className="t-body-sm -mt-1 text-ink-muted">Rendered with Intl for the chosen locale, zone and units.</span>
            <div dir={rtl ? 'rtl' : 'ltr'} lang={d.locale} className="flex flex-col gap-1 rounded-md bg-surface-200 p-4">
              <span className="t-label text-ink-muted">{d.name || saved.operator_name} · tracking page</span>
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
