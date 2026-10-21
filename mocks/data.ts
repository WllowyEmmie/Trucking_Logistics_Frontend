// In-memory stand-in for the Go API (../trucking-logistics), mirroring its handlers: the same
// routes, response shapes, validation, state rules and error messages. On top of that, trucks on
// delivery move along their legs and report on the ping interval, so the console and tracking
// page behave as they would against real drivers.
import { haversineKm } from '@/lib/format';
import type {
  Config,
  CreateDeliveryRequest,
  DeliveryDetail,
  DeliveryDetailResponse,
  DeliveryEvent,
  DeliveryListItem,
  DeliveryStatus,
  Driver,
  LocationPing,
  Proposal,
  Stop,
  StopKind,
  StopStatus,
  TrackResponse,
  Truck,
  TruckStatus,
  DeliveryEta,
  FailReason,
  HistoryItem,
  HistoryPage,
} from '@/lib/types';
import { THRESHOLDS } from '@/lib/types';

const MIN = 60_000;
const iso = (ms: number) => new Date(ms).toISOString();

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Deterministic v4-shaped uuids, so ids are stable across reloads. */
function uuidGen(seed: number) {
  const r = rng(seed);
  const hex = (n: number) => Array.from({ length: n }, () => Math.floor(r() * 16).toString(16)).join('');
  return () => `${hex(8)}-${hex(4)}-4${hex(3)}-${'89ab'[Math.floor(r() * 4)]}${hex(3)}-${hex(12)}`;
}
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Place {
  addr: string;
  lat: number;
  lng: number;
}

const DEPOT: Place = { addr: 'Kestrel Freight depot, Unit 4, Hollins Industrial Estate, Wakefield WF2 0XT', lat: 53.6745, lng: -1.5285 };
const SUPPLIER: Place = { addr: 'Calder Tiles, Unit 3, Mill Lane, Elland HX5 9DJ', lat: 53.684, lng: -1.838 };
const PLACES: Place[] = [
  { addr: '1180 Marlow Road, Leeds LS12 6HP', lat: 53.79, lng: -1.585 },
  { addr: 'Harrow & Sons Timber, Yard B, Canal Wharf, Stourton, Leeds LS10 1SL', lat: 53.768, lng: -1.52 },
  { addr: 'Unit 12, Thornes Park Business Centre, Denby Dale Road, Wakefield WF2 8DY', lat: 53.671, lng: -1.512 },
  { addr: '14 Brook St, Ilkley LS29 8DE', lat: 53.925, lng: -1.822 },
  { addr: 'Goods-in at rear — use the Station Approach entrance, not the shop front, 2 Market Place, Otley LS21 3AQ', lat: 53.905, lng: -1.692 },
  { addr: 'Arch 7, Viaduct Road, Leeds LS4 2BP', lat: 53.805, lng: -1.583 },
  { addr: '47 Town St, Horsforth LS18 4RJ', lat: 53.842, lng: -1.64 },
  { addr: 'Kirkstall Forge, Abbey Road, Leeds LS5 3NF', lat: 53.825, lng: -1.62 },
  { addr: 'Loading dock 2, Thorpe Park, Century Way, Leeds LS15 8ZB', lat: 53.808, lng: -1.44 },
  { addr: '9 Commercial St, Batley WF17 5HJ', lat: 53.708, lng: -1.633 },
  { addr: 'Mill 3, Saltaire Road, Shipley BD18 3LA', lat: 53.838, lng: -1.79 },
  { addr: 'Leeds Bradford Airport, cargo gate 4 — driver ID required at security, Whitehouse Lane, Yeadon LS19 7TU', lat: 53.866, lng: -1.66 },
  { addr: '22 Bridge Rd, Rothwell LS26 0EN', lat: 53.748, lng: -1.478 },
  { addr: 'Northgate Community Hall, Northgate, Otley LS21 1AA', lat: 53.906, lng: -1.693 },
];

/** Who's on site at a drop-off: not the customer who booked it. */
const SITE_CONTACTS = ['Gate office', 'Joe Pritchard (site manager)', 'Goods-in desk', 'Sarah Lowe', 'Reception'];

const DRIVERS = ['Amaka Obi', 'Dele Harrow', 'Priya Nair', 'Tomasz Wójcik', 'Siobhan Kelly', 'Yusuf Demir', 'Grace Mensah', 'Liam Walsh', 'Chen Wei', 'Marta Silva', 'Kwame Asante', 'Hannah Brooks', 'Imran Qureshi', 'Zofia Nowak', 'Oluwaseun Adeyemi', 'Farah Haddad', 'Ben Carter', 'Aisha Bello', 'Ines Moreau', 'Megan Price', 'Dmitri Volkov', 'Leila Ahmadi', 'Sam Whitaker', 'Ruth Ellis', 'Callum Reid', 'Rui Costa', 'Jonas Berg', 'Nadia Rahman', 'Arjun Mehta', 'Chloe Dunn'];
const CUSTOMERS = ['Ferreira Building Supplies', 'Harrow & Sons Timber', 'Northgate Community Hall', 'Bramley Tile Centre', 'Oakwood Garden Supplies', 'Calder Plumbing Merchants', 'Kirkstall Brewery Co.', 'Moortown Pharmacy', 'Headingley Cycle Works', 'Pudsey Print Studio', 'Rothwell Electrical Wholesale', 'Seacroft Food Bank', 'Chapel Allerton Deli', 'Garforth Joinery', 'Horsforth Flooring', 'Aire Valley Kitchens', 'Morley Paint & Decor', 'Wetherby Farm Shop', 'Otley Hardware', 'Shipley Glass & Glazing', 'Batley Carpet Warehouse', 'Yeadon Aero Parts', 'Leeds Dental Lab', 'Hunslet Motor Factors', 'Armley Bakery', 'Beeston Printworks', 'Roundhay Florist', 'Meanwood Valley Farm', 'Crossgates Hardware', 'Castleford Wholesale Foods', 'Pontefract Office Supplies', 'Ossett Architectural Salvage', 'Ilkley Lido Café'];
const MODELS = ['Mercedes-Benz Atego 1224', 'DAF LF 230', 'Iveco Eurocargo 120E', 'Volvo FL 250', 'Ford Transit 350 L4'];
const plate = (i: number) => 'KF-' + String(i + 1).padStart(2, '0');

/** Tracking links for each customer-facing state (the API requires exactly 16 characters). */
export const DEMO_TOKENS = {
  inTransit: 'demointransit001',
  multiDrop: 'demomultidrop001',
  pending: 'demopending00001',
  assigned: 'demoassigned0001',
  stale: 'demostale0000001',
  completed: 'democompleted001',
  failed: 'demofailed000001',
  cancelled: 'democancelled001',
} as const;

interface LatLng {
  lat: number;
  lng: number;
}

interface Sim {
  from: LatLng;
  to: LatLng;
  t0: number;
  dur: number;
  f0: number;
  /** Stop near the destination instead of completing the stop (driver-controlled or waiting). */
  hold: boolean;
}

interface MTruck extends Truck {
  created_at: string;
  sim: Sim | null;
  off: number;
  frozenSeen: number | null;
  /** Set when the driver's real pings have taken over from the simulation. */
  manual: boolean;
  /** Demo of a stale list: the first assign attempt returns 409 as another dispatcher takes it. */
  race: boolean;
}

