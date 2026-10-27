'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Building2, FileSignature, Globe2, Map as MapIcon, Palette, Plus, Search, SlidersHorizontal, Trash2, X } from 'lucide-react';
import { createContext, useContext, useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { AddressFinder } from '@/components/console/AddressFinder';
import { btnPrimary, btnSecondary, inputCls, textareaCls } from '@/components/console/ui';
import { DispatchMap } from '@/components/map';
import { PhoneInput } from '@/components/PhoneInput';
import { api, ApiError, post } from '@/lib/api';
import { CONFIG_KEY, isRtlLocale, toAppConfig, useConfig, type AppConfig } from '@/lib/config';
import { COUNTRY_PRESETS, countryPreset, LANGUAGES, presetValues, timeZones } from '@/lib/countries';
import { formatDistance } from '@/lib/format';
import { defaultPhoneCountry, phoneProblem, splitE164, toE164, type PhoneValue } from '@/lib/phone';
import { setThemePref, useThemePref, type ThemePref } from '@/lib/theme';
import type { Config } from '@/lib/types';

// Settings, laid out like a browser's: sections down the left, a search box that narrows the
// rows, and one Save for the lot. Everything except Appearance is stored by the API and applies
// to everyone at once, without a restart.

/** Fixed sample instant for the preview, so it doesn't tick. */
const SAMPLE = new Date(Date.UTC(2026, 8, 30, 13, 25));

const safe = <T,>(f: () => T, fallback: T): T => {
  try {
    return f();
  } catch {
    return fallback;
  }
};

// ---------------------------------------------------------------- draft

const NUMS = [
  'center_lat',
  'center_lng',
  'default_zoom',
  'min_lat',
  'max_lat',
  'min_lng',
  'max_lng',
  'stale_minutes',
  'pending_minutes',
  'failed_window_minutes',
  'ping_seconds',
  'eta_speed_kph',
  'stop_minutes',
  'board_hours',
  'auto_radius_km',
  'price_base',
  'price_per_km',
  'price_minimum',
] as const;
type NumKey = (typeof NUMS)[number];

/** What the form holds: numbers as typed, phones in two parts. */
type Draft = Record<NumKey, string> & {
  country: string;
  units: 'metric' | 'imperial';
  timezone: string;
  language: string;
  limit_area: boolean;
  operator_name: string;
  support_phone: PhoneValue;
  dispatch_phone: PhoneValue;
  depot: { address: string; lat: number; lng: number } | null;
  /** The depot box's text: kept apart so typing doesn't lose the picked coordinates until saved. */
  depot_text: string;
  agent_enabled: boolean;
  auto_assign: boolean;
  booking_enabled: boolean;
  dispatch_email: string;
  pod_photo_required: boolean;
  pod_signature_required: boolean;
  customer_terms: string;
  customer_faq: { q: string; a: string }[];
};

function fromConfig(c: AppConfig): Draft {
  const home = c.country || defaultPhoneCountry(c);
  const nums = Object.fromEntries(NUMS.map((k) => [k, String(c[k])])) as Record<NumKey, string>;
  return {
    ...nums,
    country: c.country,
    units: c.units,
    timezone: c.timezone,
    language: c.language,
    limit_area: c.hasServiceArea,
    operator_name: c.operator_name,
    support_phone: c.support_phone ? splitE164(c.support_phone, home) : { country: home, national: '' },
    dispatch_phone: c.dispatch_phone ? splitE164(c.dispatch_phone, home) : { country: home, national: '' },
    depot: c.depot,
    depot_text: c.depot?.address ?? '',
    agent_enabled: c.agent_enabled,
    auto_assign: c.auto_assign,
    booking_enabled: c.booking_enabled,
    dispatch_email: c.dispatch_email,
    pod_photo_required: c.pod_photo_required,
    pod_signature_required: c.pod_signature_required,
    customer_terms: c.customer_terms,
    customer_faq: c.customer_faq.map((x) => ({ ...x })),
  };
}

const num = (s: string) => (s.trim() === '' ? NaN : Number(s));

type Problems = Partial<Record<string, string>>;

/** The same checks as the API's, worded the same, so most mistakes show before Save. */
function check(d: Draft): Problems {
  const p: Problems = {};
  const n = Object.fromEntries(NUMS.map((k) => [k, num(d[k])])) as Record<NumKey, number>;
  const int = (k: NumKey, lo: number, hi: number, msg: string) => {
    if (!Number.isInteger(n[k]) || n[k] < lo || n[k] > hi) p[k] = msg;
  };
  if (!d.timezone) p.timezone = 'Choose a time zone';
  if (!/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(d.language)) p.language = 'Language must look like en-NG';
  if (!Number.isFinite(n.center_lat) || n.center_lat < -90 || n.center_lat > 90) p.center_lat = 'Latitude is -90 to 90';
  if (!Number.isFinite(n.center_lng) || n.center_lng < -180 || n.center_lng > 180) p.center_lng = 'Longitude is -180 to 180';
  int('default_zoom', 1, 19, 'Zoom is 1 to 19');
  if (d.limit_area) {
    if (!Number.isFinite(n.min_lat) || n.min_lat < -90) p.min_lat = 'South edge: -90 to 90';
    if (!Number.isFinite(n.max_lat) || n.max_lat > 90) p.max_lat = 'North edge: -90 to 90';
    if (!Number.isFinite(n.min_lng) || n.min_lng < -180) p.min_lng = 'West edge: -180 to 180';
    if (!Number.isFinite(n.max_lng) || n.max_lng > 180) p.max_lng = 'East edge: -180 to 180';
    if (!p.min_lat && !p.max_lat && n.min_lat >= n.max_lat) p.max_lat = 'North must be greater than south';
    if (!p.min_lng && !p.max_lng && n.min_lng >= n.max_lng) p.max_lng = 'East must be greater than west';
    const boxOk = !p.min_lat && !p.max_lat && !p.min_lng && !p.max_lng;
    const inside = (lat: number, lng: number) => lat >= n.min_lat && lat <= n.max_lat && lng >= n.min_lng && lng <= n.max_lng;
    if (boxOk && !p.center_lat && !p.center_lng && !inside(n.center_lat, n.center_lng)) p.center_lat = 'The map centre must be inside the service area';
    if (boxOk && d.depot && !inside(d.depot.lat, d.depot.lng)) p.depot = 'The depot must be inside the service area';
  }
  const name = d.operator_name.trim();
  if (!name || name.length > 80) p.operator_name = 'The company name must be 1 to 80 characters';
  const sp = phoneProblem(d.support_phone, false);
  if (sp) p.support_phone = sp;
  const dp = phoneProblem(d.dispatch_phone, false);
  if (dp) p.dispatch_phone = dp;
  if (d.depot_text.trim() && !d.depot) p.depot = 'Find the address and pick a match, or clear the box';
  int('stale_minutes', 1, 1440, '1 to 1440 minutes');
  int('pending_minutes', 1, 10080, '1 to 10080 minutes');
  int('failed_window_minutes', 5, 10080, '5 to 10080 minutes');
  int('ping_seconds', 5, 300, '5 to 300 seconds');
  int('eta_speed_kph', 5, 120, '5 to 120 km/h');
  int('stop_minutes', 0, 240, '0 to 240 minutes');
  int('board_hours', 1, 168, '1 to 168 hours');
  if (!Number.isFinite(n.auto_radius_km) || n.auto_radius_km < 0.1 || n.auto_radius_km > 100) p.auto_radius_km = '0.1 to 100 km';
  int('price_base', 0, 10_000_000, '0 to 10,000,000');
  int('price_per_km', 0, 1_000_000, '0 to 1,000,000');
  int('price_minimum', 0, 10_000_000, '0 to 10,000,000');
  if (d.dispatch_email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.dispatch_email.trim())) p.dispatch_email = "That doesn't look like an email address";
  if (d.booking_enabled && n.price_base + n.price_per_km + n.price_minimum === 0) p.price_base = 'Online booking needs a price';
  if (d.customer_terms.length > 10000) p.customer_terms = 'At most 10,000 characters';
  if (d.customer_faq.length > 20) p.customer_faq = '20 questions at most';
  const bad = d.customer_faq.findIndex((x) => !x.q.trim() || !x.a.trim() || x.q.length > 200 || x.a.length > 2000);
  if (bad >= 0) p.customer_faq = `Question ${bad + 1} needs a question and an answer`;
  return p;
}

