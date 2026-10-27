// The home page's copy and figures, from the Landing Page design (Claude Design project). They're
// the design's sample content: change them here when the real lanes, numbers and services differ.
// Nothing on the page is computed from live data.

export type LaneStatus = 'IN TRANSIT' | 'ON TIME' | 'DELAYED';
export type Region = 'us' | 'uk' | 'ng';

export interface Lane {
  name: string;
  meta: string;
  status: LaneStatus;
  /** How far along the truck is, 0–1. */
  p: number;
  route: [number, number][];
}

export const LANE_COLOR: Record<LaneStatus, string> = { 'IN TRANSIT': '#2F6FE0', 'ON TIME': '#1E9A55', DELAYED: '#D14343' };

export const REGION_TABS: [Region, string][] = [
  ['us', 'US'],
  ['uk', 'UK'],
  ['ng', 'NIGERIA'],
];

export const LANES: Record<Region, Lane[]> = {
  us: [
    { name: 'Houston → Chicago', meta: 'TX → IL · 1,083 MI · 2 DAYS', status: 'IN TRANSIT', p: 0.56, route: [[29.76, -95.37], [32.78, -96.8], [35.47, -97.52], [36.15, -95.99], [37.21, -93.29], [38.63, -90.2], [41.88, -87.63]] },
    { name: 'Phoenix → El Paso', meta: 'AZ → TX · 430 MI · SAME DAY', status: 'ON TIME', p: 0.78, route: [[33.45, -112.07], [32.22, -110.97], [32.35, -108.71], [32.32, -106.76], [31.76, -106.49]] },
    { name: 'Denver → Kansas City', meta: 'CO → MO · 604 MI · 1 DAY', status: 'DELAYED', p: 0.34, route: [[39.74, -104.99], [39.12, -100.85], [38.84, -97.61], [39.1, -94.58]] },
    { name: 'Memphis → Atlanta', meta: 'TN → GA · 392 MI · SAME DAY', status: 'IN TRANSIT', p: 0.42, route: [[35.15, -90.05], [34.26, -88.7], [33.52, -86.8], [33.75, -84.39]] },
  ],
  uk: [
    { name: 'London → Manchester', meta: '208 MI · SAME DAY', status: 'IN TRANSIT', p: 0.48, route: [[51.507, -0.128], [52.04, -0.76], [52.486, -1.89], [53.48, -2.24]] },
    { name: 'Felixstowe → Leeds', meta: '196 MI · SAME DAY', status: 'ON TIME', p: 0.7, route: [[51.96, 1.35], [52.205, 0.12], [52.57, -0.24], [53.52, -1.13], [53.8, -1.55]] },
    { name: 'Liverpool → Edinburgh', meta: '220 MI · SAME DAY', status: 'DELAYED', p: 0.38, route: [[53.41, -2.98], [54.05, -2.8], [54.89, -2.93], [55.95, -3.19]] },
    { name: 'Southampton → Birmingham', meta: '128 MI · SAME DAY', status: 'IN TRANSIT', p: 0.3, route: [[50.9, -1.4], [51.75, -1.26], [52.41, -1.51], [52.486, -1.89]] },
  ],
  ng: [
    { name: 'Lagos → Abuja', meta: '760 KM · 2 DAYS', status: 'IN TRANSIT', p: 0.52, route: [[6.52, 3.38], [7.38, 3.94], [8.5, 4.55], [9.13, 4.82], [9.08, 6.01], [9.06, 7.49]] },
    { name: 'Kano → Abuja', meta: '420 KM · 1 DAY', status: 'ON TIME', p: 0.66, route: [[12.0, 8.52], [11.09, 7.71], [10.52, 7.44], [9.06, 7.49]] },
    { name: 'Port Harcourt → Calabar', meta: '210 KM · SAME DAY', status: 'DELAYED', p: 0.45, route: [[4.82, 7.03], [5.11, 7.37], [5.18, 7.71], [4.96, 8.33]] },
    { name: 'Lagos → Ibadan', meta: '130 KM · SAME DAY', status: 'IN TRANSIT', p: 0.35, route: [[6.52, 3.38], [6.84, 3.65], [7.38, 3.94]] },
  ],
};

export const BOARD_FOOT: Record<Region, string> = {
  us: 'TRUCKS ON ROAD 38 · ON-TIME 94% · CHECK CALLS EVERY 2 H',
  uk: 'TRUCKS ON ROAD 22 · ON-TIME 96% · CHECK CALLS EVERY 2 H',
  ng: 'TRUCKS ON ROAD 29 · ON-TIME 91% · CHECK CALLS EVERY 2 H',
};

export const STATS = [
  { v: '94', u: '%', k: 'ON-TIME DELIVERY', note: 'Rolling 30 days, all regions' },
  { v: '128', u: '', k: 'TRUCKS IN SERVICE', note: 'Across US, UK and Nigeria' },
  { v: '2', u: 'H', k: 'CHECK-CALL INTERVAL', note: 'Logged to your tracking link' },
  { v: '24', u: '/7', k: 'DISPATCH DESK', note: 'A person answers, day or night' },
];