interface MDriver extends Driver {
  created_at: string;
}

interface MDelivery {
  id: string;
  reference: string;
  tracking_token: string;
  customer_name: string;
  customer_phone: string | null;
  goods_desc: string | null;
  status: DeliveryStatus;
  truck_id: string | null;
  created_at: string;
  updated_at: string;
  due_by?: string | null;
}

interface MStop extends Stop {
  delivery_id: string;
}

interface MEvent extends DeliveryEvent {
  delivery_id: string;
}

interface Db {
  config: Config;
  trucks: MTruck[];
  drivers: MDriver[];
  deliveries: MDelivery[];
  stops: MStop[];
  events: MEvent[];
  proposals: Proposal[];
  refSeq: number;
  eventSeq: number;
  uuid: () => string;
  tokenRng: () => number;
}

const lerp = (a: LatLng, b: LatLng, f: number): LatLng => ({ lat: a.lat + (b.lat - a.lat) * f, lng: a.lng + (b.lng - a.lng) * f });
/** Driving time for a leg: about 40 km/h plus 2 minutes. */
const legMs = (a: LatLng, b: LatLng) => (haversineKm(a, b) * 1.5 + 2) * MIN;

export class MockError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

// ---- Seed ----

function seed(): Db {
  const now0 = Date.now();
  const r = rng(11);
  const uuid = uuidGen(7);
  const config: Config = {
    units: 'metric',
    timezone: 'Europe/London',
    language: 'en-GB',
    center_lat: 53.683,
    center_lng: -1.505,
    default_zoom: 11,
    min_lat: 53.4,
    max_lat: 54.1,
    min_lng: -2.3,
    max_lng: -1.0,
    country: 'GB',
    operator_name: 'Dispatch',
    support_phone: '',
    dispatch_phone: '',
    depot: null,
    agent_enabled: true,
    auto_assign: false,
    auto_radius_km: 2,
    booking_enabled: false,
    dispatch_email: '',
    price_base: 5000,
    price_per_km: 400,
    price_minimum: 10000,
    ...THRESHOLDS,
    eta_speed_kph: 25,
    stop_minutes: 10,
    board_hours: 12,
    pod_photo_required: false,
    pod_signature_required: true,
    customer_terms: MOCK_TERMS,
    customer_faq: MOCK_FAQ,
    updated_at: null,
    ...savedSettings(),
  };
  const pingMs = THRESHOLDS.ping_seconds * 1000;
  const db: Db = { config, trucks: [], drivers: [], deliveries: [], stops: [], events: [], proposals: [], refSeq: 10001, eventSeq: 1, uuid, tokenRng: rng(99) };

  db.drivers = DRIVERS.map((name, i) => ({ id: uuid(), name, phone: `+44 7700 900${String(100 + i * 7).slice(-3)}`, created_at: iso(now0 - 90 * 24 * 60 * MIN) }));
  db.trucks = Array.from({ length: 32 }, (_, i) => ({
    id: uuid(),
    plate_number: plate(i),
    model: MODELS[i % 5]!,
    status: (i < 22 ? 'on_delivery' : i < 29 ? 'available' : i < 31 ? 'maintenance' : 'offline') as TruckStatus,
    driver_id: db.drivers[i]?.id ?? null,
    lat: null,
    lng: null,
    last_seen_at: null,
    created_at: iso(now0 - 120 * 24 * 60 * MIN),
    sim: null,
    off: (i * 1700) % pingMs,
    frozenSeen: null,
    manual: false,
    race: i === 24, // KF-25
  }));

  const addEvent = (deliveryId: string, type: string, at: number, note: string | null = null, stopId: string | null = null) =>
    db.events.push({ id: db.eventSeq++, delivery_id: deliveryId, event_type: type, note, created_at: iso(at), stop_id: stopId });

  const addDelivery = (customer: string, status: DeliveryStatus, truck: MTruck | null, created: number, places: Place[], token?: string) => {
    const d: MDelivery = {
      id: uuid(),
      reference: `DEL-${new Date(created).getFullYear()}-${db.refSeq++}`,
      tracking_token: token ?? newToken(db),
      customer_name: customer,
      customer_phone: `+44 113 496 0${String(400 + db.refSeq).slice(-3)}`,
      goods_desc: ['12 pallets of floor tiles', 'Timber, 6 m lengths', 'Kitchen units, 14 boxes', 'Paint, 40 tins', null][db.refSeq % 5] ?? null,
      status,
      truck_id: truck?.id ?? null,
      created_at: iso(created),
      updated_at: iso(created),
    };
    db.deliveries.push(d);
    places.forEach((p, k) =>
      db.stops.push({
        id: uuid(),
        delivery_id: d.id,
        sequence: k + 1,
        stop_type: k === 0 ? 'pickup' : 'dropoff',
        address: p.addr,
        lat: p.lat + (r() - 0.5) * 0.004,
        lng: p.lng + (r() - 0.5) * 0.006,
        status: 'pending',
        arrived_at: null,
        completed_at: null,
        // Most drop-offs have a site contact; every third falls back to the customer.
        contact_name: k === 0 || k % 3 === 0 ? null : SITE_CONTACTS[(db.refSeq + k) % SITE_CONTACTS.length]!,
        contact_phone: k === 0 || k % 3 === 0 ? null : `+44 7700 900${String(500 + db.refSeq + k).slice(-3)}`,
      }),
    );
    addEvent(d.id, 'created', created);
    return d;
  };
  const stopsOf = (id: string) => db.stops.filter((s) => s.delivery_id === id);
  const finishStop = (d: MDelivery, s: MStop, arrived: number, done: number) => {
    Object.assign(s, { status: 'completed', arrived_at: iso(arrived), completed_at: iso(done) });
    addEvent(d.id, 'stop_arrived', arrived, null, s.id);
    addEvent(d.id, 'stop_completed', done, null, s.id);
  };

  // 22 trucks on delivery: KF-04, KF-10, KF-15 assigned; the rest in transit.
  const DEMO = 11; // KF-12, the driver app's truck: 5 stops, stop 1 done
  const STALE = 18; // KF-19: silent 26 min, not yet collected
  const ASSIGNED = [3, 9, 14];
  for (let i = 0; i < 22; i++) {
    const t = db.trucks[i]!;
    const n = i === DEMO ? 5 : i === 6 ? 2 : 2 + Math.floor(r() * 3);
    const pickup = i % 5 === 2 ? SUPPLIER : DEPOT;
    const places = [pickup, ...Array.from({ length: n - 1 }, (_, k) => PLACES[(i * 3 + k + (i === DEMO ? 0 : 1)) % PLACES.length]!)];
    const status: DeliveryStatus = ASSIGNED.includes(i) ? 'assigned' : 'in_transit';
    const created = now0 - (150 + Math.floor(r() * 150)) * MIN;
    const token = i === DEMO ? DEMO_TOKENS.multiDrop : i === 6 ? DEMO_TOKENS.inTransit : i === STALE ? DEMO_TOKENS.stale : i === 3 ? DEMO_TOKENS.assigned : undefined;
    const d = addDelivery(CUSTOMERS[i]!, status, t, created, places, token);
    const assignedAt = created + (20 + Math.floor(r() * 30)) * MIN;
    addEvent(d.id, 'assigned', assignedAt, `assigned to ${t.plate_number}`);
    const stops = stopsOf(d.id);
    const done = status === 'assigned' || i === STALE ? 0 : i === DEMO ? 1 : 1 + Math.floor(r() * (n - 1));
    if (status === 'in_transit') addEvent(d.id, 'in_transit', assignedAt + 15 * MIN);
    let tc = assignedAt + 25 * MIN;
    for (let k = 0; k < done; k++) {
      finishStop(d, stops[k]!, Math.min(now0 - 8 * MIN, tc - 6 * MIN), Math.min(now0 - 5 * MIN, tc));
      tc += (16 + Math.floor(r() * 10)) * MIN;
    }
    const from: LatLng = done === 0 ? { lat: DEPOT.lat + (r() - 0.5) * 0.25, lng: DEPOT.lng + (r() - 0.5) * 0.4 } : (stops[done - 1]! as LatLng);
    const to = stops[done]!;
    const dur = legMs(from, to as LatLng);
    const f0 = 0.15 + r() * 0.5;
    t.sim = { from, to: to as LatLng, t0: now0, dur, f0, hold: status === 'assigned' || i === DEMO };
    const p = lerp(from, to as LatLng, f0);
    Object.assign(t, p);
    if (i === STALE) {
      t.sim = null;
      t.frozenSeen = now0 - 26 * MIN;
    }
    if (i === 15) t.sim = null; // parked, still reporting
  }

  // Available trucks: three at the depot, the rest around the area. Maintenance at the depot.
  for (let i = 22; i < 32; i++) {
    const t = db.trucks[i]!;
    if (t.status === 'offline') continue;
    if (i < 25 || t.status === 'maintenance') Object.assign(t, { lat: DEPOT.lat + (r() - 0.5) * 0.006, lng: DEPOT.lng + (r() - 0.5) * 0.01 });
    else Object.assign(t, { lat: DEPOT.lat + (r() - 0.3) * 0.3, lng: DEPOT.lng + (r() - 0.5) * 0.5 });
    if (t.status === 'maintenance') t.last_seen_at = iso(now0 - 3 * 60 * MIN);
  }

  // Four pending, oldest 2 h 14 min.
  [134, 42, 21, 7].forEach((age, k) => {
    const places = [k === 1 ? SUPPLIER : DEPOT, ...Array.from({ length: 1 + (k % 2) }, (_, j) => PLACES[(k * 5 + j + 3) % PLACES.length]!)];
    addDelivery(CUSTOMERS[29 + k]!, 'pending', null, now0 - age * MIN, places, k === 1 ? DEMO_TOKENS.pending : undefined);
  });

  // Ended today: one failed 21 min ago, five completed, one cancelled.
  (
    [
      ['failed', 22, 21],
      ['completed', 23, 35],
      ['completed', 24, 58],
      ['completed', 25, 80],
      ['completed', 26, 105],
      ['completed', 27, 130],
      ['cancelled', null, 260],
    ] as const
  ).forEach(([status, ti, ago], k) => {
    const t = ti != null ? db.trucks[ti]! : null;
    const end = now0 - ago * MIN;
    const token = status === 'failed' ? DEMO_TOKENS.failed : status === 'cancelled' ? DEMO_TOKENS.cancelled : k === 1 ? DEMO_TOKENS.completed : undefined;
    const d = addDelivery(CUSTOMERS[22 + k]!, status, t, end - 150 * MIN, [DEPOT, PLACES[(k * 2 + 5) % PLACES.length]!], token);
    const [pk, drop] = stopsOf(d.id);
    if (t) {
      addEvent(d.id, 'assigned', end - 120 * MIN, `assigned to ${t.plate_number}`);
      addEvent(d.id, 'in_transit', end - 100 * MIN);
      finishStop(d, pk!, end - 80 * MIN, end - 70 * MIN);
    }
    if (status === 'completed') {
      finishStop(d, drop!, end - 8 * MIN, end);
      addEvent(d.id, 'completed', end);
    } else if (status === 'failed') {
      Object.assign(drop!, { status: 'arrived', arrived_at: iso(end - 16 * MIN) });
      addEvent(d.id, 'stop_arrived', end - 16 * MIN, null, drop!.id);
      addEvent(d.id, 'failed', end, 'customer_unavailable');
    } else {
      addEvent(d.id, 'cancelled', end);
    }
    d.updated_at = iso(end);
  });

  db.events.sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));

  // Agent proposals, as the agent would POST them: one change (an assign) and one flag.
  const oldest = [...db.deliveries].filter((d) => d.status === 'pending').sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))[0];
  const free = db.trucks[22]!; // KF-23, available
  if (oldest) {
    db.proposals.push({
      id: uuid(),
      kind: 'change',
      status: 'pending',
      title: `Assign ${free.plate_number} to ${oldest.reference}`,
      why: `${oldest.reference} has waited over two hours and ${free.plate_number} is the nearest available truck to its pickup.`,
      delivery_id: oldest.id,
      truck_id: free.id,
      action: { type: 'assign', delivery_id: oldest.id, truck_id: free.id },
      changes: [{ k: 'Truck', from: 'unassigned', to: free.plate_number }],
      created_at: iso(now0 - 6 * MIN),
      decided_at: null,
      decided_by: null,
    });
  }
  const flagged = db.deliveries.find((d) => d.status === 'in_transit' && d.truck_id === db.trucks[6]!.id);
  if (flagged) {
    db.proposals.push({
      id: uuid(),
      kind: 'flag',
      status: 'pending',
      title: 'Driver stopped away from a stop',
      why: `${db.trucks[6]!.plate_number} has been stationary for 12 minutes, 2 km from its next drop-off.`,
      delivery_id: flagged.id,
      truck_id: db.trucks[6]!.id,
      action: null,
      changes: [],
      created_at: iso(now0 - 3 * MIN),
      decided_at: null,
      decided_by: null,
    });
  }
  return db;
}

