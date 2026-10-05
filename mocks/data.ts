// In-memory stand-in for the Go API, seeded from the design files' sample data.
// Trucks on delivery move along their legs and report on the ping interval, so the
// console and tracking page behave as they would against the real feed.
import { DEFAULT_CONFIG } from '@/lib/config';
import { haversineKm } from '@/lib/format';
import type {
  Config,
  Delivery,
  DeliveryEvent,
  Driver,
  LocationPing,
  Proposal,
  Stop,
  StopKind,
  TrackResponse,
  Truck,
} from '@/lib/types';

const MIN = 60_000;
const iso = (ms: number) => new Date(ms).toISOString();

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

interface Place {
  addr: string;
  lat: number;
  lng: number;
}

const DEPOT: Place = { addr: 'Kestrel Freight depot, Unit 4, Hollins Industrial Estate, Wakefield WF2 0XT', lat: 53.6745, lng: -1.5285 };
const SUPPLIER: Place = { addr: 'Calder Tiles, Unit 3, Mill Lane, Elland HX5 9DJ', lat: 53.684, lng: -1.838 };
const PLACES: Place[] = [
  { addr: '1180 Marlow Road, Leeds LS12 6HP', lat: 53.79, lng: -1.585 },
  { addr: 'Yard B, Canal Wharf, Stourton, Leeds LS10 1SL', lat: 53.768, lng: -1.52 },
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
  { addr: 'Crossgates Shopping Centre service yard, Station Road, Leeds LS15 8ET', lat: 53.805, lng: -1.452 },
];

const DRIVERS = ['Amaka Obi', 'Dele Harrow', 'Priya Nair', 'Tomasz Wójcik', 'Siobhan Kelly', 'Yusuf Demir', 'Grace Mensah', 'Liam Walsh', 'Chen Wei', 'Marta Silva', 'Kwame Asante', 'Hannah Brooks', 'Imran Qureshi', 'Zofia Nowak', 'Oluwaseun Adeyemi', 'Farah Haddad', 'Ben Carter', 'Aisha Bello', 'Ines Moreau', 'Megan Price', 'Dmitri Volkov', 'Leila Ahmadi', 'Sam Whitaker', 'Ruth Ellis', 'Callum Reid', 'Rui Costa', 'Jonas Berg', 'Nadia Rahman', 'Arjun Mehta', 'Chloe Dunn', 'Mateus Rocha', 'Eva Horvath'];
const CUSTOMERS = ['Ferreira Building Supplies', 'Harrow & Sons Timber', 'Northgate Community Hall', 'Bramley Tile Centre', 'Oakwood Garden Supplies', 'Calder Plumbing Merchants', 'Kirkstall Brewery Co.', 'Moortown Pharmacy', 'Headingley Cycle Works', 'Pudsey Print Studio', 'Rothwell Electrical Wholesale', 'Seacroft Food Bank', 'Chapel Allerton Deli', 'Garforth Joinery', 'Horsforth Flooring', 'Aire Valley Kitchens', 'Morley Paint & Decor', 'Wetherby Farm Shop', 'Otley Hardware', 'Shipley Glass & Glazing', 'Batley Carpet Warehouse', 'Yeadon Aero Parts', 'Leeds Dental Lab', 'Hunslet Motor Factors', 'Armley Bakery', 'Beeston Printworks', 'Roundhay Florist', 'Meanwood Valley Farm', 'Crossgates Hardware', 'Castleford Wholesale Foods', 'Pontefract Office Supplies', 'Ossett Architectural Salvage', 'Ilkley Lido Café'];
const MODELS = ['Mercedes-Benz Atego 1224', 'DAF LF 230', 'Iveco Eurocargo 120E', 'Volvo FL 250', 'Ford Transit 350 L4'];
const DISPATCHER = process.env.NEXT_PUBLIC_DEMO_DISPATCHER ?? 'M. Duarte';
const plate = (i: number) => 'KF-' + String(i + 1).padStart(2, '0');

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
  sim: Sim | null;
  off: number;
  frozenSeen: number | null;
  /** Set when the driver's real pings have taken over from the simulation. */
  manual: boolean;
  /** Demo of a stale list: the first assign attempt returns 409 for this delivery. */
  race: string | null;
}

interface MDelivery extends Delivery {
  mineSeq: number;
  signedBy: string | null;
  windows: Record<number, [number, number]>;
}

interface Db {
  now0: number;
  config: Config;
  trucks: MTruck[];
  drivers: Driver[];
  deliveries: MDelivery[];
  proposals: Proposal[];
  tokens: Record<string, string>;
  seq: number;
}

