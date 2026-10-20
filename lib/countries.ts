// Country presets for the Settings page. Picking one fills the region and the map: time zone,
// units, language, a map centre (the main commercial city) and a service area covering the whole
// country. Everything stays editable before saving. Bounding boxes are rounded outwards a little.

export interface CountryPreset {
  iso: string;
  name: string;
  timezone: string;
  units: 'metric' | 'imperial';
  language: string;
  /** Where the map opens: the city named here. */
  city: string;
  center: [lat: number, lng: number];
  zoom: number;
  /** [minLat, maxLat, minLng, maxLng] */
  area: [number, number, number, number];
}

export const COUNTRY_PRESETS: CountryPreset[] = [
  { iso: 'NG', name: 'Nigeria', timezone: 'Africa/Lagos', units: 'metric', language: 'en-NG', city: 'Lagos', center: [6.5244, 3.3792], zoom: 11, area: [4.2, 13.9, 2.6, 14.7] },
  { iso: 'GH', name: 'Ghana', timezone: 'Africa/Accra', units: 'metric', language: 'en-GH', city: 'Accra', center: [5.6037, -0.187], zoom: 11, area: [4.7, 11.2, -3.3, 1.2] },
  { iso: 'BJ', name: 'Benin', timezone: 'Africa/Porto-Novo', units: 'metric', language: 'fr-BJ', city: 'Cotonou', center: [6.3703, 2.3912], zoom: 11, area: [6.1, 12.4, 0.7, 3.9] },
  { iso: 'TG', name: 'Togo', timezone: 'Africa/Lome', units: 'metric', language: 'fr-TG', city: 'Lomé', center: [6.1375, 1.2123], zoom: 11, area: [6.0, 11.2, -0.2, 1.9] },
  { iso: 'CM', name: 'Cameroon', timezone: 'Africa/Douala', units: 'metric', language: 'fr-CM', city: 'Douala', center: [4.0511, 9.7679], zoom: 11, area: [1.6, 13.1, 8.4, 16.2] },
  { iso: 'NE', name: 'Niger', timezone: 'Africa/Niamey', units: 'metric', language: 'fr-NE', city: 'Niamey', center: [13.5116, 2.1254], zoom: 11, area: [11.6, 23.6, 0.1, 16.0] },
  { iso: 'CI', name: "Côte d'Ivoire", timezone: 'Africa/Abidjan', units: 'metric', language: 'fr-CI', city: 'Abidjan', center: [5.36, -4.0083], zoom: 11, area: [4.3, 10.8, -8.7, -2.4] },
  { iso: 'SN', name: 'Senegal', timezone: 'Africa/Dakar', units: 'metric', language: 'fr-SN', city: 'Dakar', center: [14.7167, -17.4677], zoom: 11, area: [12.3, 16.7, -17.6, -11.3] },
  { iso: 'KE', name: 'Kenya', timezone: 'Africa/Nairobi', units: 'metric', language: 'en-KE', city: 'Nairobi', center: [-1.2921, 36.8219], zoom: 11, area: [-4.7, 5.1, 33.9, 41.9] },
  { iso: 'ZA', name: 'South Africa', timezone: 'Africa/Johannesburg', units: 'metric', language: 'en-ZA', city: 'Johannesburg', center: [-26.2041, 28.0473], zoom: 11, area: [-34.9, -22.1, 16.4, 32.9] },
  { iso: 'EG', name: 'Egypt', timezone: 'Africa/Cairo', units: 'metric', language: 'ar-EG', city: 'Cairo', center: [30.0444, 31.2357], zoom: 11, area: [22.0, 31.7, 24.7, 36.9] },
  { iso: 'GB', name: 'United Kingdom', timezone: 'Europe/London', units: 'imperial', language: 'en-GB', city: 'London', center: [51.5074, -0.1278], zoom: 11, area: [49.8, 60.9, -8.7, 1.8] },
  { iso: 'IE', name: 'Ireland', timezone: 'Europe/Dublin', units: 'metric', language: 'en-IE', city: 'Dublin', center: [53.3498, -6.2603], zoom: 11, area: [51.4, 55.4, -10.7, -5.9] },
  { iso: 'US', name: 'United States (mainland)', timezone: 'America/New_York', units: 'imperial', language: 'en-US', city: 'New York', center: [40.7128, -74.006], zoom: 10, area: [24.4, 49.4, -124.8, -66.9] },
  { iso: 'AE', name: 'United Arab Emirates', timezone: 'Asia/Dubai', units: 'metric', language: 'en-AE', city: 'Dubai', center: [25.2048, 55.2708], zoom: 11, area: [22.6, 26.1, 51.5, 56.4] },
  { iso: 'DE', name: 'Germany', timezone: 'Europe/Berlin', units: 'metric', language: 'de-DE', city: 'Berlin', center: [52.52, 13.405], zoom: 11, area: [47.2, 55.1, 5.8, 15.1] },
  { iso: 'FR', name: 'France (mainland)', timezone: 'Europe/Paris', units: 'metric', language: 'fr-FR', city: 'Paris', center: [48.8566, 2.3522], zoom: 11, area: [41.3, 51.1, -5.2, 9.6] },
  { iso: 'IN', name: 'India', timezone: 'Asia/Kolkata', units: 'metric', language: 'en-IN', city: 'Mumbai', center: [19.076, 72.8777], zoom: 11, area: [6.7, 35.7, 68.1, 97.4] },
  { iso: 'CN', name: 'China', timezone: 'Asia/Shanghai', units: 'metric', language: 'zh-CN', city: 'Shanghai', center: [31.2304, 121.4737], zoom: 11, area: [18.1, 53.6, 73.5, 134.8] },
];

const byIso = new Map(COUNTRY_PRESETS.map((c) => [c.iso, c]));
export const countryPreset = (iso: string) => byIso.get(iso);

/** The settings a preset fills. */
export function presetValues(p: CountryPreset) {
  return {
    country: p.iso,
    timezone: p.timezone,
    units: p.units,
    language: p.language,
    center_lat: p.center[0],
    center_lng: p.center[1],
    default_zoom: p.zoom,
    min_lat: p.area[0],
    max_lat: p.area[1],
    min_lng: p.area[2],
    max_lng: p.area[3],
  };
}

/** Languages offered on the page: every preset's, plus a few plain ones. */
export const LANGUAGES: { tag: string; name: string }[] = (() => {
  const tags = new Set(['en', 'fr', 'ar', ...COUNTRY_PRESETS.map((p) => p.language)]);
  const names = (() => {
    try {
      return new Intl.DisplayNames(['en'], { type: 'language' });
    } catch {
      return null;
    }
  })();
  return [...tags]
    .map((tag) => ({ tag, name: names?.of(tag) ?? tag }))
    .sort((a, b) => a.name.localeCompare(b.name));
})();

const FALLBACK_ZONES = [...new Set(COUNTRY_PRESETS.map((p) => p.timezone)), 'UTC'];

/** Every IANA zone the browser knows, else the presets' zones. */
export function timeZones(current: string): string[] {
  let all: string[];
  try {
    all = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone') ?? FALLBACK_ZONES;
  } catch {
    all = FALLBACK_ZONES;
  }
  const set = new Set(all);
  set.add('UTC');
  if (current) set.add(current);
  return [...set].sort();
}