function newToken(db: Db): string {
  const abc = 'abcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: 16 }, () => abc[Math.floor(db.tokenRng() * abc.length)]).join('');
}

let db: Db | null = null;

const MOCK_TERMS = `Checking your goods
Please check the goods when they arrive, before you sign. If anything is damaged, tell the driver and note it when you sign.

Damage or missing items
Report it to {company} on {support_phone} within 24 hours of delivery, with your delivery reference and photos.`;
const MOCK_FAQ = [
  { q: 'When will my delivery arrive?', a: 'Once the truck is on its way, this page shows an estimated arrival time. It can change with traffic.' },
  { q: 'Do I have to sign?', a: 'Yes. The receiver signs on the driver\u2019s phone. Check the goods before you sign.' },
];

// Settings saved on the mock's Settings page outlive a reload, like the API's settings row.
const SETTINGS_KEY = 'mock.settings';
function savedSettings(): Partial<Config> {
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(SETTINGS_KEY);
    return raw ? (JSON.parse(raw) as Partial<Config>) : {};
  } catch {
    return {};
  }
}
const getDb = () => (db ??= seed());

// ---- Simulation: trucks on delivery drive to their next stop and report on the ping interval ----

function addEv(d: Db, deliveryId: string, type: string, at: number, note: string | null = null, stopId: string | null = null) {
  d.events.push({ id: d.eventSeq++, delivery_id: deliveryId, event_type: type, note, created_at: iso(at), stop_id: stopId });
}