export const SERVICES = [
  { n: '01', name: 'Full truckload', desc: 'A dedicated trailer from dock to dock, with no stops for other freight.', spec: '53 FT · 13.6 M TRAILERS' },
  { n: '02', name: 'Less-than-truckload', desc: 'Share trailer space and pay for the pallets you ship, on consolidated scheduled runs.', spec: '1–12 PALLETS' },
  { n: '03', name: 'Temperature controlled', desc: 'Reefer units with continuous temperature logging for food and pharma.', spec: '−25 °C TO +25 °C' },
  { n: '04', name: 'Cross-border', desc: 'Customs paperwork prepared before the truck reaches the border.', spec: 'US–MX · UK–EU · ECOWAS' },
  { n: '05', name: 'Warehousing & cross-dock', desc: 'Short-term storage and transfer at our yards, with pick, pack and relabel.', spec: 'HOUSTON · LEEDS · LAGOS' },
];

export const STEPS = [
  { n: '01', t: "Tell us what you're shipping", d: 'Origin, destination, weight and pickup window. Our dispatch desk confirms a rate and books a truck.', cta: 'START A QUOTE', href: 'request' },
  { n: '02', t: 'We dispatch, you track', d: 'You get a live tracking link the moment the driver is assigned, with ETAs updated at every check call.', cta: 'SEE TRACKING', href: '#visibility' },
  { n: '03', t: 'Delivered, with proof', d: 'The driver captures a signed proof of delivery at drop-off, and it reaches your inbox within minutes.', cta: 'READ THE TERMS', href: '/terms' },
] as const;

export const SCHEDULE = [
  { lane: 'Houston → Chicago', code: 'HOU — CHI', country: 'US', dot: '#2F6FE0', transit: '2 days', freq: 'Daily', next: 'Today 18:00' },
  { lane: 'Phoenix → El Paso', code: 'PHX — ELP', country: 'US', dot: '#2F6FE0', transit: 'Same day', freq: '2× daily', next: 'Today 14:30' },
  { lane: 'London → Manchester', code: 'LDN — MAN', country: 'UK', dot: '#1E9A55', transit: 'Same day', freq: '4× daily', next: 'Today 13:00' },
  { lane: 'Felixstowe → Leeds', code: 'FXT — LDS', country: 'UK', dot: '#1E9A55', transit: 'Same day', freq: 'Daily', next: 'Tomorrow 05:00' },
  { lane: 'Lagos → Abuja', code: 'LOS — ABV', country: 'NG', dot: '#E0A800', transit: '2 days', freq: 'Mon · Wed · Fri', next: 'Wed 05:00' },
  { lane: 'Kano → Abuja', code: 'KAN — ABV', country: 'NG', dot: '#E0A800', transit: '1 day', freq: 'Daily', next: 'Tomorrow 05:30' },
];

export const FEATURES = [
  { n: '01', t: 'Live ETA on every load', d: 'Recalculated at each check call and shown on your tracking link.' },
  { n: '02', t: 'Exception alerts', d: 'Weather holds, traffic and road works are flagged with a new ETA as soon as we know.' },
  { n: '03', t: 'Documents in one place', d: 'Bill of lading, rate confirmation and proof of delivery are attached to the load.' },
  { n: '04', t: 'Customer tracking links', d: 'Share one link with your consignee. No login needed.' },
];

export const LOG = [
  { t: 'OCT 25 06:10', ev: 'Picked up · Houston, TX', sub: '18,400 lb · seal 0042817', hot: false, muted: false },
  { t: 'OCT 25 14:32', ev: 'Check call · Dallas, TX', sub: 'On schedule', hot: false, muted: false },
  { t: 'OCT 26 09:42', ev: 'Check call · Tulsa, OK', sub: 'On schedule · ETA Oct 27 14:30', hot: false, muted: false },
  { t: 'OCT 26 12:05', ev: 'Fuel stop · Joplin, MO', sub: 'Driver rest 30 min', hot: true, muted: false },
  { t: 'OCT 27 14:30', ev: 'Delivery · Chicago, IL', sub: 'Expected', hot: false, muted: true },
];

export const INDUSTRIES = [
  { code: 'RTL', t: 'Retail & FMCG', d: 'Store replenishment runs with fixed delivery windows.' },
  { code: 'F&B', t: 'Food & beverage', d: 'Reefer capacity with temperature logs on every load.' },
  { code: 'PHA', t: 'Pharma & healthcare', d: 'Secure, monitored transport for medical supplies.' },
  { code: 'CON', t: 'Construction', d: 'Flatbeds for building materials, delivered to site.' },
  { code: 'AUT', t: 'Automotive', d: 'Just-in-time parts runs to assembly plants.' },
  { code: 'ECM', t: 'E-commerce', d: 'Linehaul between fulfilment centres and sort hubs.' },
];
