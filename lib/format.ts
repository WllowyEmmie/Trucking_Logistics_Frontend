// Every time, date and distance shown on screen goes through here.

const DEFAULT_LOCALE = 'en-GB';

const cache = new Map<string, Intl.DateTimeFormat>();
function dtf(locale: string, opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = locale + JSON.stringify(opts);
  let f = cache.get(key);
  if (!f) {
    try {
      f = new Intl.DateTimeFormat(locale, opts);
    } catch {
      f = new Intl.DateTimeFormat(DEFAULT_LOCALE, { ...opts, timeZone: undefined });
    }
    cache.set(key, f);
  }
  return f;
}

export const viewerTimeZone = (): string => Intl.DateTimeFormat().resolvedOptions().timeZone;

/** "14:25" */
export function formatTime(iso: string | Date, tz: string, locale = DEFAULT_LOCALE): string {
  return dtf(locale, { timeZone: tz, hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

/** "29 Sep" */
export function formatDate(iso: string | Date, tz: string, locale = DEFAULT_LOCALE): string {
  return dtf(locale, { timeZone: tz, day: 'numeric', month: 'short' }).format(new Date(iso));
}

const dayKey = (d: Date, tz: string) => dtf('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

/** "14:25" today, "29 Sep, 16:02" otherwise. */
export function formatWhen(iso: string, tz: string, locale = DEFAULT_LOCALE, now = new Date()): string {
  const d = new Date(iso);
  const t = formatTime(d, tz, locale);
  return dayKey(d, tz) === dayKey(now, tz) ? t : `${formatDate(d, tz, locale)}, ${t}`;
}

/** Whole minutes from `iso` to `now`, never negative. */
export function minutesSince(iso: string, now: number = Date.now()): number {
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60_000));
}

export function secondsSince(iso: string | number, now: number = Date.now()): number {
  const t = typeof iso === 'number' ? iso : new Date(iso).getTime();
  return Math.max(0, Math.round((now - t) / 1000));
}

/** "26 min", "2 h 14 min", "3 days 4 h", from a week "9 days". The one way every "how long" reads. */
export function formatDuration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m} min`;
  if (m < 24 * 60) {
    const h = Math.floor(m / 60);
    const r = m % 60;
    return r ? `${h} h ${r} min` : `${h} h`;
  }
  const d = Math.floor(m / (24 * 60));
  const h = Math.floor((m % (24 * 60)) / 60);
  const days = `${d} ${d === 1 ? 'day' : 'days'}`;
  return d >= 7 || !h ? days : `${days} ${h} h`;
}

/** How long since: "40 s", then as formatDuration ("12 min", "3 h 5 min", "2 days 1 h"). */
export function formatSince(iso: string, now: number = Date.now()): string {
  const s = secondsSince(iso, now);
  return s < 60 ? `${Math.max(0, Math.floor(s))} s` : formatDuration(s / 60);
}

/** "Updated 1 min ago" style. */
export function formatAgo(iso: string, now: number = Date.now()): string {
  const s = secondsSince(iso, now);
  if (s < 60) return 'just now';
  return `${formatDuration(s / 60)} ago`;
}

const KM_PER_MI = 1.609344;

/** "9.4 km" via Intl unit style. `units` is the API's 'metric' | 'imperial'. */
export function formatDistance(km: number, units: 'metric' | 'imperial', locale = DEFAULT_LOCALE): string {
  const metric = units !== 'imperial';
  const v = metric ? km : km / KM_PER_MI;
  try {
    return new Intl.NumberFormat(locale, {
      style: 'unit',
      unit: metric ? 'kilometer' : 'mile',
      unitDisplay: 'short',
      maximumFractionDigits: v < 100 ? 1 : 0,
    }).format(v);
  } catch {
    return `${v.toFixed(1)} ${metric ? 'km' : 'mi'}`;
  }
}

export function formatNumber(n: number, locale = DEFAULT_LOCALE): string {
  try {
    return new Intl.NumberFormat(locale).format(n);
  } catch {
    return String(n);
  }
}

/** "CEST" */
export function tzAbbr(tz: string, at: Date = new Date(), locale = DEFAULT_LOCALE): string {
  const part = dtf(locale, { timeZone: tz, timeZoneName: 'short' })
    .formatToParts(at)
    .find((p) => p.type === 'timeZoneName');
  return part?.value ?? tz;
}

/** Offset of `tz` from UTC in minutes at `at`. */
export function tzOffsetMinutes(tz: string, at: Date = new Date()): number {
  const parts = dtf('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'));
  return Math.round((asUtc - Math.floor(at.getTime() / 60_000) * 60_000) / 60_000);
}

/** True when two zones show different wall-clock times right now. */
export function zonesDiffer(a: string, b: string, at: Date = new Date()): boolean {
  return tzOffsetMinutes(a, at) !== tzOffsetMinutes(b, at);
}

/** "one hour behind", "2 hours ahead" — how `other` relates to `viewer`. */
export function describeOffset(viewerTz: string, otherTz: string, at: Date = new Date()): string {
  const diff = tzOffsetMinutes(otherTz, at) - tzOffsetMinutes(viewerTz, at);
  const abs = Math.abs(diff);
  const h = abs / 60;
  const amount = Number.isInteger(h) ? (h === 1 ? 'one hour' : `${h} hours`) : formatDuration(abs);
  return `${amount} ${diff < 0 ? 'behind' : 'ahead'}`;
}

/** Straight-line distance in km. */
export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