function advance(now: number) {
  const d = getDb();
  const pingMs = THRESHOLDS.ping_seconds * 1000;
  for (const t of d.trucks) {
    if (t.status === 'offline' || t.status === 'maintenance') continue;
    if (t.frozenSeen != null) {
      t.last_seen_at = iso(t.frozenSeen);
      continue;
    }
    if (t.manual) continue;
    const ping = Math.floor((now - t.off) / pingMs) * pingMs + t.off;
    t.last_seen_at = iso(ping);
    const sim = t.sim;
    if (!sim) continue;
    const f = sim.f0 + (ping - sim.t0) / sim.dur;
    const del = d.deliveries.find((x) => x.truck_id === t.id && x.status === 'in_transit');
    if (f >= 1 && !sim.hold && del) {
      const stops = d.stops.filter((s) => s.delivery_id === del.id);
      const idx = stops.findIndex((s) => s.status !== 'completed' && s.status !== 'skipped');
      const stop = stops[idx];
      if (stop) {
        Object.assign(stop, { status: 'completed', arrived_at: stop.arrived_at ?? iso(ping - 4 * MIN), completed_at: iso(ping) });
        addEv(d, del.id, 'stop_arrived', ping - 4 * MIN, null, stop.id);
        addEv(d, del.id, 'stop_completed', ping, null, stop.id);
      }
      const next = stops[idx + 1];
      if (stop && next) {
        t.sim = { from: stop as LatLng, to: next as LatLng, t0: ping, dur: legMs(stop as LatLng, next as LatLng), f0: 0, hold: false };
        Object.assign(t, { lat: stop.lat, lng: stop.lng });
      } else {
        del.status = 'completed';
        del.updated_at = iso(ping);
        addEv(d, del.id, 'completed', ping);
        Object.assign(t, { status: 'available', sim: null });
      }
      continue;
    }
    Object.assign(t, lerp(sim.from, sim.to, Math.min(sim.hold ? 0.97 : 1, Math.max(0, f))));
  }
}

// ---- Shapes, as the Go structs serialise them ----

const truckOut = (t: MTruck): Truck => ({
  id: t.id,
  plate_number: t.plate_number,
  model: t.model,
  status: t.status,
  driver_id: t.driver_id,
  lng: t.lng,
  lat: t.lat,
  last_seen_at: t.last_seen_at,
});
const stopOut = ({ delivery_id: _d, ...s }: MStop): Stop => s;
const eventOut = ({ id, event_type, stop_id, note, created_at }: MEvent): DeliveryEvent => ({ id, event_type, stop_id, note, created_at });
const listItem = (d: MDelivery): DeliveryListItem => ({
  id: d.id,
  reference: d.reference,
  status: d.status,
  customer_name: d.customer_name,
  truck_id: d.truck_id,
  created_at: d.created_at,
  due_by: d.due_by ?? null,
  eta: etaFor(d)?.arrival ?? null,
  finished_at: finishedAt(d),
});

const FINAL = new Set(['completed', 'cancelled', 'failed']);
/** As the API: the latest completed/cancelled/failed event, for a finished delivery. */
function finishedAt(d: MDelivery): string | null {
  if (!FINAL.has(d.status)) return null;
  const ts = getDb()
    .events.filter((e) => e.delivery_id === d.id && FINAL.has(e.event_type))
    .map((e) => Date.parse(e.created_at));
  return ts.length ? iso(Math.max(...ts)) : d.updated_at;
}

/** The API's estimate (internal/eta): straight line x1.3 at the Settings speed, plus time at each stop. */
function etaFor(d: MDelivery, now = Date.now()): DeliveryEta | null {
  if (d.status !== 'assigned' && d.status !== 'in_transit') return null;
  const db_ = getDb();
  const t = d.truck_id ? db_.trucks.find((x) => x.id === d.truck_id) : undefined;
  if (t?.lat == null || t.lng == null) return null;
  const left = db_.stops
    .filter((s) => s.delivery_id === d.id && (s.status === 'pending' || s.status === 'arrived') && s.lat != null && s.lng != null)
    .sort((a, b) => a.sequence - b.sequence);
  if (!left.length) return null;
  const { eta_speed_kph: kph, stop_minutes } = db_.config;
  const dwell = stop_minutes * MIN;
  let tm = now;
  let pos = { lat: t.lat, lng: t.lng };
  const stops = left.map((s) => {
    let at: number;
    if (s.status === 'arrived') {
      at = s.arrived_at ? Date.parse(s.arrived_at) : now;
      tm = Math.max(now, at + dwell);
    } else {
      at = tm + ((haversineKm(pos, s as LatLng) * 1.3) / kph) * 3600_000;
      tm = at + dwell;
    }
    pos = s as LatLng;
    return { stop_id: s.id, at: iso(at) };
  });
  return { arrival: stops[stops.length - 1]!.at, stops };
}
const rowOut = (d: MDelivery) => ({ id: d.id, reference: d.reference, status: d.status, truck_id: d.truck_id });

// ---- Lookups with the API's error messages ----

function deliveryById(id: string): MDelivery {
  if (!UUID_RE.test(id)) throw new MockError(400, 'invalid delivery id');
  const d = getDb().deliveries.find((x) => x.id === id);
  if (!d) throw new MockError(404, 'delivery not found');
  return d;
}
function truckById(id: string | undefined, notFound = 'truck not found'): MTruck {
  if (!id || !UUID_RE.test(id)) throw new MockError(400, 'invalid truck id');
  const t = getDb().trucks.find((x) => x.id === id);
  if (!t) throw new MockError(404, notFound);
  return t;
}
const inArea = (c: Config, lat: number, lng: number) => lat >= c.min_lat && lat <= c.max_lat && lng >= c.min_lng && lng <= c.max_lng;

/** Ends a delivery's truck run: the truck must be on delivery, and becomes available (or goes to maintenance). */
function releaseTruck(d: MDelivery, next: 'available' | 'maintenance' = 'available') {
  if (!d.truck_id) throw new MockError(409, 'delivery has no truck assigned');
  const t = truckById(d.truck_id);
  if (t.status !== 'on_delivery') throw new MockError(409, `truck ${t.plate_number} is ${t.status}`);
  Object.assign(t, { status: next, sim: null });
}

/** A pending proposal, or the API's 400/404/409. */
function proposalById(id: string): Proposal {
  if (!UUID_RE.test(id)) throw new MockError(400, 'invalid proposal id');
  const p = getDb().proposals.find((x) => x.id === id);
  if (!p) throw new MockError(404, 'proposal not found');
  if (p.status !== 'pending') throw new MockError(409, `proposal is already ${p.status}`);
  return p;
}

const goodsOnTruck = (stops: MStop[]) =>
  stops.some((s) => s.stop_type === 'pickup' && s.status === 'completed') && stops.some((s) => s.status === 'pending' || s.status === 'arrived');

const VALID_STATUSES = new Set(['pending', 'assigned', 'in_transit', 'completed', 'cancelled', 'failed']);
const VALID_REASONS = new Set(['breakdown', 'customer_unavailable', 'goods_damaged', 'accident', 'other']);

