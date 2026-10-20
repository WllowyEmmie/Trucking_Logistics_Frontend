// Phone numbers as a country code and the national number, joined to international (E.164) form
// for the API: "+2348031234567". Drivers sign in by phone, so a number has to come out the same
// however it was typed.

export interface PhoneCountry {
  iso: string;
  name: string;
  /** Country calling code, digits only. */
  dial: string;
  /** National number length, without the trunk 0. */
  min: number;
  max: number;
  /** The 0 people dial at home and drop from abroad (0803… → +234 803…). Null where 0 is part of the number. */
  trunk: '0' | null;
}

/** Nigeria and neighbours first, then other common ones. Add more here. */
export const PHONE_COUNTRIES: PhoneCountry[] = [
  { iso: 'NG', name: 'Nigeria', dial: '234', min: 10, max: 10, trunk: '0' },
  { iso: 'GH', name: 'Ghana', dial: '233', min: 9, max: 9, trunk: '0' },
  { iso: 'BJ', name: 'Benin', dial: '229', min: 8, max: 10, trunk: null },
  { iso: 'TG', name: 'Togo', dial: '228', min: 8, max: 8, trunk: null },
  { iso: 'CM', name: 'Cameroon', dial: '237', min: 9, max: 9, trunk: null },
  { iso: 'NE', name: 'Niger', dial: '227', min: 8, max: 8, trunk: null },
  { iso: 'CI', name: "Côte d'Ivoire", dial: '225', min: 10, max: 10, trunk: null },
  { iso: 'SN', name: 'Senegal', dial: '221', min: 9, max: 9, trunk: null },
  { iso: 'KE', name: 'Kenya', dial: '254', min: 9, max: 9, trunk: '0' },
  { iso: 'ZA', name: 'South Africa', dial: '27', min: 9, max: 9, trunk: '0' },
  { iso: 'EG', name: 'Egypt', dial: '20', min: 10, max: 10, trunk: '0' },
  { iso: 'GB', name: 'United Kingdom', dial: '44', min: 10, max: 10, trunk: '0' },
  { iso: 'IE', name: 'Ireland', dial: '353', min: 9, max: 9, trunk: '0' },
  { iso: 'US', name: 'United States / Canada', dial: '1', min: 10, max: 10, trunk: null },
  { iso: 'AE', name: 'United Arab Emirates', dial: '971', min: 9, max: 9, trunk: '0' },
  { iso: 'DE', name: 'Germany', dial: '49', min: 6, max: 11, trunk: '0' },
  { iso: 'FR', name: 'France', dial: '33', min: 9, max: 9, trunk: '0' },
  { iso: 'IN', name: 'India', dial: '91', min: 10, max: 10, trunk: '0' },
  { iso: 'CN', name: 'China', dial: '86', min: 11, max: 11, trunk: '0' },
];

const byIso = new Map(PHONE_COUNTRIES.map((c) => [c.iso, c]));
export const phoneCountry = (iso: string): PhoneCountry => byIso.get(iso) ?? PHONE_COUNTRIES[0]!;

/** Operator time zone → country, for when the language has no region. */
const ZONE_COUNTRY: Record<string, string> = {
  'Africa/Lagos': 'NG',
  'Africa/Accra': 'GH',
  'Africa/Porto-Novo': 'BJ',
  'Africa/Lome': 'TG',
  'Africa/Douala': 'CM',
  'Africa/Niamey': 'NE',
  'Africa/Abidjan': 'CI',
  'Africa/Dakar': 'SN',
  'Africa/Nairobi': 'KE',
  'Africa/Johannesburg': 'ZA',
  'Africa/Cairo': 'EG',
  'Europe/London': 'GB',
  'Europe/Dublin': 'IE',
  'Asia/Dubai': 'AE',
  'Europe/Berlin': 'DE',
  'Europe/Paris': 'FR',
  'Asia/Kolkata': 'IN',
  'Asia/Shanghai': 'CN',
};

/** The country new numbers default to: the operator's country setting, else its language region (en-NG), else its time zone, else Nigeria. */
export function defaultPhoneCountry(cfg: { country?: string; language?: string; timezone?: string }): string {
  if (cfg.country && byIso.has(cfg.country)) return cfg.country;
  const region = cfg.language?.split(/[-_]/)[1]?.toUpperCase();
  if (region && byIso.has(region)) return region;
  if (cfg.timezone && ZONE_COUNTRY[cfg.timezone]) return ZONE_COUNTRY[cfg.timezone]!;
  if (cfg.timezone?.startsWith('America/')) return 'US';
  return 'NG';
}

export interface PhoneValue {
  country: string;
  national: string;
}

export const emptyPhone = (country: string): PhoneValue => ({ country, national: '' });

/**
 * "+2348031234567" from the parts. The national part may be typed any way: spaces, dashes, a
 * leading 0. If someone types a full international number (+44…) into it, that wins over the
 * dropdown. Empty when nothing was typed.
 */
export function toE164(v: PhoneValue): string {
  const typed = v.national.trim();
  if (typed.startsWith('+')) return '+' + typed.replace(/\D/g, '');
  let digits = typed.replace(/\D/g, '');
  if (!digits) return '';
  const c = phoneCountry(v.country);
  // Someone typed the country code without the + (234803…).
  if (digits.startsWith(c.dial) && digits.length - c.dial.length >= c.min) digits = digits.slice(c.dial.length);
  // Where 0 is the trunk prefix, no national number starts with it, so it always goes.
  if (c.trunk && digits.startsWith(c.trunk)) digits = digits.slice(1);
  return `+${c.dial}${digits}`;
}

/** Why the number won't do, or null. Empty is "required" only when required. */
export function phoneProblem(v: PhoneValue, required = true): string | null {
  const e164 = toE164(v);
  if (!e164) return required ? 'Enter a mobile number' : null;
  if (v.national.trim().startsWith('+')) {
    return /^\+\d{7,15}$/.test(e164) ? null : 'That international number looks too short or too long';
  }
  const c = phoneCountry(v.country);
  const n = e164.length - 1 - c.dial.length;
  if (n < c.min || n > c.max) {
    const want = c.min === c.max ? `${c.min} digits` : `${c.min} to ${c.max} digits`;
    return `${c.name} numbers have ${want} after +${c.dial}${c.trunk ? ', not counting a leading 0' : ''}`;
  }
  return null;
}

/** For showing a stored number back: "+234 803 123 4567" style grouping is left to the reader. */
export function splitE164(e164: string, fallback: string): PhoneValue {
  const digits = e164.replace(/\D/g, '');
  // Longest calling code first, so +1 doesn't swallow +1xx.
  const c = [...PHONE_COUNTRIES].sort((a, b) => b.dial.length - a.dial.length).find((x) => digits.startsWith(x.dial));
  return c ? { country: c.iso, national: digits.slice(c.dial.length) } : { country: fallback, national: e164 };
}