/** The PUT /config body. Only called once check() is empty. */
function toBody(d: Draft): Omit<Config, 'updated_at' | 'updated_by'> {
  const n = (k: NumKey) => num(d[k]);
  const area = d.limit_area
    ? { min_lat: n('min_lat'), max_lat: n('max_lat'), min_lng: n('min_lng'), max_lng: n('max_lng') }
    : { min_lat: -90, max_lat: 90, min_lng: -180, max_lng: 180 };
  return {
    country: d.country,
    units: d.units,
    timezone: d.timezone,
    language: d.language,
    center_lat: n('center_lat'),
    center_lng: n('center_lng'),
    default_zoom: n('default_zoom'),
    ...area,
    operator_name: d.operator_name.trim(),
    support_phone: toE164(d.support_phone),
    dispatch_phone: toE164(d.dispatch_phone),
    depot: d.depot && d.depot_text.trim() ? { ...d.depot, address: d.depot_text.trim() } : null,
    agent_enabled: d.agent_enabled,
    auto_assign: d.auto_assign,
    booking_enabled: d.booking_enabled,
    dispatch_email: d.dispatch_email.trim(),
    pod_photo_required: d.pod_photo_required,
    pod_signature_required: d.pod_signature_required,
    customer_terms: d.customer_terms,
    customer_faq: d.customer_faq.map((x) => ({ q: x.q.trim(), a: x.a.trim() })),
    stale_minutes: n('stale_minutes'),
    pending_minutes: n('pending_minutes'),
    failed_window_minutes: n('failed_window_minutes'),
    ping_seconds: n('ping_seconds'),
    eta_speed_kph: n('eta_speed_kph'),
    stop_minutes: n('stop_minutes'),
    board_hours: n('board_hours'),
    auto_radius_km: n('auto_radius_km'),
    price_base: n('price_base'),
    price_per_km: n('price_per_km'),
    price_minimum: n('price_minimum'),
  };
}

const sameArea = (a: Draft, b: Draft) =>
  a.limit_area === b.limit_area && (!a.limit_area || (['min_lat', 'max_lat', 'min_lng', 'max_lng'] as const).every((k) => num(a[k]) === num(b[k])));

// ---------------------------------------------------------------- search

interface RowMeta {
  id: string;
  section: SectionId;
  label: string;
  keys: string;
}

type SectionId = 'region' | 'map' | 'org' | 'booking' | 'alerts' | 'customers' | 'look';

const SECTIONS: { id: SectionId; title: string; icon: ReactNode; blurb: string }[] = [
  { id: 'region', title: 'Region', icon: <Globe2 size={18} aria-hidden="true" />, blurb: 'Country, time zone, language and units.' },
  { id: 'map', title: 'Map and service area', icon: <MapIcon size={18} aria-hidden="true" />, blurb: 'Where the map opens, and where stops and GPS positions are accepted.' },
  { id: 'org', title: 'Organisation', icon: <Building2 size={18} aria-hidden="true" />, blurb: 'What customers and drivers see.' },
  { id: 'booking', title: 'Website and booking', icon: <Globe2 size={18} aria-hidden="true" />, blurb: 'The public website: online booking, prices and how customers reach dispatch.' },
  { id: 'alerts', title: 'Tracking and alerts', icon: <SlidersHorizontal size={18} aria-hidden="true" />, blurb: 'When something lands in Needs attention, and how arrival times are estimated.' },
  { id: 'customers', title: 'Proof and customer page', icon: <FileSignature size={18} aria-hidden="true" />, blurb: 'What drivers collect at drop-offs, and what customers read on their tracking link.' },
  { id: 'look', title: 'Appearance', icon: <Palette size={18} aria-hidden="true" />, blurb: 'For this browser only.' },
];