export const mock = {
  health: () => ({ status: 'ok' }),
  config: () => getDb().config,

  /** PUT /config: the API's Validate, the checks the page can't make itself. */
  saveConfig(body: Partial<Config>) {
    const d = getDb();
    const next: Config = { ...d.config, ...body, depot: body.depot ?? null };
    if (!next.operator_name?.trim()) throw new MockError(400, 'the company name must be 1 to 80 characters');
    if (next.min_lat >= next.max_lat) throw new MockError(400, 'service area: the southern latitude must be less than the northern one');
    if (next.min_lng >= next.max_lng) throw new MockError(400, 'service area: the western longitude must be less than the eastern one');
    if (!inArea(next, next.center_lat, next.center_lng)) throw new MockError(400, 'the map centre must be inside the service area');
    if (next.depot && !inArea(next, next.depot.lat, next.depot.lng)) throw new MockError(400, 'the depot must be inside the service area');
    next.updated_at = new Date().toISOString();
    next.updated_by = 'You (mock)';
    d.config = next;
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    } catch {
      /* private mode: this session only */
    }
    return next;
  },

  /** POST /config/check: open stops and last-known truck positions outside a proposed area. */
  checkArea(b: { min_lat: number; max_lat: number; min_lng: number; max_lng: number }) {
    const d = getDb();
    const box = { ...d.config, ...b };
    const open = new Set(d.deliveries.filter((x) => ['pending', 'assigned', 'in_transit'].includes(x.status)).map((x) => x.id));
    const stops = d.stops.filter((s) => open.has(s.delivery_id) && s.status !== 'completed' && s.status !== 'skipped' && s.lat != null && s.lng != null && !inArea(box, s.lat, s.lng)).length;
    const trucks = d.trucks.filter((t) => t.lat != null && t.lng != null && !inArea(box, t.lat, t.lng)).length;
    return { stops_outside: stops, trucks_outside: trucks };
  },

  trucks(now = Date.now()) {
    advance(now);
    return [...getDb().trucks].sort((a, b) => a.plate_number.localeCompare(b.plate_number)).map(truckOut);
  },

  createTruck(body: { plate_number?: string; model?: string | null }) {
    const d = getDb();
    const p = (body.plate_number ?? '').trim();
    if (!p) throw new MockError(400, 'plate_number is required');
    // Postgres UNIQUE on plate_number: exact match only. The frontend's normalised check is a hint.
    if (d.trucks.some((t) => t.plate_number === p)) throw new MockError(409, 'a truck with that plate number already exists');
    const t: MTruck = {
      id: d.uuid(),
      plate_number: p,
      model: body.model || null,
      status: 'available',
      driver_id: null,
      lat: null,
      lng: null,
      last_seen_at: null,
      created_at: iso(Date.now()),
      sim: null,
      off: 0,
      frozenSeen: null,
      manual: false,
      race: false,
    };
    d.trucks.push(t);
    return truckOut(t);
  },

  /** PATCH /trucks/{id} (updateTruck in internal/api/trucks.go). */
  updateTruck(id: string, body: { driver_id?: string; status?: string }) {
    const d = getDb();
    let driverId: string | undefined;
    if (body.driver_id) {
      if (!UUID_RE.test(body.driver_id)) throw new MockError(400, 'invalid driver id');
      driverId = body.driver_id;
    }
    if (body.status !== undefined && !['available', 'on_delivery', 'maintenance', 'offline'].includes(body.status))
      throw new MockError(400, 'status must be one of: available, on_delivery, maintenance, offline');
    const t = truckById(id);
    if (body.status !== undefined && t.status === 'on_delivery' && body.status !== 'on_delivery')
      throw new MockError(409, `truck ${t.plate_number} is on a delivery; cancel or complete it first`);
    if (body.status === 'on_delivery' && t.status !== 'on_delivery')
      throw new MockError(409, `truck ${t.plate_number} goes on_delivery by assigning it a delivery`);
    // drivers.id foreign key
    if (driverId && !d.drivers.some((x) => x.id === driverId)) throw new MockError(404, 'driver not found');
    if (body.driver_id === '') t.driver_id = null;
    else if (driverId) t.driver_id = driverId;
    if (body.status !== undefined) t.status = body.status as MTruck['status'];
    const { lng: _lng, lat: _lat, ...row } = truckOut(t);
    return row;
  },

  drivers: () => [...getDb().drivers].sort((a, b) => a.name.localeCompare(b.name)),

  createDriver(body: { name?: string; phone?: string }) {
    const d = getDb();
    if (!body.name?.trim()) throw new MockError(400, 'name is required');
    if (!body.phone?.trim()) throw new MockError(400, 'phone number is required');
    if (d.drivers.some((x) => x.phone === body.phone)) throw new MockError(409, 'a driver with that phone number already exists');
    const drv: MDriver = { id: d.uuid(), name: body.name, phone: body.phone, created_at: iso(Date.now()) };
    d.drivers.push(drv);
    return drv;
  },

  deliveries(status: string | null, board = false, now = Date.now()) {
    advance(now);
    if (status && !VALID_STATUSES.has(status)) throw new MockError(400, 'invalid delivery status');
    const since = now - getDb().config.board_hours * 3600_000;
    return getDb()
      .deliveries.filter((d) => !status || d.status === status)
      .filter((d) => {
        if (!board || !FINAL.has(d.status) || d.status === 'failed') return true;
        const f = finishedAt(d);
        return f != null && Date.parse(f) >= since;
      })
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
      .map(listItem);
  },

  delivery(id: string, now = Date.now()): DeliveryDetailResponse {
    advance(now);
    const db_ = getDb();
    const d = deliveryById(id);
    const t = d.truck_id ? db_.trucks.find((x) => x.id === d.truck_id) : undefined;
    const detail: DeliveryDetail = {
      id: d.id,
      reference: d.reference,
      status: d.status,
      customer_name: d.customer_name,
      customer_phone: d.customer_phone,
      goods_desc: d.goods_desc,
      tracking_token: d.tracking_token,
      truck_id: d.truck_id,
      plate_number: t?.plate_number ?? null,
      truck_lng: t?.lng ?? null,
      truck_lat: t?.lat ?? null,
      truck_seen_at: t?.last_seen_at ?? null,
      created_at: d.created_at,
      due_by: d.due_by ?? null,
    };
    return {
      eta: etaFor(d),
      delivery: detail,
      stops: db_.stops.filter((s) => s.delivery_id === d.id).sort((a, b) => a.sequence - b.sequence).map(stopOut),
      events: db_.events.filter((e) => e.delivery_id === d.id).map(eventOut),
    };
  },

  createDelivery(body: Partial<CreateDeliveryRequest>) {
    const db_ = getDb();
    const c = db_.config;
    // validateDeliveryInput, in the same order and words.
    if (!body.customer_name) throw new MockError(400, 'customer_name is required');
    const stops = body.stops ?? [];
    if (stops.length < 2) throw new MockError(400, 'at least two stops are required');
    if (stops[0]!.stop_type !== 'pickup') throw new MockError(400, 'the first stop must be a pickup');
    stops.forEach((s, i) => {
      if (s.stop_type !== 'pickup' && s.stop_type !== 'dropoff') throw new MockError(400, 'stop_type must be pickup or dropoff');
      if (!s.address) throw new MockError(400, 'every stop needs an address');
      if (s.lat == null || s.lng == null) throw new MockError(400, 'every stop needs lat and lng');
      if (!inArea(c, s.lat, s.lng)) throw new MockError(400, "coordinates must be within the service area — check that lat and lng aren't swapped");
      if (i > 0 && s.stop_type === 'pickup') throw new MockError(400, 'only the first stop can be a pickup');
    });
    const now = Date.now();
    const d: MDelivery = {
      id: db_.uuid(),
      reference: `DEL-${new Date(now).getFullYear()}-${db_.refSeq++}`,
      tracking_token: newToken(db_),
      customer_name: body.customer_name,
      customer_phone: body.customer_phone ?? null,
      goods_desc: body.goods_desc ?? null,
      status: 'pending',
      truck_id: null,
      created_at: iso(now),
      updated_at: iso(now),
      due_by: body.due_by ?? null,
    };
    if (d.due_by && Date.parse(d.due_by) < now - 15 * MIN) throw new MockError(400, 'the due time has already passed');
    db_.deliveries.push(d);
    const created = stops.map((s, i) => {
      const st: MStop = {
        id: db_.uuid(),
        delivery_id: d.id,
        sequence: i + 1,
        stop_type: s.stop_type as StopKind,
        address: s.address,
        lat: s.lat,
        lng: s.lng,
        status: 'pending',
        arrived_at: null,
        completed_at: null,
        contact_name: s.contact_name ?? null,
        contact_phone: s.contact_phone ?? null,
      };
      db_.stops.push(st);
      return { id: st.id, sequence: st.sequence, stop_type: st.stop_type, address: st.address, status: st.status };
    });
    addEv(db_, d.id, 'created', now);
    const { updated_at: _u, truck_id: _t, ...delivery } = d;
    return { delivery, stops: created };
  },

  assign(deliveryId: string, truckId: string | undefined) {
    const db_ = getDb();
    advance(Date.now());
    const d = deliveryById(deliveryId);
    if (!truckId || !UUID_RE.test(truckId)) throw new MockError(400, 'invalid truck id');
    if (d.status !== 'pending') throw new MockError(409, `delivery is ${d.status} and cannot be assigned`);
    const t = truckById(truckId);
    if (t.race) {
      // Someone else got there first: the truck list the dispatcher saw was out of date.
      t.race = false;
      t.status = 'on_delivery';
    }
    if (t.status !== 'available') throw new MockError(409, `truck ${t.plate_number} is ${t.status}`);
    if (!t.driver_id) throw new MockError(409, `truck ${t.plate_number} has no driver; give it a driver in Fleet first`);
    const now = Date.now();
    d.status = 'assigned';
    d.truck_id = t.id;
    d.updated_at = iso(now);
    t.status = 'on_delivery';
    const pk = db_.stops.find((s) => s.delivery_id === d.id && s.sequence === 1)!;
    if (t.lat != null && t.lng != null && pk.lat != null && pk.lng != null)
      t.sim = { from: { lat: t.lat, lng: t.lng }, to: pk as LatLng, t0: now, dur: legMs(t as LatLng, pk as LatLng), f0: 0, hold: true };
    addEv(db_, d.id, 'assigned', now, `assigned to ${t.plate_number}`);
    return rowOut(d);
  },

  /** POST /deliveries/{id}/reopen {mode, truck_id}: the API's rules (internal/api/reopen.go). */
  reopen(id: string, mode: string | undefined, truckId: string | undefined) {
    const db_ = getDb();
    const d = deliveryById(id);
    if (mode !== 'resume' && mode !== 'handover' && mode !== 'restart') throw new MockError(400, 'mode must be resume, handover or restart');
    if (!truckId || !UUID_RE.test(truckId)) throw new MockError(400, 'choose a truck');
    if (d.status !== 'failed') throw new MockError(409, `delivery is ${d.status}; only a failed delivery can be sent out again`);
    const stops = db_.stops.filter((s) => s.delivery_id === d.id).sort((a, b) => a.sequence - b.sequence);
    const old = d.truck_id ? truckById(d.truck_id) : null;
    const plate = old?.plate_number ?? 'the truck';
    const loaded = goodsOnTruck(stops);
    const same = d.truck_id === truckId;
    if (mode === 'resume' && loaded && !same) throw new MockError(409, `the goods are on ${plate}: send ${plate} again, or hand them over to another truck`);
    if (mode === 'handover' && !loaded) throw new MockError(409, "nothing has been collected yet, so there's nothing to hand over: reassign it instead");
    if (mode === 'handover' && same) throw new MockError(409, `a handover goes to a different truck than ${plate}`);
    if (mode === 'handover' && (old?.lat == null || old?.lng == null)) throw new MockError(409, `${plate} has never reported a position, so there's no handover point: start over instead`);

    const savedStops = db_.stops.map((s) => ({ ...s }));
    const before = { status: d.status, truck_id: d.truck_id };
    const evCount = db_.events.length;
    if (mode === 'handover') {
      const at = stops.find((s) => s.status === 'pending' || s.status === 'arrived')!.sequence;
      for (const s of stops) if (s.sequence >= at) s.sequence += 1;
      const drv = old!.driver_id ? db_.drivers.find((x) => x.id === old!.driver_id) : undefined;
      db_.stops.push({
        id: db_.uuid(), delivery_id: d.id, sequence: at, stop_type: 'pickup', address: `Handover from ${plate}`,
        lat: old!.lat, lng: old!.lng, status: 'pending', arrived_at: null, completed_at: null,
        contact_name: drv?.name ?? null, contact_phone: drv?.phone ?? null,
      });
    }
    for (const s of db_.stops)
      if (s.delivery_id === d.id && (mode === 'restart' || s.status === 'pending' || s.status === 'arrived'))
        Object.assign(s, { status: 'pending', arrived_at: null, completed_at: null });
    d.status = 'pending';
    d.truck_id = null;
    const note = mode === 'handover' ? `handover from ${plate}` : mode === 'restart' ? 'starting over from the pickup' : loaded ? 'trying again' : 'reassigned';
    addEv(db_, d.id, 'reopened', Date.now(), `${note} · by You (mock)`);
    try {
      return this.assign(id, truckId);
    } catch (e) {
      // One transaction in the API: a refused truck leaves it failed.
      Object.assign(d, before);
      db_.stops = savedStops;
      db_.events.length = evCount;
      throw e;
    }
  },

  /** GET /deliveries/history: finished deliveries, newest first, keyset-paged like the API. */
  history(q: URLSearchParams): HistoryPage {
    advance(Date.now());
    const db_ = getDb();
    const outcome = q.get('outcome') ?? '';
    if (!['', 'completed', 'cancelled', 'failed', 'recovered', 'late'].includes(outcome))
      throw new MockError(400, 'outcome must be completed, cancelled, failed, recovered or late');
    const text = (q.get('q') ?? '').trim().toLowerCase();
    const from = q.get('from') ? Date.parse(q.get('from')!) : null;
    const to = q.get('to') ? Date.parse(q.get('to')!) : null;
    const limit = Math.min(200, Math.max(1, Number(q.get('limit') ?? 50) || 50));
    const before = q.get('before') ? JSON.parse(atob(q.get('before')!)) as { at: string; id: string } : null;
    const rows: HistoryItem[] = db_.deliveries
      .filter((d) => FINAL.has(d.status))
      .map((d) => {
        const ev = db_.events.filter((e) => e.delivery_id === d.id);
        const fails = ev.filter((e) => e.event_type === 'failed');
        const assigned = ev.filter((e) => e.event_type === 'assigned').pop();
        const finished = finishedAt(d)!;
        return {
          id: d.id,
          reference: d.reference,
          customer_name: d.customer_name,
          status: d.status as HistoryItem['status'],
          created_at: d.created_at,
          finished_at: finished,
          due_by: d.due_by ?? null,
          failures: fails.length,
          reopens: ev.filter((e) => e.event_type === 'reopened').length,
          first_fail_reason: (fails[0]?.note as FailReason | undefined) ?? null,
          plate: assigned?.note?.replace(/^assigned to /, '') ?? null,
          late: d.status === 'completed' && !!d.due_by && Date.parse(finished) > Date.parse(d.due_by),
        };
      })
      .filter((h) => {
        if (outcome === 'recovered') return h.status === 'completed' && h.failures > 0;
        if (outcome === 'late') return h.late;
        return !outcome || h.status === outcome;
      })
      .filter((h) => !text || h.reference.toLowerCase().includes(text) || h.customer_name.toLowerCase().includes(text))
      .filter((h) => (from == null || Date.parse(h.finished_at) >= from) && (to == null || Date.parse(h.finished_at) < to))
      .sort((a, b) => Date.parse(b.finished_at) - Date.parse(a.finished_at) || b.id.localeCompare(a.id))
      .filter((h) => !before || Date.parse(h.finished_at) < Date.parse(before.at) || (h.finished_at === before.at && h.id < before.id));
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    return { items: page, next: rows.length > limit && last ? btoa(JSON.stringify({ at: last.finished_at, id: last.id })) : null };
  },

  /** POST …/stops/{stopId}/proof: kept as a summary (the mock serves no images). */
  saveProof(id: string, stopId: string, b: { receiver_name?: string; photo?: string | null; signature?: string | null }) {
    const db_ = getDb();
    const d = deliveryById(id);
    const s = db_.stops.find((x) => x.id === stopId && x.delivery_id === d.id);
    if (!s) throw new MockError(404, 'stop not found on this delivery');
    if (!b.receiver_name?.trim()) throw new MockError(400, 'enter who received it (up to 100 characters)');
    if (s.stop_type !== 'dropoff') throw new MockError(409, 'proof of delivery is for drop-offs');
    s.proof = { receiver_name: b.receiver_name.trim(), captured_at: iso(Date.now()), has_photo: !!b.photo, has_signature: !!b.signature, lat: null, lng: null, saved_by: 'You (mock)' };
    addEv(db_, d.id, 'proof', Date.now(), `received by ${s.proof.receiver_name}`, s.id);
    return s.proof;
  },

  /** POST /deliveries/{id}/due {due_by | null} */
  setDue(id: string, due: string | null | undefined) {
    const db_ = getDb();
    const d = deliveryById(id);
    if (due && Date.parse(due) < Date.now() - 15 * MIN) throw new MockError(400, 'the due time has already passed');
    if (d.status === 'completed' || d.status === 'cancelled') throw new MockError(409, `delivery is ${d.status}; its due time can't change`);
    d.due_by = due ?? null;
    addEv(db_, d.id, 'due_changed', Date.now(), due ?? '');
    return { id: d.id, due_by: d.due_by };
  },

  start(id: string) {
    const db_ = getDb();
    const d = deliveryById(id);
    if (d.status !== 'assigned') throw new MockError(409, `delivery is ${d.status} and cannot be set to in_transit`);
    d.status = 'in_transit';
    addEv(db_, d.id, 'in_transit', Date.now());
    return rowOut(d);
  },

  complete(id: string) {
    const db_ = getDb();
    const d = deliveryById(id);
    if (d.status !== 'in_transit') throw new MockError(409, `delivery is ${d.status} and cannot be updated to completed`);
    // As the API: every stop must be done first.
    if (db_.stops.some((s) => s.delivery_id === d.id && s.status !== 'completed' && s.status !== 'skipped'))
      throw new MockError(409, 'delivery still has open stops; complete every stop first');
    releaseTruck(d);
    d.status = 'completed';
    addEv(db_, d.id, 'completed', Date.now());
    return rowOut(d);
  },

  fail(id: string, reason: string | undefined) {
    const db_ = getDb();
    const d = deliveryById(id);
    if (!reason || !VALID_REASONS.has(reason))
      throw new MockError(400, 'reason must be one of: breakdown, customer_unavailable, goods_damaged, accident, other');
    if (d.status !== 'in_transit') throw new MockError(409, `delivery is ${d.status} and cannot be marked failed`);
    // A breakdown or an accident sends the truck to the workshop, as its own event after `failed`.
    const workshop = reason === 'breakdown' || reason === 'accident';
    releaseTruck(d, workshop ? 'maintenance' : 'available');
    d.status = 'failed';
    const now = Date.now();
    addEv(db_, d.id, 'failed', now, reason);
    if (workshop) addEv(db_, d.id, 'truck_maintenance', now);
    return { delivery: rowOut(d), reason };
  },

  cancel(id: string) {
    const db_ = getDb();
    const d = deliveryById(id);
    if (!['pending', 'assigned', 'in_transit', 'failed'].includes(d.status)) throw new MockError(409, `delivery is ${d.status} and cannot be cancelled`);
    // A failed delivery already let its truck go.
    if (d.truck_id && d.status !== 'failed') releaseTruck(d);
    d.status = 'cancelled';
    d.truck_id = null;
    addEv(db_, d.id, 'cancelled', Date.now());
    return rowOut(d);
  },

  /** GET /geocode?q= (internal/api/geocode.go): the mock's own places, matched on every word. */
  geocode(q: string | null) {
    const text = (q ?? '').trim();
    if (text.length < 3 || text.length > 200) throw new MockError(400, 'q must be 3 to 200 characters');
    const words = text.toLowerCase().split(/\s+/);
    return [DEPOT, ...PLACES]
      .filter((p) => words.every((w) => p.addr.toLowerCase().includes(w)))
      .slice(0, 5)
      .map((p) => ({ label: p.addr, lat: p.lat, lng: p.lng }));
  },

  // ---- Proposals (internal/api/proposal.go) ----

  proposals(status: string | null) {
    const s = status || 'pending';
    if (!['pending', 'approved', 'rejected', 'expired'].includes(s)) throw new MockError(400, 'invalid proposal status');
    return getDb()
      .proposals.filter((p) => p.status === s)
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  },

  createProposal(body: Partial<Omit<Proposal, 'action'>> & { action?: unknown }) {
    const db_ = getDb();
    if (body.kind !== 'change' && body.kind !== 'flag') throw new MockError(400, 'kind must be change or flag');
    if (!body.title) throw new MockError(400, 'title is required');
    if (!body.why) throw new MockError(400, 'why is required — a proposal without reasoning cannot be judged');
    const hasAction = body.action != null;
    if (body.kind === 'change' && !hasAction) throw new MockError(400, 'a change proposal needs an action');
    if (body.kind === 'flag' && hasAction) throw new MockError(400, 'a flag has nothing to execute and must not carry an action');
    const act = body.action as Proposal['action'];
    if (act) {
      if (act.type !== 'assign' && act.type !== 'reopen') throw new MockError(400, 'action type must be assign or reopen');
      if (act.type === 'reopen' && !['resume', 'handover', 'restart'].includes(act.mode))
        throw new MockError(400, 'a reopen action needs mode resume, handover or restart');
      if (!UUID_RE.test(act.delivery_id ?? '')) throw new MockError(400, 'action.delivery_id must be a uuid');
      if (!UUID_RE.test(act.truck_id ?? '')) throw new MockError(400, 'action.truck_id must be a uuid');
    }
    if (body.delivery_id && !UUID_RE.test(body.delivery_id)) throw new MockError(400, 'invalid delivery id');
    if (body.truck_id && !UUID_RE.test(body.truck_id)) throw new MockError(400, 'invalid truck id');
    if ((body.delivery_id && !db_.deliveries.some((d) => d.id === body.delivery_id)) || (body.truck_id && !db_.trucks.some((t) => t.id === body.truck_id)))
      throw new MockError(404, 'the delivery or truck this proposal refers to does not exist');
    const p: Proposal = {
      id: db_.uuid(),
      kind: body.kind,
      status: 'pending',
      title: body.title,
      why: body.why,
      delivery_id: body.delivery_id || null,
      truck_id: body.truck_id || null,
      action: act ?? null,
      changes: body.changes ?? [],
      created_at: iso(Date.now()),
      decided_at: null,
      decided_by: null,
    };
    db_.proposals.push(p);
    return p;
  },

  /** Runs the action through the same rules as /assign. A 409 there means the proposal went stale: it expires. */
  approveProposal(id: string) {
    const p = proposalById(id);
    if (p.kind !== 'change' || !p.action) throw new MockError(409, 'a flag has nothing to approve');
    try {
      if (p.action.type === 'reopen') mock.reopen(p.action.delivery_id, p.action.mode, p.action.truck_id);
      else mock.assign(p.action.delivery_id, p.action.truck_id);
    } catch (e) {
      if (e instanceof MockError && e.status === 409) Object.assign(p, { status: 'expired', decided_at: iso(Date.now()), decided_by: `system: ${e.message}` });
      throw e;
    }
    return Object.assign(p, { status: 'approved', decided_at: iso(Date.now()), decided_by: 'dispatcher' });
  },

  rejectProposal(id: string) {
    const p = proposalById(id);
    return Object.assign(p, { status: 'rejected', decided_at: iso(Date.now()), decided_by: 'dispatcher' });
  },

  /** POST /deliveries/{id}/stops/{stopId}/arrive|complete: in order, while in transit. */
  advanceStop(id: string, stopId: string, action: 'arrive' | 'complete') {
    const db_ = getDb();
    const d = deliveryById(id);
    if (!UUID_RE.test(stopId)) throw new MockError(400, 'invalid stop id');
    if (d.status !== 'in_transit') throw new MockError(409, `delivery is ${d.status}; stops can only change while it is in transit`);
    const stop = db_.stops.find((s) => s.id === stopId && s.delivery_id === d.id);
    if (!stop) throw new MockError(404, 'stop not found on this delivery');
    const behind = db_.stops.filter((s) => s.delivery_id === d.id && s.sequence < stop.sequence && s.status !== 'completed' && s.status !== 'skipped');
    if (behind.length) throw new MockError(409, 'an earlier stop is still open; finish stops in order');
    const now = Date.now();
    if (action === 'arrive') {
      if (stop.status !== 'pending') throw new MockError(409, `stop is already ${stop.status}`);
      Object.assign(stop, { status: 'arrived' as StopStatus, arrived_at: iso(now) });
    } else {
      if (stop.status !== 'arrived') throw new MockError(409, `stop is ${stop.status}; mark arrival first`);
      Object.assign(stop, { status: 'completed' as StopStatus, completed_at: iso(now) });
    }
    addEv(db_, d.id, action === 'arrive' ? 'stop_arrived' : 'stop_completed', now, null, stop.id);
    const { id: sid, sequence, stop_type, status, arrived_at, completed_at } = stop;
    return { id: sid, sequence, stop_type, status, arrived_at, completed_at };
  },

  locations(body: { truck_id?: string; pings?: Partial<LocationPing>[] }) {
    const db_ = getDb();
    const c = db_.config;
    const now = Date.now();
    if (!body.truck_id || !UUID_RE.test(body.truck_id)) throw new MockError(400, 'invalid truck id');
    const pings = body.pings ?? [];
    if (pings.length === 0) throw new MockError(400, 'at least one ping is required');
    if (pings.length > 500) throw new MockError(400, 'too many pings');
    for (const p of pings) {
      if (p.lat == null || p.lng == null || !p.recorded_at) throw new MockError(400, 'every ping needs lat, lng and recorded_at');
      if (Date.parse(p.recorded_at) > now + 2 * MIN) throw new MockError(400, 'recorded_at cannot be in the future');
      if (!inArea(c, p.lat, p.lng)) throw new MockError(400, 'coordinates must be within the service area');
    }
    const t = truckById(body.truck_id);
    const latest = [...pings].sort((a, b) => Date.parse(b.recorded_at!) - Date.parse(a.recorded_at!))[0]!;
    // Older than what the truck already has: ignored (late batches are safe to send).
    if (!t.last_seen_at || Date.parse(latest.recorded_at!) >= Date.parse(t.last_seen_at) || t.frozenSeen != null) {
      Object.assign(t, { lat: latest.lat, lng: latest.lng, last_seen_at: latest.recorded_at, manual: true, frozenSeen: null });
    }
    return { accepted: pings.length };
  },

  track(token: string): TrackResponse {
    const db_ = getDb();
    advance(Date.now());
    if (token.length !== 16) throw new MockError(404, 'delivery not found');
    const d = db_.deliveries.find((x) => x.tracking_token === token);
    if (!d) throw new MockError(404, 'delivery not found');
    const t = d.truck_id ? db_.trucks.find((x) => x.id === d.truck_id) : undefined;
    // As the API: the truck's position only while it's working on this delivery.
    const live = d.status === 'assigned' || d.status === 'in_transit';
    return {
      reference: d.reference,
      status: d.status,
      plate_number: t?.plate_number ?? null,
      customer_name: d.customer_name,
      goods_desc: d.goods_desc,
      created_at: d.created_at,
      truck_lng: live ? (t?.lng ?? null) : null,
      truck_lat: live ? (t?.lat ?? null) : null,
      truck_seen_at: live ? (t?.last_seen_at ?? null) : null,
      due_by: d.due_by ?? null,
      eta: etaFor(d)?.arrival ?? null,
      stops: db_.stops
        .filter((s) => s.delivery_id === d.id)
        .sort((a, b) => a.sequence - b.sequence)
        .map(({ sequence, stop_type, address, lng, lat, status, arrived_at }) => ({ sequence, stop_type, address, lng, lat, status, arrived_at })),
      // TrackingEvent: no id, no stop_id.
      events: db_.events.filter((e) => e.delivery_id === d.id).map(({ event_type, note, created_at }) => ({ event_type, note, created_at })),
    };
  },
};