const lerp = (a: LatLng, b: LatLng, f: number): LatLng => ({ lat: a.lat + (b.lat - a.lat) * f, lng: a.lng + (b.lng - a.lng) * f });
/** Driving time for a leg: about 40 km/h plus 2 minutes. */
const legMs = (a: LatLng, b: LatLng) => (haversineKm(a, b) * 1.5 + 2) * MIN;

function makeStop(seq: number, kind: StopKind, p: Place, jitter: () => number): Stop {
  return {
    seq,
    kind,
    address: p.addr,
    lat: p.lat + (jitter() - 0.5) * 0.004,
    lng: p.lng + (jitter() - 0.5) * 0.006,
    status: 'pending',
    contact_name: null,
    contact_phone: null,
    alt_phone: null,
    notes: null,
    promised_at: null,
    eta: null,
    completed_at: null,
  };
}

function seed(): Db {
  const now0 = Date.now();
  const r = rng(11);
  const config: Config = { ...DEFAULT_CONFIG };
  const pingMs = config.ping_seconds * 1000;

  const trucks: MTruck[] = DRIVERS.map((driver, i) => ({
    id: plate(i),
    plate_number: plate(i),
    model: MODELS[i % 5]!,
    status: i < 22 ? 'on_delivery' : i < 29 ? 'available' : i < 31 ? 'maintenance' : 'offline',
    driver_name: driver,
    lat: null,
    lng: null,
    last_seen_at: null,
    delivery_id: null,
    status_note: null,
    payload_kg: MODELS[i % 5]!.includes('Transit') ? 1400 : 5500 + (i % 3) * 1500,
    pallet_spaces: MODELS[i % 5]!.includes('Transit') ? 2 : 10 + (i % 3) * 2,
    sim: null,
    off: (i * 1700) % pingMs,
    frozenSeen: null,
    manual: false,
    race: null,
  }));

  const deliveries: MDelivery[] = [];
  const LATE: Record<number, number> = { 15: 35, 6: 22, 13: 14 };
  const ASSIGNED = [3, 9, 14];
  const DEMO = 11; // KF-12, the driver app's truck
  const STALE = 18; // KF-19

  for (let i = 0; i < 22; i++) {
    const t = trucks[i]!;
    const id = 'DLV-' + (40707 + i);
    let stops: Stop[];
    if (i === DEMO) {
      stops = [
        makeStop(1, 'pickup', DEPOT, r),
        { ...makeStop(2, 'dropoff', { ...PLACES[1]!, addr: 'Harrow & Sons Timber, Yard B, Canal Wharf, Stourton, Leeds LS10 1SL' }, r), contact_name: 'Dele Harrow · yard office', contact_phone: '+44 113 496 0777', alt_phone: '+44 113 496 0778', notes: 'Forklift on site. Yard gate closes 16:00.' },
        { ...makeStop(3, 'dropoff', { ...PLACES[0]!, addr: 'Ferreira Building Supplies — goods-in bay 3 (rear entrance off Carr Lane), 1180 Marlow Road, Leeds LS12 6HP' }, r), contact_name: 'Ana Ferreira · goods-in', contact_phone: '+44 113 496 0812' },
        { ...makeStop(4, 'dropoff', PLACES[3]!, r), contact_name: 'Ilkley Lido Café', contact_phone: '+44 1943 496 021' },
        { ...makeStop(5, 'dropoff', { addr: 'Northgate Community Hall, Northgate, Otley LS21 1AA', lat: 53.906, lng: -1.693 }, r), contact_name: 'Hall caretaker', contact_phone: '+44 1943 496 554' },
      ];
    } else {
      const n = 2 + Math.floor(r() * 3);
      stops = [makeStop(1, 'pickup', i % 5 === 2 ? SUPPLIER : DEPOT, r)];
      for (let k = 1; k < n; k++) {
        const p = PLACES[(i * 3 + k) % PLACES.length]!;
        stops.push({ ...makeStop(k + 1, 'dropoff', p, r), contact_name: CUSTOMERS[(i + k) % CUSTOMERS.length]!, contact_phone: '+44 113 496 0' + String(400 + i * 7 + k).slice(-3) });
      }
    }
    const n = stops.length;
    const status = ASSIGNED.includes(i) ? 'assigned' : 'in_transit';
    const done = status === 'assigned' || i === STALE ? 0 : i === DEMO ? 1 : 1 + Math.floor(r() * (n - 1));
    const created = now0 - (150 + Math.floor(r() * 150)) * MIN;
    const assignedAt = created + (20 + Math.floor(r() * 30)) * MIN;
    const startAt = assignedAt + 15 * MIN;
    const events: DeliveryEvent[] = [
      { at: iso(created), text: `Created by ${DISPATCHER}` },
      { at: iso(assignedAt), text: `Assigned to ${t.plate_number} · ${t.driver_name}` },
    ];
    let tc = startAt + 10 * MIN;
    if (status === 'in_transit') events.push({ at: iso(startAt), text: 'Started' });
    stops.forEach((s, k) => {
      if (k >= done) return;
      s.status = 'done';
      s.completed_at = iso(Math.min(now0 - 5 * MIN, tc));
      events.push({ at: s.completed_at, text: s.kind === 'pickup' ? 'Collected at stop 1' : `Delivered at stop ${s.seq}` });
      tc += (16 + Math.floor(r() * 10)) * MIN;
    });

    const from: LatLng = done === 0 ? { lat: DEPOT.lat + (r() - 0.5) * 0.25, lng: DEPOT.lng + (r() - 0.5) * 0.4 } : stops[done - 1]!;
    const to = stops[done]!;
    const dur = legMs(from, to);
    const f0 = 0.15 + r() * 0.5;
    const hold = status === 'assigned' || i === DEMO;
    t.delivery_id = id;
    t.sim = { from, to, t0: now0, dur, f0, hold };
    const pos = lerp(from, to, f0);
    t.lat = pos.lat;
    t.lng = pos.lng;
    if (i === STALE) {
      t.sim = null;
      t.frozenSeen = now0 - 26 * MIN;
      events.push({ at: iso(t.frozenSeen), text: `Last position from ${t.plate_number}` });
    }
    if (i === 15) t.sim = null; // parked, still reporting

    const late = LATE[i] ?? 0;
    let eta = now0 + (1 - f0) * dur;
    stops.forEach((s, k) => {
      if (k < done) return;
      s.eta = iso(eta);
      s.promised_at = iso(eta - (k === done ? late : 0) * MIN);
      eta += (16 + Math.floor(r() * 14)) * MIN;
    });
    if (late) events.push({ at: iso(now0 - 4 * MIN), text: `ETA for stop ${done + 1} moved to ${hhmm(stops[done]!.eta!, config.timezone)}` });

    const windows: MDelivery['windows'] = {};
    stops.forEach((s) => {
      if (s.eta) windows[s.seq] = [Date.parse(s.eta) - 15 * MIN, Date.parse(s.eta) + 15 * MIN];
    });

    deliveries.push({
      id,
      customer_name: i === DEMO ? 'Ferreira Building Supplies' : CUSTOMERS[i]!,
      customer_phone: '+44 113 496 0' + String(100 + i * 11).slice(-3),
      goods: i === DEMO ? '14 pallets · ceramic floor tiles' : `${2 + (i % 9)} pallets`,
      status,
      truck_id: t.id,
      stops,
      created_at: iso(created),
      assigned_at: iso(assignedAt),
      started_at: status === 'in_transit' ? iso(startAt) : null,
      ended_at: null,
      failure_reason: null,
      events: events.reverse(),
      mineSeq: i === DEMO ? 3 : n,
      signedBy: null,
      windows,
    });
  }

  // Available, maintenance, offline trucks.
  for (let i = 22; i < 32; i++) {
    const t = trucks[i]!;
    if (t.status === 'offline') continue;
    if (i < 25 || t.status === 'maintenance') {
      t.lat = DEPOT.lat + (r() - 0.5) * 0.006;
      t.lng = DEPOT.lng + (r() - 0.5) * 0.01;
    } else {
      t.lat = DEPOT.lat + (r() - 0.3) * 0.3;
      t.lng = DEPOT.lng + (r() - 0.5) * 0.5;
    }
    if (t.status === 'maintenance') {
      t.status_note = `In workshop until ${hhmm(iso(now0 + 2 * 60 * MIN), config.timezone)}`;
      t.last_seen_at = iso(now0 - 40 * MIN);
    }
  }
  trucks[24]!.race = 'DLV-40733';

  // Pending.
  [134, 42, 21, 7].forEach((age, k) => {
    const pick = k === 1 ? SUPPLIER : DEPOT;
    const n = 2 + (k % 2);
    const stops = [makeStop(1, 'pickup', pick, r)];
    for (let j = 1; j < n; j++) stops.push(makeStop(j + 1, 'dropoff', PLACES[(k * 5 + j + 3) % PLACES.length]!, r));
    const start = Math.ceil((now0 + 60 * MIN) / (60 * MIN)) * 60 * MIN;
    const windows: MDelivery['windows'] = {};
    stops.forEach((s) => s.kind === 'dropoff' && (windows[s.seq] = [start, start + 4 * 60 * MIN]));
    deliveries.push({
      id: 'DLV-' + (40740 + k),
      customer_name: CUSTOMERS[29 + k]!,
      customer_phone: null,
      goods: `${3 + k} pallets`,
      status: 'pending',
      truck_id: null,
      stops,
      created_at: iso(now0 - age * MIN),
      assigned_at: null,
      started_at: null,
      ended_at: null,
      failure_reason: null,
      events: [{ at: iso(now0 - age * MIN), text: `Created by ${DISPATCHER}` }],
      mineSeq: n,
      signedBy: null,
      windows,
    });
  });

  // Ended today.
  (
    [
      ['DLV-40695', 'failed', 22, 21],
      ['DLV-40696', 'completed', 23, 35],
      ['DLV-40697', 'completed', 24, 58],
      ['DLV-40698', 'completed', 25, 80],
      ['DLV-40699', 'completed', 26, 105],
      ['DLV-40700', 'completed', 27, 130],
      ['DLV-40701', 'cancelled', null, 262],
    ] as const
  ).forEach(([id, status, ti, ago], k) => {
    const tr = ti != null ? trucks[ti]! : null;
    const at = now0 - ago * MIN;
    const stops = [makeStop(1, 'pickup', DEPOT, r), makeStop(2, 'dropoff', PLACES[(k * 2 + 5) % PLACES.length]!, r)];
    const ev: DeliveryEvent[] = [{ at: iso(at - 120 * MIN), text: `Created by ${DISPATCHER}` }];
    if (tr) {
      stops[0]!.status = 'done';
      stops[0]!.completed_at = iso(at - 70 * MIN);
      ev.push({ at: iso(at - 95 * MIN), text: `Assigned to ${tr.plate_number} · ${tr.driver_name}` }, { at: iso(at - 70 * MIN), text: 'Collected at stop 1' });
    }
    if (status === 'failed') {
      stops[1]!.status = 'failed';
      stops[1]!.completed_at = iso(at);
      ev.push({ at: iso(at - 16 * MIN), text: 'Arrived at stop 2' }, { at: iso(at), text: 'Failed · customer unavailable, reported by driver' });
    }
    if (status === 'completed') {
      stops[1]!.status = 'done';
      stops[1]!.completed_at = iso(at);
      ev.push({ at: iso(at), text: 'Delivered at stop 2' });
    }
    if (status === 'cancelled') ev.push({ at: iso(at), text: `Cancelled by ${DISPATCHER} · customer request` });
    stops[1]!.promised_at = iso(at);
    deliveries.push({
      id,
      customer_name: CUSTOMERS[22 + k]!,
      customer_phone: null,
      goods: `${4 + k} pallets`,
      status,
      truck_id: tr?.id ?? null,
      stops,
      created_at: iso(at - 120 * MIN),
      assigned_at: tr ? iso(at - 95 * MIN) : null,
      started_at: tr ? iso(at - 80 * MIN) : null,
      ended_at: iso(at),
      failure_reason: status === 'failed' ? 'customer_unavailable' : null,
      events: ev.reverse(),
      mineSeq: 2,
      signedBy: status === 'completed' ? 'J. Okafor' : null,
      windows: {},
    });
  });

  const drivers: Driver[] = DRIVERS.slice(0, 30).map((name, i) => ({
    id: 'drv-' + (i + 1),
    name,
    phone: '+44 7700 900' + String(100 + i * 7).slice(-3),
    truck_id: plate(i),
    app_state: i < 29 ? 'signed_in_today' : 'never',
  }));

  const db: Db = { now0, config, trucks, drivers, deliveries, proposals: [], tokens: {}, seq: 50 };

  // Agent: a reassignment for the silent truck's uncollected delivery, and a late-window flag.
  const silent = deliveries.find((d) => d.truck_id === plate(STALE))!;
  const pk = silent.stops[0]!;
  const nearest = trucks
    .filter((t) => t.status === 'available' && t.lat != null && !t.race)
    .sort((a, b) => haversineKm(a as LatLng, pk) - haversineKm(b as LatLng, pk))[0]!;
  db.proposals.push({
    id: 'p1',
    kind: 'change',
    created_at: iso(now0 - MIN),
    title: `Reassign ${silent.id} from ${plate(STALE)} to ${nearest.plate_number}`,
    why: `${plate(STALE)} has sent no position for 26 minutes. ${silent.id} hasn't been collected yet, and the customer's window opens at ${hhmm(silent.stops[1]!.promised_at!, config.timezone)}. ${nearest.plate_number} is available and nearest to the pickup.`,
    delivery_id: silent.id,
    truck_id: nearest.id,
    action: { type: 'assign', delivery_id: silent.id, truck_id: nearest.id },
    changes: [
      { k: `${silent.id} · truck`, from: `${plate(STALE)} · ${DRIVERS[STALE]}`, to: `${nearest.plate_number} · ${nearest.driver_name}` },
      { k: nearest.plate_number, from: 'Available', to: 'On delivery' },
      { k: plate(STALE), from: 'On delivery', to: 'Available, still on the silent list' },
    ],
  });
  const lateD = deliveries.find((d) => d.truck_id === plate(15))!;
  const ld = lateD.stops.findIndex((s) => s.status === 'pending');
  db.proposals.push({
    id: 'f1',
    kind: 'flag',
    created_at: iso(now0 - 18 * MIN),
    title: 'Likely to miss window',
    why: `Stationary 18 min near stop ${ld}. Next window closes ${hhmm(lateD.stops[ld]!.promised_at!, config.timezone)}; ETA now ${hhmm(lateD.stops[ld]!.eta!, config.timezone)}`,
    delivery_id: lateD.id,
    truck_id: lateD.truck_id,
    action: null,
    changes: [],
  });

  // Tracking links: one per delivery, plus named ones for each customer-facing state.
  deliveries.forEach((d) => (db.tokens['t-' + d.id.toLowerCase()] = d.id));
  const byStatus = (s: Delivery['status']) => deliveries.find((d) => d.status === s)!.id;
  Object.assign(db.tokens, {
    demo: 'DLV-40718',
    'demo-in-transit': 'DLV-40718',
    'demo-pending': 'DLV-40741',
    'demo-assigned': byStatus('assigned'),
    'demo-stale': silent.id,
    'demo-completed': byStatus('completed'),
    'demo-failed': byStatus('failed'),
    'demo-cancelled': byStatus('cancelled'),
  });
  return db;
}