const ROWS: RowMeta[] = [
  { id: 'country', section: 'region', label: 'Country', keys: 'nation preset nigeria ghana kenya region' },
  { id: 'timezone', section: 'region', label: 'Time zone', keys: 'clock hours tz' },
  { id: 'language', section: 'region', label: 'Language and formats', keys: 'locale dates numbers' },
  { id: 'units', section: 'region', label: 'Distance units', keys: 'km kilometres miles metric imperial' },
  { id: 'preview', section: 'region', label: 'Preview', keys: 'sample example' },
  { id: 'center', section: 'map', label: 'Map centre', keys: 'latitude longitude city start' },
  { id: 'zoom', section: 'map', label: 'Default zoom', keys: 'map scale' },
  { id: 'limit', section: 'map', label: 'Limit to a service area', keys: 'bounds boundary range latitude longitude whole world' },
  { id: 'area', section: 'map', label: 'Service area', keys: 'bounds boundary range latitude longitude north south east west' },
  { id: 'name', section: 'org', label: 'Company name', keys: 'operator business brand customers' },
  { id: 'support', section: 'org', label: 'Customer support phone', keys: 'number call tracking page' },
  { id: 'dispatch', section: 'org', label: 'Dispatch phone', keys: 'number call drivers pin forgot' },
  { id: 'depot', section: 'org', label: 'Depot', keys: 'pickup warehouse address new delivery' },
  { id: 'agent', section: 'org', label: 'Agent', keys: 'ai assistant proposals answers' },
  { id: 'auto', section: 'org', label: 'Auto mode', keys: 'automatic assign supervisor ai driver truck nearest' },
  { id: 'autoradius', section: 'org', label: 'Auto mode: near means within', keys: 'automatic assign distance radius km nearest' },
  { id: 'booking', section: 'booking', label: 'Online booking', keys: 'website book request paystack pay customers landing' },
  { id: 'demail', section: 'booking', label: 'Dispatch email', keys: 'contact website email request' },
  { id: 'pbase', section: 'booking', label: 'Base fee', keys: 'price naira cost quote' },
  { id: 'pkm', section: 'booking', label: 'Price per km', keys: 'price naira distance quote rate' },
  { id: 'pmin', section: 'booking', label: 'Minimum price', keys: 'price naira quote floor' },
  { id: 'stale', section: 'alerts', label: 'Truck counts as silent after', keys: 'stale gps offline minutes' },
  { id: 'pending', section: 'alerts', label: 'Flag unassigned deliveries after', keys: 'pending waiting minutes' },
  { id: 'failed', section: 'alerts', label: 'Keep failed deliveries in Needs attention for', keys: 'failed window minutes' },
  { id: 'ping', section: 'alerts', label: 'Driver position interval', keys: 'gps ping seconds frequency' },
  { id: 'etaspeed', section: 'alerts', label: 'Average speed for arrival estimates', keys: 'eta traffic km/h due late at risk' },
  { id: 'stopmin', section: 'alerts', label: 'Time at each stop', keys: 'eta loading unloading dwell minutes due late' },
  { id: 'board', section: 'alerts', label: 'Keep finished deliveries on the console for', keys: 'completed cancelled history hours list' },
  { id: 'podsig', section: 'customers', label: 'Require a signature at drop-offs', keys: 'proof of delivery pod sign receiver' },
  { id: 'podphoto', section: 'customers', label: 'Require a photo at drop-offs', keys: 'proof of delivery pod picture camera' },
  { id: 'terms', section: 'customers', label: 'Delivery terms', keys: 'terms conditions legal tracking page customer' },
  { id: 'faq', section: 'customers', label: 'Help: questions and answers', keys: 'faq help questions tracking page customer agent chat suggestions' },
  { id: 'theme', section: 'look', label: 'Theme', keys: 'dark light mode colours' },
];

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');

const MatchCtx = createContext<(id: string) => boolean>(() => true);

// ---------------------------------------------------------------- building blocks

function Section({ id, visible, children }: { id: SectionId; visible: boolean; children: ReactNode }) {
  const s = SECTIONS.find((x) => x.id === id)!;
  if (!visible) return null;
  return (
    <section id={`sec-${id}`} aria-labelledby={`h-${id}`} className="scroll-mt-24">
      <div className="mb-2.5 flex flex-col gap-0.5 px-1">
        <h2 id={`h-${id}`} className="t-h2 m-0">
          {s.title}
        </h2>
        <span className="t-body-sm text-ink-muted">{s.blurb}</span>
      </div>
      <div className="flex flex-col rounded-lg border border-border bg-surface-100">{children}</div>
    </section>
  );
}

/** One setting: label and help on the left, the control on the right (below, when narrow). */
function Row({ id, label, help, error, htmlFor, children, wide }: { id: string; label: string; help?: ReactNode; error?: string; htmlFor?: string; children: ReactNode; wide?: boolean }) {
  const show = useContext(MatchCtx)(id);
  if (!show) return null;
  const errId = `${id}-err`;
  return (
    <div className={`settings-row flex flex-wrap items-start gap-x-6 gap-y-3 border-t border-divider px-5 py-4 first:border-t-0 ${wide ? 'flex-col items-stretch' : ''}`}>
      <div className="flex min-w-[220px] flex-1 flex-col gap-1">
        {htmlFor ? (
          <label htmlFor={htmlFor} className="t-h3">
            {label}
          </label>
        ) : (
          <span className="t-h3">{label}</span>
        )}
        {help && <span className="t-body-sm text-ink-muted">{help}</span>}
        {error && (
          <span id={errId} role="alert" className="t-body-sm font-semibold text-attention">
            {error}
          </span>
        )}
      </div>
      <div className={`flex min-w-0 flex-col gap-2 ${wide ? 'w-full' : 'w-full sm:w-auto sm:min-w-[280px] sm:max-w-[360px]'}`}>{children}</div>
    </div>
  );
}

function Switch({ id, on, onChange, label }: { id: string; on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`relative inline-flex h-7 w-12 flex-none items-center self-end rounded-full border-2 transition-colors sm:self-auto ${on ? 'border-ink bg-ink' : 'border-border bg-surface-200'}`}
    >
      <span className={`inline-block h-5 w-5 rounded-full shadow transition-transform ${on ? 'translate-x-[22px] bg-surface-100' : 'translate-x-[2px] bg-ink-muted'}`} />
    </button>
  );
}

const selectCls = 'min-h-11 w-full rounded-md border border-border bg-surface-100 py-2 ps-3.5 text-[14px] text-ink';

function NumberBox({ id, value, onChange, error, suffix, step = 'any', label }: { id: string; value: string; onChange: (v: string) => void; error?: boolean; suffix?: string; step?: string; label?: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <input
        id={id}
        inputMode="decimal"
        type="number"
        step={step}
        value={value}
        aria-label={label}
        aria-invalid={error || undefined}
        onChange={(e) => onChange(e.target.value)}
        className={`${inputCls(error)} w-full min-w-0 font-mono`}
      />
      {suffix && <span className="t-body-sm flex-none text-ink-muted">{suffix}</span>}
    </div>
  );
}