function hhmm(isoStr: string, tz: string) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit' }).format(new Date(isoStr));
}

let db: Db | null = null;
const getDb = () => (db ??= seed());

// ---- Simulation ----

function advance(now: number) {
  const d = getDb();
  const pingMs = d.config.ping_seconds * 1000;
  for (const t of d.trucks) {
    if (t.status === 'offline') continue;
    if (t.frozenSeen != null) {
      t.last_seen_at = iso(t.frozenSeen);
      continue;
    }
    if (t.status === 'maintenance') continue;
    const ping = Math.floor((now - t.off) / pingMs) * pingMs + t.off;
    if (t.manual) continue;
    t.last_seen_at = iso(ping);
    const sim = t.sim;
    if (!sim) continue;
    const f = sim.f0 + (ping - sim.t0) / sim.dur;
    const del = d.deliveries.find((x) => x.id === t.delivery_id);
    if (f >= 1 && !sim.hold && del?.status === 'in_transit') {
      const idx = del.stops.findIndex((s) => s.status === 'pending');
      const stop = del.stops[idx];
      if (stop) {
        stop.status = 'done';
        stop.completed_at = iso(ping);
        del.events.unshift({ at: iso(ping), text: stop.kind === 'pickup' ? 'Collected at stop 1' : `Delivered at stop ${stop.seq}` });
      }
      const next = del.stops[idx + 1];
      if (next) {
        t.sim = { from: stop!, to: next, t0: ping, dur: legMs(stop!, next), f0: 0, hold: false };
        t.lat = stop!.lat;
        t.lng = stop!.lng;
      } else {
        del.status = 'completed';
        del.ended_at = iso(ping);
        del.signedBy = 'J. Okafor';
        del.events.unshift({ at: iso(ping), text: 'Completed' });
        Object.assign(t, { status: 'available', delivery_id: null, sim: null });
      }
      continue;
    }
    const p = lerp(sim.from, sim.to, Math.min(sim.hold ? 0.97 : 1, Math.max(0, f)));
    t.lat = p.lat;
    t.lng = p.lng;
  }
}

// ---- Public API (used by handlers) ----

export class MockError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const strip = <T extends object>(o: T, keys: string[]) => {
  const c = { ...o } as Record<string, unknown>;
  keys.forEach((k) => delete c[k]);
  return c;
};
const publicTruck = (t: MTruck): Truck => strip(t, ['sim', 'off', 'frozenSeen', 'manual', 'race']) as unknown as Truck;
const publicDelivery = (x: MDelivery): Delivery => structuredClone(strip(x, ['mineSeq', 'signedBy', 'windows'])) as unknown as Delivery;

export const mock = {
  config: () => getDb().config,
  putConfig(c: Partial<Config>) {
    const d = getDb();
    d.config = { ...d.config, ...c };
    return d.config;
  },

  trucks(now = Date.now()) {
    advance(now);
    return getDb().trucks.map(publicTruck);
  },

  deliveries(truckId: string | null, now = Date.now()) {
    advance(now);
    return getDb()
      .deliveries.filter((x) => !truckId || x.truck_id === truckId)
      .map(publicDelivery);
  },

  drivers: () => getDb().drivers,

  proposals(): Proposal[] {
    const d = getDb();
    // A change that has been applied is no longer proposed.
    d.proposals = d.proposals.filter((p) => !p.action || d.deliveries.find((x) => x.id === p.action!.delivery_id)?.truck_id !== p.action.truck_id);
    return d.proposals;
  },

  createDelivery(body: { customer_name?: string; customer_phone?: string | null; goods?: string | null; stops?: { kind: StopKind; address: string }[] }) {
    const d = getDb();
    if (!body.customer_name?.trim()) throw new MockError(400, 'customer_name is required');
    if (!body.stops || body.stops.length < 2 || body.stops.some((s) => !s.address?.trim())) throw new MockError(400, 'a pickup and at least one drop-off address are required');
    const r = rng(d.seq * 7);
    const id = 'DLV-407' + d.seq++;
    const now = Date.now();
    // Geocoding is the backend's job; the mock matches known places or scatters around the depot.
    const stops = body.stops.map((s, i) => {
      const known = [DEPOT, SUPPLIER, ...PLACES].find((p) => p.addr.toLowerCase() === s.address.trim().toLowerCase());
      const p = known ?? { addr: s.address.trim(), lat: 53.68 + r() * 0.24, lng: -1.8 + r() * 0.42 };
      return makeStop(i + 1, s.kind, { ...p, addr: s.address.trim() }, r);
    });
    const start = Math.ceil((now + 60 * MIN) / (60 * MIN)) * 60 * MIN;
    const windows: MDelivery['windows'] = {};
    stops.forEach((s) => s.kind === 'dropoff' && (windows[s.seq] = [start, start + 4 * 60 * MIN]));
    const del: MDelivery = {
      id,
      customer_name: body.customer_name.trim(),
      customer_phone: body.customer_phone || null,
      goods: body.goods || null,
      status: 'pending',
      truck_id: null,
      stops,
      created_at: iso(now),
      assigned_at: null,
      started_at: null,
      ended_at: null,
      failure_reason: null,
      events: [{ at: iso(now), text: `Created by ${DISPATCHER}` }],
      mineSeq: stops.length,
      signedBy: null,
      windows,
    };
    d.deliveries.unshift(del);
    d.tokens['t-' + id.toLowerCase()] = id;
    return publicDelivery(del);
  },

  assign(deliveryId: string, truckId: string) {
    const d = getDb();
    advance(Date.now());
    const del = d.deliveries.find((x) => x.id === deliveryId);
    const t = d.trucks.find((x) => x.id === truckId);
    if (!del) throw new MockError(404, `delivery ${deliveryId} not found`);
    if (!t) throw new MockError(404, `truck ${truckId} not found`);
    if (t.race) {
      // Someone else got there first: the truck list the dispatcher saw was out of date.
      const other = t.race;
      t.race = null;
      Object.assign(t, { status: 'on_delivery', delivery_id: other });
      throw new MockError(409, `truck ${t.plate_number} is already on delivery ${other}`);
    }
    if (t.status !== 'available') throw new MockError(409, `truck ${t.plate_number} is ${t.status === 'on_delivery' ? `already on delivery ${t.delivery_id}` : t.status}`);
    const reassign = (del.status === 'assigned' || del.status === 'in_transit') && del.stops[0]?.status === 'pending';
    if (del.status !== 'pending' && !reassign) throw new MockError(409, `delivery ${del.id} is ${del.status.replace('_', ' ')}, not pending`);
    const now = Date.now();
    if (reassign && del.truck_id) {
      const old = d.trucks.find((x) => x.id === del.truck_id);
      if (old) Object.assign(old, { status: 'available', delivery_id: null, sim: null });
      del.events.unshift({ at: iso(now), text: `Reassigned from ${del.truck_id} to ${t.plate_number}` });
    }
    const pk = del.stops[0]!;
    Object.assign(t, {
      status: 'on_delivery',
      delivery_id: del.id,
      sim: { from: { lat: t.lat!, lng: t.lng! }, to: pk, t0: now, dur: legMs(t as LatLng, pk), f0: 0, hold: true },
    });
    let eta = now + legMs(t as LatLng, pk);
    del.stops.forEach((s, k) => {
      s.eta = iso(eta);
      s.promised_at ??= iso(eta);
      if (k > 0) del.windows[s.seq] = [eta - 15 * MIN, eta + 15 * MIN];
      eta += 25 * MIN;
    });
    del.status = 'assigned';
    del.truck_id = t.id;
    del.assigned_at = iso(now);
    if (!reassign) del.events.unshift({ at: iso(now), text: `Assigned to ${t.plate_number} · ${t.driver_name}` });
    return publicDelivery(del);
  },

  start(id: string) {
    const del = getDb().deliveries.find((x) => x.id === id);
    if (!del) throw new MockError(404, `delivery ${id} not found`);
    if (del.status !== 'assigned') throw new MockError(409, `delivery ${id} is ${del.status.replace('_', ' ')}, not assigned`);
    del.status = 'in_transit';
    del.started_at = iso(Date.now());
    del.events.unshift({ at: del.started_at, text: 'Started' });
    return publicDelivery(del);
  },

  complete(id: string) {
    const d = getDb();
    const del = d.deliveries.find((x) => x.id === id);
    if (!del) throw new MockError(404, `delivery ${id} not found`);
    if (del.status !== 'in_transit') throw new MockError(409, `delivery ${id} is ${del.status.replace('_', ' ')}, not in transit`);
    const now = iso(Date.now());
    del.stops.forEach((s) => {
      if (s.status === 'pending') Object.assign(s, { status: 'done', completed_at: now });
    });
    Object.assign(del, { status: 'completed', ended_at: now, signedBy: del.signedBy ?? 'J. Okafor' });
    del.events.unshift({ at: now, text: 'Completed' });
    const t = d.trucks.find((x) => x.id === del.truck_id);
    if (t) Object.assign(t, { status: 'available', delivery_id: null, sim: null });
    return publicDelivery(del);
  },

  fail(id: string, reason: Delivery['failure_reason']) {
    const d = getDb();
    const del = d.deliveries.find((x) => x.id === id);
    if (!del) throw new MockError(404, `delivery ${id} not found`);
    if (del.status !== 'in_transit' && del.status !== 'assigned') throw new MockError(409, `delivery ${id} is ${del.status.replace('_', ' ')}`);
    const now = iso(Date.now());
    const cur = del.stops.find((s) => s.status === 'pending');
    if (cur) Object.assign(cur, { status: 'failed', completed_at: now });
    Object.assign(del, { status: 'failed', ended_at: now, failure_reason: reason });
    del.events.unshift({ at: now, text: `Failed · ${(reason ?? 'other').replace('_', ' ')}, reported by driver` });
    const t = d.trucks.find((x) => x.id === del.truck_id);
    if (t) Object.assign(t, { status: 'available', delivery_id: null, sim: null });
    return publicDelivery(del);
  },

  locations(truckId: string, pings: LocationPing[]) {
    const d = getDb();
    const t = d.trucks.find((x) => x.id === truckId);
    if (!t) throw new MockError(404, `truck ${truckId} not found`);
    const last = pings[pings.length - 1];
    if (!last) return;
    // Accept the device's own position only inside the service area, so a developer's
    // real location elsewhere doesn't drag the demo truck across the world.
    const c = d.config.map_center;
    if (haversineKm(c, last) <= d.config.service_radius) {
      Object.assign(t, { lat: last.lat, lng: last.lng, last_seen_at: last.at, manual: true, frozenSeen: null });
    }
  },

  createTruck(body: { plate_number?: string; model?: string | null; status?: Truck['status']; payload_kg?: number | null; pallet_spaces?: number | null }) {
    const d = getDb();
    const p = (body.plate_number ?? '').trim().replace(/\s+/g, ' ').toUpperCase();
    const norm = (s: string) => s.replace(/[\s\-.]/g, '').toUpperCase();
    if (!p) throw new MockError(400, 'plate_number is required');
    const dup = d.trucks.find((x) => norm(x.plate_number) === norm(p));
    if (dup) throw new MockError(409, `truck with plate_number "${dup.plate_number}" already exists`);
    const t: MTruck = {
      id: p,
      plate_number: p,
      model: body.model || null,
      status: body.status === 'maintenance' ? 'maintenance' : 'available',
      driver_name: null,
      lat: null,
      lng: null,
      last_seen_at: null,
      delivery_id: null,
      status_note: null,
      payload_kg: body.payload_kg ?? null,
      pallet_spaces: body.pallet_spaces ?? null,
      sim: null,
      off: 0,
      frozenSeen: null,
      manual: false,
      race: null,
    };
    d.trucks.unshift(t);
    return publicTruck(t);
  },

  createDriver(body: { name?: string; phone?: string; truck_id?: string | null; send_app_link?: boolean }) {
    const d = getDb();
    const ph = (body.phone ?? '').replace(/[^\d+]/g, '');
    if (!body.name?.trim()) throw new MockError(400, 'name is required');
    if (!/^\+\d{7,15}$/.test(ph)) throw new MockError(400, 'phone must be in international format');
    if (d.drivers.some((x) => x.phone.replace(/[^\d+]/g, '') === ph)) throw new MockError(409, `driver with phone "${ph}" already exists`);
    const drv: Driver = {
      id: 'drv-' + (d.drivers.length + 100),
      name: body.name.trim(),
      phone: (body.phone ?? '').trim(),
      truck_id: body.truck_id || null,
      app_state: body.send_app_link ? 'link_sent' : 'never',
    };
    d.drivers.unshift(drv);
    if (drv.truck_id) {
      const t = d.trucks.find((x) => x.id === drv.truck_id);
      if (t) t.driver_name = drv.name;
    }
    return drv;
  },

  track(token: string): TrackResponse {
    const d = getDb();
    advance(Date.now());
    const id = d.tokens[token];
    const del = id ? d.deliveries.find((x) => x.id === id) : undefined;
    if (!del) throw new MockError(404, 'tracking link not found');
    const cfg = d.config;
    const truck = del.truck_id ? d.trucks.find((x) => x.id === del.truck_id) : undefined;
    const live = del.status === 'assigned' || del.status === 'in_transit';
    const tz = cfg.timezone;

    // Customer-facing history: plain words, nothing internal.
    const ev: DeliveryEvent[] = [{ at: del.created_at, text: 'Delivery booked' }];
    if (del.assigned_at && truck) ev.push({ at: del.assigned_at, text: `Truck ${truck.plate_number} assigned` });
    del.stops.forEach((s) => {
      if (!s.completed_at) return;
      if (s.kind === 'pickup') ev.push({ at: s.completed_at, text: s.address.startsWith('Kestrel') ? 'Collected from the depot' : 'Collected' });
      else if (s.seq === del.mineSeq) {
        if (s.status === 'failed') ev.push({ at: s.completed_at, text: `Not delivered — ${(del.failure_reason ?? 'other').replace('_', ' ')}` });
        else ev.push({ at: s.completed_at, text: del.signedBy ? `Delivered · signed for by ${del.signedBy}` : 'Delivered' });
      } else if (s.status === 'done') ev.push({ at: s.completed_at, text: `Delivered at stop ${s.seq}` });
    });
    if (live && truck?.frozenSeen) ev.push({ at: iso(truck.frozenSeen), text: 'Last position received' });
    if (del.status === 'cancelled' && del.ended_at) ev.push({ at: del.ended_at, text: `Cancelled by ${cfg.operator_name}` });
    ev.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));

    const failedStop = del.stops.find((s) => s.status === 'failed');
    return {
      ref: `Delivery ${del.id}`,
      status: del.status,
      operator: { name: cfg.operator_name, phone: cfg.support_phone, timezone: tz },
      goods: del.goods,
      booked_at: del.created_at,
      truck: live && truck ? { plate: truck.plate_number, lat: truck.lat, lng: truck.lng, last_seen_at: truck.last_seen_at } : truck ? { plate: truck.plate_number, lat: null, lng: null, last_seen_at: null } : null,
      stops: del.stops.map((s) => ({
        seq: s.seq,
        kind: s.kind,
        mine: s.seq === del.mineSeq,
        address: s.kind === 'pickup' || s.seq === del.mineSeq ? s.address : null,
        lat: s.lat,
        lng: s.lng,
        status: s.status,
        eta: s.status === 'pending' && del.status === 'in_transit' ? s.eta : null,
        completed_at: s.completed_at,
        window_start: del.windows[s.seq] ? iso(del.windows[s.seq]![0]) : null,
        window_end: del.windows[s.seq] ? iso(del.windows[s.seq]![1]) : null,
      })),
      events: ev,
      ended_at: del.ended_at,
      signed_by: del.status === 'completed' ? del.signedBy : null,
      failure_reason: del.failure_reason,
      failure_detail:
        del.status === 'failed' && failedStop?.completed_at
          ? `The driver arrived at ${hhmm(iso(Date.parse(failedStop.completed_at) - 7 * MIN), tz)} and waited 15 minutes at the drop-off.`
          : null,
      failure_next:
        del.status === 'failed'
          ? `The goods are going back to the ${cfg.operator_name} depot today. ${cfg.operator_name} will call you to arrange a new delivery, or you can call them now.`
          : null,
      cancelled_by: del.status === 'cancelled' ? cfg.operator_name : null,
    };
  },
};