// ---------------------------------------------------------------- page

type SaveState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'confirm'; stops: number; trucks: number }
  | { kind: 'saving' }
  | { kind: 'error'; message: string }
  | { kind: 'saved' };

export function SettingsView() {
  const c = useConfig();
  const qc = useQueryClient();
  const uid = useId();
  const f = (k: string) => `${uid}-${k}`;

  // The draft follows the saved settings until someone edits it.
  const base = useMemo(() => fromConfig(c), [c]);
  const baseKey = JSON.stringify(base);
  const [draft, setDraft] = useState<Draft>(base);
  const [shownBase, setShownBase] = useState(baseKey);
  const dirty = JSON.stringify(draft) !== shownBase;
  useEffect(() => {
    if (baseKey === shownBase) return;
    if (!dirty) setDraft(JSON.parse(baseKey) as Draft);
    setShownBase(baseKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseKey]);

  const [save, setSave] = useState<SaveState>({ kind: 'idle' });
  const [filled, setFilled] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const problems = useMemo(() => check(draft), [draft]);
  const problemCount = Object.keys(problems).length;
  const err = (k: string) => (touched ? problems[k] : undefined);

  const set = (patch: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setTouched(true);
    if (save.kind !== 'idle' && save.kind !== 'saving' && save.kind !== 'checking') setSave({ kind: 'idle' });
  };

  function pickCountry(iso: string) {
    const p = countryPreset(iso);
    if (!p) return set({ country: iso });
    const v = presetValues(p);
    const nums = Object.fromEntries(Object.entries(v).filter(([k]) => (NUMS as readonly string[]).includes(k)).map(([k, x]) => [k, String(x)]));
    setDraft((d) => ({
      ...d,
      ...nums,
      country: v.country,
      timezone: v.timezone,
      units: v.units,
      language: v.language,
      limit_area: true,
      // Empty phone boxes follow the country; typed numbers keep theirs.
      support_phone: d.support_phone.national.trim() ? d.support_phone : { country: iso, national: '' },
      dispatch_phone: d.dispatch_phone.national.trim() ? d.dispatch_phone : { country: iso, national: '' },
      // A depot in the old country would be outside the new area.
      ...(d.depot && !(d.depot.lat >= v.min_lat && d.depot.lat <= v.max_lat && d.depot.lng >= v.min_lng && d.depot.lng <= v.max_lng) ? { depot: null, depot_text: '' } : {}),
    }));
    setTouched(true);
    setFilled(p.name);
    setSave({ kind: 'idle' });
  }

  async function doSave(skipCheck = false) {
    setTouched(true);
    if (problemCount) {
      setSave({ kind: 'error', message: problemCount === 1 ? 'One setting needs fixing first.' : `${problemCount} settings need fixing first.` });
      return;
    }
    const body = toBody(draft);
    try {
      if (!skipCheck && draft.limit_area && !sameArea(draft, base)) {
        setSave({ kind: 'checking' });
        const r = await post<{ stops_outside: number; trucks_outside: number }>('/config/check', {
          min_lat: body.min_lat,
          max_lat: body.max_lat,
          min_lng: body.min_lng,
          max_lng: body.max_lng,
        });
        if (r.stops_outside > 0 || r.trucks_outside > 0) {
          setSave({ kind: 'confirm', stops: r.stops_outside, trucks: r.trucks_outside });
          return;
        }
      }
      setSave({ kind: 'saving' });
      const saved = await api<Partial<Config>>('/config', { method: 'PUT', body: JSON.stringify(body) });
      const next = toAppConfig(saved);
      const nextDraft = fromConfig(next);
      setDraft(nextDraft);
      setShownBase(JSON.stringify(nextDraft));
      qc.setQueryData(CONFIG_KEY, next);
      setFilled(null);
      setTouched(false);
      setSave({ kind: 'saved' });
    } catch (e) {
      setSave({ kind: 'error', message: e instanceof ApiError ? e.message : 'Could not save the settings.' });
    }
  }

  function discard() {
    setDraft(base);
    setFilled(null);
    setTouched(false);
    setSave({ kind: 'idle' });
  }

  // ---- search ----
  const [q, setQ] = useState('');
  const terms = norm(q).split(/\s+/).filter(Boolean);
  const matching = useMemo(() => {
    if (!terms.length) return null;
    const s = SECTIONS;
    return new Set(
      ROWS.filter((r) => {
        const hay = norm(`${r.label} ${r.keys} ${s.find((x) => x.id === r.section)!.title}`);
        return terms.every((t) => hay.includes(t));
      }).map((r) => r.id),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);
  const shows = (id: string) => !matching || matching.has(id);
  const sectionShows = (s: SectionId) => !matching || ROWS.some((r) => r.section === s && matching.has(r.id));

  // ---- which section is on screen, for the sidebar ----
  const [active, setActive] = useState<SectionId>('region');
  useEffect(() => {
    const els = SECTIONS.map((s) => document.getElementById(`sec-${s.id}`)).filter(Boolean) as HTMLElement[];
    if (!els.length || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (entries) => {
        const top = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (top) setActive(top.target.id.slice(4) as SectionId);
      },
      { rootMargin: '-96px 0px -55% 0px' },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [matching]);

  // ---- preview, through Intl for the draft's language, zone and units ----
  const locale = draft.language || 'en';
  const loc = safe(() => new Intl.DateTimeFormat(locale).resolvedOptions().locale, 'en');
  const rtl = isRtlLocale(locale);
  const pv = {
    time: safe(() => new Intl.DateTimeFormat(loc, { timeZone: draft.timezone, hour: 'numeric', minute: '2-digit' }).format(SAMPLE), '—'),
    date: safe(() => new Intl.DateTimeFormat(loc, { timeZone: draft.timezone, weekday: 'long', day: 'numeric', month: 'long', timeZoneName: 'short' }).format(SAMPLE), ''),
    dist: formatDistance(9.4, draft.units, loc),
    big: safe(() => new Intl.NumberFormat(loc).format(1234567.89), '1,234,567.89'),
  };

  // ---- map preview from the draft, when the numbers make sense ----
  const mapOk = !problems.center_lat && !problems.center_lng && !problems.default_zoom && !(draft.limit_area && (problems.min_lat || problems.max_lat || problems.min_lng || problems.max_lng));
  const centre = { lat: num(draft.center_lat), lng: num(draft.center_lng) };
  const corners = draft.limit_area
    ? [
        { lat: num(draft.min_lat), lng: num(draft.min_lng) },
        { lat: num(draft.min_lat), lng: num(draft.max_lng) },
        { lat: num(draft.max_lat), lng: num(draft.max_lng) },
        { lat: num(draft.max_lat), lng: num(draft.min_lng) },
      ]
    : [];

  const zones = useMemo(() => timeZones(draft.timezone), [draft.timezone]);
  const languages = useMemo(() => (LANGUAGES.some((l) => l.tag === draft.language) ? LANGUAGES : [{ tag: draft.language, name: draft.language }, ...LANGUAGES]), [draft.language]);
  const theme = useThemePref();

  const savedLine = c.updated_at
    ? `Last saved ${safe(() => new Intl.DateTimeFormat(c.locale, { timeZone: c.timezone, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(c.updated_at!)), '')}${c.updated_by ? ` by ${c.updated_by}` : ''}`
    : 'Not saved yet: using the server’s defaults';

  const nothing = matching && matching.size === 0;
  const busy = save.kind === 'checking' || save.kind === 'saving';

  return (
    <div className="flex min-h-full flex-col bg-surface-200 text-ink">
      <header className="sticky top-0 z-[5] flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-divider bg-surface-100 px-6 py-3">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <div className="flex flex-col">
            <h1 className="m-0 text-[22px] font-semibold tracking-[-0.01em]">Settings</h1>
          </div>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-[1180px] gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[232px_minmax(0,1fr)]">
        {/* Sidebar: search and sections. Sticky on wide screens, a row on top when narrow. */}
        <aside className="flex min-w-0 flex-col gap-3 lg:sticky lg:top-[88px] lg:self-start">
          <div className="relative">
            <Search size={16} aria-hidden="true" className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-ink-muted" />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search settings"
              aria-label="Search settings"
              className={`${inputCls()} w-full ps-9 pe-9`}
            />
            {q && (
              <button type="button" aria-label="Clear search" onClick={() => setQ('')} className="absolute end-1.5 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-ink-muted hover:bg-surface-200">
                <X size={16} aria-hidden="true" />
              </button>
            )}
          </div>
          <nav aria-label="Settings sections" className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
            {SECTIONS.map((s) => {
              const on = active === s.id && sectionShows(s.id);
              return (
                <a
                  key={s.id}
                  href={`#sec-${s.id}`}
                  aria-current={on ? 'true' : undefined}
                  onClick={() => setActive(s.id)}
                  className={`flex min-h-11 flex-none items-center gap-3 rounded-full px-4 text-[14px] font-semibold no-underline lg:rounded-e-full lg:rounded-s-md ${
                    on ? 'bg-ink text-surface-100' : 'text-ink hover:bg-surface-100'
                  } ${sectionShows(s.id) ? '' : 'opacity-40'}`}
                >
                  {s.icon}
                  {s.title}
                </a>
              );
            })}
          </nav>
          <span className="t-body-sm hidden px-1 text-ink-muted lg:block">{savedLine}</span>
        </aside>

        <main className="flex min-w-0 flex-col gap-8 pb-28">
          <span className="t-body-sm -mb-4 text-ink-muted lg:hidden">{savedLine}</span>
          {nothing && (
            <div className="rounded-lg border border-border bg-surface-100 px-5 py-8 text-center">
              <p className="t-h3 m-0">No settings match “{q.trim()}”</p>
              <p className="t-body-sm m-0 mt-1 text-ink-muted">Try “phone”, “time zone” or “service area”.</p>
            </div>
          )}

          <MatchCtx.Provider value={shows}>
            <Section id="region" visible={sectionShows('region')}>
              <Row
                id="country"
                label="Country"
                htmlFor={f('country')}
                help={filled ? `Filled the time zone, language, units, map centre and service area for ${filled}. Check them, then save.` : 'Picks sensible values for everything in Region and Map. You can change any of them after.'}
              >
                <select id={f('country')} value={draft.country} onChange={(e) => pickCountry(e.target.value)} className={selectCls}>
                  {!draft.country && <option value="">Choose a country…</option>}
                  {draft.country && !countryPreset(draft.country) && <option value={draft.country}>{draft.country}</option>}
                  {COUNTRY_PRESETS.map((p) => (
                    <option key={p.iso} value={p.iso}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </Row>
              <Row id="timezone" label="Time zone" htmlFor={f('tz')} help="Times in the console, on tracking pages and in the agent's answers." error={err('timezone')}>
                <select id={f('tz')} value={draft.timezone} onChange={(e) => set({ timezone: e.target.value })} className={selectCls}>
                  {zones.map((z) => (
                    <option key={z} value={z}>
                      {z.replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
              </Row>
              <Row id="language" label="Language and formats" htmlFor={f('lang')} help="How dates and numbers are written, and the language address search prefers." error={err('language')}>
                <select id={f('lang')} value={draft.language} onChange={(e) => set({ language: e.target.value })} className={selectCls}>
                  {languages.map((l) => (
                    <option key={l.tag} value={l.tag}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </Row>
              <Row id="units" label="Distance units" htmlFor={f('units')}>
                <select id={f('units')} value={draft.units} onChange={(e) => set({ units: e.target.value as Draft['units'] })} className={selectCls}>
                  <option value="metric">Kilometres</option>
                  <option value="imperial">Miles</option>
                </select>
              </Row>
              <Row id="preview" label="Preview" help="A tracking page with these settings.">
                <div dir={rtl ? 'rtl' : 'ltr'} lang={locale} className="flex flex-col gap-0.5 rounded-md bg-surface-200 px-4 py-3">
                  <span className="t-label text-ink-muted">{draft.operator_name || c.operator_name} · tracking</span>
                  <span className="t-h2">{pv.time}</span>
                  <span className="t-body">{pv.dist} away</span>
                  <span className="t-body-sm text-ink-muted">{pv.date}</span>
                  <span className="t-mono-sm text-ink-muted">{pv.big}</span>
                </div>
              </Row>
            </Section>

            <Section id="map" visible={sectionShows('map')}>
              <Row id="center" label="Map centre" help="Where the console map opens." error={err('center_lat') ?? err('center_lng')}>
                <div className="grid grid-cols-2 gap-2">
                  <NumberBox id={f('clat')} label="Latitude" value={draft.center_lat} onChange={(v) => set({ center_lat: v })} error={!!err('center_lat')} suffix="lat" />
                  <NumberBox id={f('clng')} label="Longitude" value={draft.center_lng} onChange={(v) => set({ center_lng: v })} error={!!err('center_lng')} suffix="lng" />
                </div>
                {draft.depot && (
                  <button type="button" className={`${btnSecondary} self-start`} onClick={() => set({ center_lat: String(draft.depot!.lat), center_lng: String(draft.depot!.lng) })}>
                    Centre on the depot
                  </button>
                )}
              </Row>
              <Row id="zoom" label="Default zoom" htmlFor={f('zoom')} help="1 shows the world, 11 a city, 15 a few streets." error={err('default_zoom')}>
                <NumberBox id={f('zoom')} value={draft.default_zoom} step="1" onChange={(v) => set({ default_zoom: v })} error={!!err('default_zoom')} />
              </Row>
              <Row id="limit" label="Limit to a service area" help={draft.limit_area ? 'Stops and GPS positions outside the area are refused, and address search looks only inside it.' : 'Off: stops and positions are accepted anywhere in the world.'}>
                <Switch id={f('limit')} label="Limit to a service area" on={draft.limit_area} onChange={(v) => {
                  if (v && !base.limit_area && num(draft.min_lat) <= -90) {
                    // Turning it on from "whole world": start from the country, else a box around the centre.
                    const p = countryPreset(draft.country);
                    const lat = num(draft.center_lat) || 0, lng = num(draft.center_lng) || 0;
                    const a = p ? p.area : [Math.max(-90, lat - 1), Math.min(90, lat + 1), Math.max(-180, lng - 1), Math.min(180, lng + 1)];
                    set({ limit_area: true, min_lat: String(a[0]), max_lat: String(a[1]), min_lng: String(a[2]), max_lng: String(a[3]) });
                  } else set({ limit_area: v });
                }} />
              </Row>
              {draft.limit_area && (
                <Row id="area" label="Service area" help="A box: the southern and northern latitudes, the western and eastern longitudes." error={err('min_lat') ?? err('max_lat') ?? err('min_lng') ?? err('max_lng')}>
                  <div className="grid grid-cols-2 gap-2">
                    <NumberBox id={f('n')} label="North latitude" value={draft.max_lat} onChange={(v) => set({ max_lat: v })} error={!!err('max_lat')} suffix="N" />
                    <NumberBox id={f('s')} label="South latitude" value={draft.min_lat} onChange={(v) => set({ min_lat: v })} error={!!err('min_lat')} suffix="S" />
                    <NumberBox id={f('w')} label="West longitude" value={draft.min_lng} onChange={(v) => set({ min_lng: v })} error={!!err('min_lng')} suffix="W" />
                    <NumberBox id={f('e')} label="East longitude" value={draft.max_lng} onChange={(v) => set({ max_lng: v })} error={!!err('max_lng')} suffix="E" />
                  </div>
                </Row>
              )}
              {shows('center') || shows('area') || shows('zoom') ? (
                <div className="border-t border-divider p-3">
                  <div className="h-[260px] overflow-hidden rounded-md border border-border">
                    {mapOk ? (
                      <DispatchMap
                        center={centre}
                        zoom={num(draft.default_zoom)}
                        stops={[{ id: 'centre', n: 1, kind: 'pickup', lat: centre.lat, lng: centre.lng, done: true, label: 'Map centre' }]}
                        route={corners.length ? { travelled: [], remaining: [...corners, corners[0]!] } : null}
                        note={corners.length ? 'Service area outlined' : 'No service area: anywhere'}
                        fitKey={`${draft.center_lat},${draft.center_lng},${draft.limit_area},${draft.min_lat},${draft.max_lat},${draft.min_lng},${draft.max_lng}`}
                        fitPoints={corners.length ? corners : [centre]}
                        animateSeconds={0}
                        ariaLabel="Map centre and service area"
                      />
                    ) : (
                      <div className="t-body-sm flex h-full items-center justify-center text-ink-muted">Fix the numbers above to see the map.</div>
                    )}
                  </div>
                </div>
              ) : null}
            </Section>

            <Section id="org" visible={sectionShows('org')}>
              <Row id="name" label="Company name" htmlFor={f('name')} help="On tracking pages, sign-in screens and in the agent's answers." error={err('operator_name')}>
                <input id={f('name')} value={draft.operator_name} maxLength={80} onChange={(e) => set({ operator_name: e.target.value })} className={`${inputCls(!!err('operator_name'))} w-full`} />
              </Row>
              <Row id="support" label="Customer support phone" help="Customers see it on their tracking page. Optional." error={err('support_phone')}>
                <PhoneInput value={draft.support_phone} onChange={(v) => set({ support_phone: v })} invalid={!!err('support_phone')} label="Customer support phone" />
              </Row>
              <Row id="dispatch" label="Dispatch phone" help="Drivers see it in the app and when they forget their PIN. Optional." error={err('dispatch_phone')}>
                <PhoneInput value={draft.dispatch_phone} onChange={(v) => set({ dispatch_phone: v })} invalid={!!err('dispatch_phone')} label="Dispatch phone" />
              </Row>
              <Row id="depot" label="Depot" help={draft.depot ? `Pre-fills the pickup of new deliveries. ${draft.depot.lat.toFixed(5)}, ${draft.depot.lng.toFixed(5)}` : 'Pre-fills the pickup of new deliveries. Optional.'} error={err('depot')} wide>
                <div className="flex min-w-0 gap-2">
                  <div className="min-w-0 flex-1">
                    <AddressFinder
                      id={f('depot')}
                      value={draft.depot_text}
                      invalid={!!err('depot')}
                      onChange={(t) => set({ depot_text: t, ...(t.trim() ? {} : { depot: null }) })}
                      onPick={(p) => set({ depot: { address: p.label, lat: p.lat, lng: p.lng }, depot_text: p.label })}
                    />
                  </div>
                  {(draft.depot || draft.depot_text) && (
                    <button type="button" className={`${btnSecondary} self-start`} onClick={() => set({ depot: null, depot_text: '' })}>
                      Clear
                    </button>
                  )}
                </div>
              </Row>
              <Row id="agent" label="Agent" help={draft.agent_enabled ? 'On: the agent suggests assignments and answers questions in the console and on tracking pages.' : 'Off: no suggestions, and questions go unanswered.'}>
                <Switch id={f('agent')} label="Agent" on={draft.agent_enabled} onChange={(v) => set({ agent_enabled: v })} />
              </Row>
              <Row
                id="auto"
                label="Auto mode"
                help={
                  !draft.agent_enabled
                    ? 'Needs the agent switched on.'
                    : draft.auto_assign
                      ? 'On: the agent acts instead of suggesting. A driver who starts a shift with no truck gets a free one, and each new delivery goes to the nearest truck whose driver is on shift. Everything it does is listed on the console with its reason, and you can reassign by hand. Failed deliveries still come to you as suggestions.'
                      : 'Off: the agent suggests assignments and you approve them.'
                }
              >
                <Switch id={f('auto')} label="Auto mode" on={draft.auto_assign} onChange={(v) => set({ auto_assign: v })} />
              </Row>
              {draft.auto_assign && (
                <Row id="autoradius" label="Near means within" htmlFor={f('autoradius')} help="A truck this close to the pickup is chosen first. With none that close, the nearest truck anywhere is." error={err('auto_radius_km')}>
                  <NumberBox id={f('autoradius')} step="0.5" value={draft.auto_radius_km} onChange={(v) => set({ auto_radius_km: v })} error={!!err('auto_radius_km')} suffix="km" />
                </Row>
              )}
            </Section>

            <Section id="alerts" visible={sectionShows('alerts')}>
              <Row id="stale" label="Truck counts as silent after" htmlFor={f('stale')} help="Its marker turns hollow and grey, and customers see how old the position is." error={err('stale_minutes')}>
                <NumberBox id={f('stale')} step="1" value={draft.stale_minutes} onChange={(v) => set({ stale_minutes: v })} error={!!err('stale_minutes')} suffix="minutes" />
              </Row>
              <Row id="pending" label="Flag unassigned deliveries after" htmlFor={f('pending')} help="Only while at least one truck is free." error={err('pending_minutes')}>
                <NumberBox id={f('pending')} step="1" value={draft.pending_minutes} onChange={(v) => set({ pending_minutes: v })} error={!!err('pending_minutes')} suffix="minutes" />
              </Row>
              <Row id="failed" label="Keep failed deliveries in Needs attention for" htmlFor={f('failed')} help="After that they're only in the list, under Failed." error={err('failed_window_minutes')}>
                <NumberBox id={f('failed')} step="1" value={draft.failed_window_minutes} onChange={(v) => set({ failed_window_minutes: v })} error={!!err('failed_window_minutes')} suffix="minutes" />
              </Row>
              <Row id="ping" label="Driver position interval" htmlFor={f('ping')} help="How often the driver app sends its position. Shorter is smoother, longer saves battery and data." error={err('ping_seconds')}>
                <NumberBox id={f('ping')} step="1" value={draft.ping_seconds} onChange={(v) => set({ ping_seconds: v })} error={!!err('ping_seconds')} suffix="seconds" />
              </Row>
              <Row
                id="etaspeed"
                label="Average speed for arrival estimates"
                htmlFor={f('etaspeed')}
                help="Across the whole trip, traffic included. Estimates add 30% to the straight-line distance for the roads. 20 to 30 km/h suits a busy city."
                error={err('eta_speed_kph')}
              >
                <NumberBox id={f('etaspeed')} step="1" value={draft.eta_speed_kph} onChange={(v) => set({ eta_speed_kph: v })} error={!!err('eta_speed_kph')} suffix="km/h" />
              </Row>
              <Row id="stopmin" label="Time at each stop" htmlFor={f('stopmin')} help="Loading, unloading and paperwork, added at every stop in the estimate." error={err('stop_minutes')}>
                <NumberBox id={f('stopmin')} step="1" value={draft.stop_minutes} onChange={(v) => set({ stop_minutes: v })} error={!!err('stop_minutes')} suffix="minutes" />
              </Row>
              <Row
                id="board"
                label="Keep finished deliveries on the console for"
                htmlFor={f('board')}
                help="Completed and cancelled ones, after they finish. Failed ones stay until they're sent out again or cancelled. Everything is in History."
                error={err('board_hours')}
              >
                <NumberBox id={f('board')} step="1" value={draft.board_hours} onChange={(v) => set({ board_hours: v })} error={!!err('board_hours')} suffix="hours" />
              </Row>
            </Section>

            <Section id="customers" visible={sectionShows('customers')}>
              <Row id="podsig" label="Require a signature at drop-offs" help="The receiver signs on the driver's phone. Their name is always required.">
                <Switch id={f('podsig')} label="Require a signature" on={draft.pod_signature_required} onChange={(v) => set({ pod_signature_required: v })} />
              </Row>
              <Row id="podphoto" label="Require a photo at drop-offs" help="Of the goods where they were left. Drivers can always add one.">
                <Switch id={f('podphoto')} label="Require a photo" on={draft.pod_photo_required} onChange={(v) => set({ pod_photo_required: v })} />
              </Row>
              <Row
                id="terms"
                label="Delivery terms"
                htmlFor={f('terms')}
                help="Small print under the delivery details on every tracking page, folded behind “Read the delivery terms”. {company} and {support_phone} are filled in. A line on its own becomes a heading. Have your lawyer check it."
                error={err('customer_terms')}
                wide
              >
                <textarea
                  id={f('terms')}
                  value={draft.customer_terms}
                  onChange={(e) => set({ customer_terms: e.target.value })}
                  rows={14}
                  className={`${textareaCls(!!err('customer_terms'))} w-full`}
                />
              </Row>
              <Row id="faq" label="Help: questions and answers" help="The question box on tracking pages answers from these, and the first four questions show as suggestions to tap. Needs the agent switched on." error={err('customer_faq')} wide>
                <ol className="m-0 flex list-none flex-col gap-3 p-0">
                  {draft.customer_faq.map((x, i) => (
                    <li key={i} className="flex flex-col gap-2 rounded-md border border-border p-3">
                      <div className="flex gap-2">
                        <input
                          aria-label={`Question ${i + 1}`}
                          value={x.q}
                          maxLength={200}
                          onChange={(e) => set({ customer_faq: draft.customer_faq.map((y, j) => (j === i ? { ...y, q: e.target.value } : y)) })}
                          className={`${inputCls()} min-w-0 flex-1 font-semibold`}
                        />
                        <button
                          type="button"
                          aria-label={`Remove question ${i + 1}`}
                          onClick={() => set({ customer_faq: draft.customer_faq.filter((_, j) => j !== i) })}
                          className="inline-flex h-11 w-11 flex-none items-center justify-center rounded-md border border-border bg-surface-100 text-ink"
                        >
                          <Trash2 size={16} aria-hidden="true" />
                        </button>
                      </div>
                      <textarea
                        aria-label={`Answer ${i + 1}`}
                        value={x.a}
                        rows={2}
                        onChange={(e) => set({ customer_faq: draft.customer_faq.map((y, j) => (j === i ? { ...y, a: e.target.value } : y)) })}
                        className={textareaCls()}
                      />
                    </li>
                  ))}
                </ol>
                {draft.customer_faq.length < 20 && (
                  <button
                    type="button"
                    onClick={() => set({ customer_faq: [...draft.customer_faq, { q: '', a: '' }] })}
                    className={`${btnSecondary} inline-flex items-center gap-1.5 self-start`}
                  >
                    <Plus size={15} aria-hidden="true" />
                    Add a question
                  </button>
                )}
              </Row>
            </Section>

            <Section id="booking" visible={sectionShows('booking')}>
              <Row
                id="booking"
                label="Online booking"
                help={
                  draft.booking_enabled
                    ? 'On: anyone can book and pay on the website (/book). A paid booking becomes a pending delivery here. Payment needs PAYSTACK_SECRET_KEY on the API.'
                    : 'Off: the website shows the price and your contact details, and the booking button opens an email to dispatch.'
                }
              >
                <Switch id={f('booking')} label="Online booking" on={draft.booking_enabled} onChange={(v) => set({ booking_enabled: v })} />
              </Row>
              <Row id="demail" label="Dispatch email" htmlFor={f('demail')} help="Shown on the website for customers who'd rather write. Optional." error={err('dispatch_email')}>
                <input id={f('demail')} type="email" value={draft.dispatch_email} maxLength={200} onChange={(e) => set({ dispatch_email: e.target.value })} className={`${inputCls(!!err('dispatch_email'))} w-full`} />
              </Row>
              <Row id="pbase" label="Base fee" htmlFor={f('pbase')} help="Every booking starts at this, in naira." error={err('price_base')}>
                <NumberBox id={f('pbase')} step="100" value={draft.price_base} onChange={(v) => set({ price_base: v })} error={!!err('price_base')} suffix="₦" />
              </Row>
              <Row id="pkm" label="Price per km" htmlFor={f('pkm')} help="Times the estimated road distance through all the stops (straight lines × 1.3)." error={err('price_per_km')}>
                <NumberBox id={f('pkm')} step="50" value={draft.price_per_km} onChange={(v) => set({ price_per_km: v })} error={!!err('price_per_km')} suffix="₦/km" />
              </Row>
              <Row id="pmin" label="Minimum price" htmlFor={f('pmin')} help="No booking costs less. Prices round up to the next ₦100." error={err('price_minimum')}>
                <NumberBox id={f('pmin')} step="500" value={draft.price_minimum} onChange={(v) => set({ price_minimum: v })} error={!!err('price_minimum')} suffix="₦" />
              </Row>
            </Section>

            <Section id="look" visible={sectionShows('look')}>
              <Row id="theme" label="Theme" htmlFor={f('theme')} help="Saved in this browser straight away. Same as this device follows its light or dark setting.">
                <select id={f('theme')} value={theme} onChange={(e) => setThemePref(e.target.value as ThemePref)} className={selectCls}>
                  <option value="system">Same as this device</option>
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </select>
              </Row>
            </Section>
          </MatchCtx.Provider>
        </main>
      </div>

      {/* Save bar: only while there's something to save, or something to say about the last save. */}
      {(dirty || save.kind === 'saved' || save.kind === 'error') && (
        <div role="region" aria-label="Save settings" className="fixed inset-x-0 bottom-0 z-[6] border-t border-border bg-surface-100 shadow-[0_-4px_16px_rgba(0,0,0,0.08)]">
          <div className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <div aria-live="polite" className="t-body-sm min-w-0 flex-1">
              {save.kind === 'confirm' ? (
                <span className="font-semibold">
                  {[save.stops ? `${save.stops} stop${save.stops === 1 ? '' : 's'} still to visit` : '', save.trucks ? `${save.trucks} truck${save.trucks === 1 ? '' : 's'}` : ''].filter(Boolean).join(' and ')}{' '}
                  {save.stops + save.trucks === 1 ? 'is' : 'are'} outside the new service area. Deliveries already booked keep going, but positions from trucks outside it will be refused.
                </span>
              ) : save.kind === 'error' ? (
                <span className="font-semibold text-attention">{save.message}</span>
              ) : save.kind === 'saved' && !dirty ? (
                <span className="font-semibold">Saved. Everyone sees the new settings now.</span>
              ) : (
                <span className="font-semibold">You have unsaved changes{problemCount && touched ? ` · ${problemCount} to fix` : ''}</span>
              )}
            </div>
            <div className="flex gap-2">
              {save.kind === 'confirm' ? (
                <>
                  <button type="button" className={btnSecondary} onClick={() => setSave({ kind: 'idle' })}>
                    Go back
                  </button>
                  <button type="button" className={btnPrimary} onClick={() => doSave(true)}>
                    Save anyway
                  </button>
                </>
              ) : save.kind === 'saved' && !dirty ? (
                <button type="button" className={btnSecondary} onClick={() => setSave({ kind: 'idle' })}>
                  Close
                </button>
              ) : (
                <>
                  <button type="button" className={btnSecondary} disabled={busy || !dirty} onClick={discard}>
                    Discard
                  </button>
                  <button type="button" className={btnPrimary} disabled={busy || !dirty} onClick={() => doSave()}>
                    {save.kind === 'checking' ? 'Checking…' : save.kind === 'saving' ? 'Saving…' : 'Save changes'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
