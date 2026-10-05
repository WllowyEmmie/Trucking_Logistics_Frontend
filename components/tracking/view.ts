// Maps GET /track/{token} to one of eight view states and everything both layouts show.
import type { MapRoute, MapStop, MapTruck, LatLng } from '@/components/map/types';
import {
  describeOffset,
  formatAgo,
  formatDate,
  formatDistance,
  formatTime,
  formatWhen,
  haversineKm,
  minutesSince,
  tzAbbr,
  zonesDiffer,
} from '@/lib/format';
import type { DeliveryStatus, FailReason, TrackResponse, TrackStop } from '@/lib/types';

export type TrackViewState = DeliveryStatus | 'stale' | 'not_found';

export type StopDot = 'done' | 'next' | 'todo' | 'failed' | 'cancelled';

export interface TimelineStop {
  key: number;
  dot: StopDot;
  label: string;
  main: string;
  time: string;
  mine: boolean;
  other: boolean;
}

export interface Notice {
  tone: 'stale' | 'failed' | 'neutral';
  title: string;
  body: string;
  next?: string | null;
}

export interface TrackingView {
  state: TrackViewState;
  operator: string;
  phone: string | null;
  ref: string;
  pill: DeliveryStatus | null;
  headline: string;
  sub: string;
  updated: string | null;
  notice: Notice | null;
  eta: { label: string; value: string; detail: string; hasTime: boolean } | null;
  tzTag: string | null;
  tzNote: string | null;
  facts: { k: string; v: string }[];
  stops: TimelineStop[];
  history: { key: string; t: string; text: string }[];
  map: {
    show: boolean;
    trucks: MapTruck[];
    stops: MapStop[];
    route: MapRoute | null;
    note: string | null;
    dim: boolean;
    fit: LatLng[];
  } | null;
}

const FAIL_TITLE: Record<FailReason, string> = {
  customer_unavailable: 'Nobody was available to receive the goods',
  breakdown: 'The truck broke down',
  goods_damaged: 'The goods were damaged',
  accident: 'The truck was in an accident',
  other: "The delivery couldn't be completed",
};

export const NOT_FOUND_VIEW: TrackingView = {
  state: 'not_found',
  operator: 'Delivery tracking',
  phone: null,
  ref: '',
  pill: null,
  headline: "This tracking link isn't working",
  sub: 'It may be mistyped or out of date. Open the link from your message again, or contact the company that sent it.',
  updated: null,
  notice: null,
  eta: null,
  tzTag: null,
  tzNote: null,
  facts: [],
  stops: [],
  history: [],
  map: null,
};

const countWord = (n: number) => (n === 1 ? 'one' : n === 2 ? 'two' : n === 3 ? 'three' : String(n));

export function buildTrackingView(
  d: TrackResponse,
  opts: { now: number; viewerTz: string; staleMinutes: number; checkedAt: number; units: 'km' | 'mi' },
): TrackingView {
  const { now, viewerTz } = opts;
  const op = d.operator.name;
  const t = (iso: string) => formatTime(iso, viewerTz);
  const mine = d.stops.find((s) => s.mine) ?? d.stops[d.stops.length - 1]!;
  const firstPending = d.stops.find((s) => s.status === 'pending');
  const truckPos: LatLng | null = d.truck?.lat != null && d.truck.lng != null ? { lat: d.truck.lat, lng: d.truck.lng } : null;
  const live = d.status === 'in_transit' || d.status === 'assigned';
  const seenMin = d.truck?.last_seen_at ? minutesSince(d.truck.last_seen_at, now) : null;
  const stale = d.status === 'in_transit' && seenMin != null && seenMin >= opts.staleMinutes;
  const state: TrackViewState = stale ? 'stale' : d.status;
  const plate = d.truck?.plate ?? null;
  const pickup = d.stops.find((s) => s.kind === 'pickup');
  const fromDepot = !!pickup?.address?.startsWith(op);

  const diffZone = zonesDiffer(viewerTz, d.operator.timezone, new Date(now));
  const viewerAbbr = tzAbbr(viewerTz, new Date(now));
  const tzNote = diffZone
    ? `Times are in your time zone (${viewerAbbr}). ${op} works in ${tzAbbr(d.operator.timezone, new Date(now))}, ${describeOffset(viewerTz, d.operator.timezone, new Date(now))}.`
    : `Times are in your time zone (${viewerAbbr}).`;

  const distKm = truckPos ? haversineKm(truckPos, mine) : null;
  const goods = d.goods ? [{ k: 'Goods', v: d.goods }] : [];
  const booked = { k: 'Booked', v: formatWhen(d.booked_at, viewerTz, undefined, new Date(now)) };
  const window = (s: TrackStop) => (s.window_start && s.window_end ? `${t(s.window_start)} – ${t(s.window_end)}` : null);

  let headline = '';
  let sub = '';
  let updated: string | null = null;
  let notice: Notice | null = null;
  let eta: TrackingView['eta'] = null;
  let facts: TrackingView['facts'] = [];
  let note: string | null = null;

  const otherDone = d.stops.filter((s) => s.kind === 'dropoff' && !s.mine && s.status === 'done').length;
  const before = firstPending ? d.stops.filter((s) => s.status === 'pending' && s.seq < mine.seq).length : 0;
  const progressSub =
    before === 0
      ? otherDone === 0
        ? 'The truck has your goods and is heading to you next.'
        : `The truck has made ${countWord(otherDone)} other drop-off${otherDone === 1 ? '' : 's'} and is heading to you next.`
      : `The truck has ${countWord(before)} other stop${before === 1 ? '' : 's'} before yours.`;

  switch (state) {
    case 'in_transit': {
      headline = 'On the way to you';
      sub = progressSub;
      updated = `Updated ${d.truck?.last_seen_at ? formatAgo(d.truck.last_seen_at, now) : formatAgo(new Date(opts.checkedAt).toISOString(), now)} · refreshes on its own`;
      if (mine.eta) eta = { label: 'Estimated arrival', value: t(mine.eta), detail: distKm != null ? `${formatDistance(distKm, opts.units)} away` : '', hasTime: true };
      facts = [...goods, { k: 'Truck', v: plate ?? '—' }, ...(distKm != null ? [{ k: 'Distance to your stop', v: formatDistance(distKm, opts.units) }] : []), booked];
      break;
    }
    case 'stale': {
      const seen = d.truck!.last_seen_at!;
      const near = truckPos
        ? d.stops.find((s) => s.status === 'done' && haversineKm(truckPos, s) < 1.5)
        : undefined;
      headline = 'On the way to you';
      sub = progressSub;
      updated = `Last position ${seenMin} min ago`;
      notice = {
        tone: 'stale',
        title: `Truck position is ${seenMin} minutes old`,
        body: `The driver's phone last reported at ${t(seen)}${near ? (near.kind === 'pickup' ? ', near the pickup' : ', near the previous drop-off') : ''}. The delivery is still in progress. The map shows that last known position, not where the truck is now.`,
      };
      if (mine.eta) eta = { label: 'Last estimate', value: t(mine.eta), detail: `Calculated at ${t(seen)} — may be out of date`, hasTime: true };
      facts = [...goods, { k: 'Truck', v: plate ?? '—' }, { k: 'Last known position', v: near ? `Near stop ${near.seq}, at ${t(seen)}` : `At ${t(seen)}` }, booked];
      note = `Position not updated since ${t(seen)}`;
      break;
    }
    case 'pending': {
      headline = 'Waiting for a truck';
      sub = `${op} has your booking. No truck has been assigned yet, so there is no position or arrival time to show. This page updates on its own when one is.`;
      updated = `Checked ${formatAgo(new Date(opts.checkedAt).toISOString(), now)}`;
      const w = window(mine);
      if (w && mine.window_start) {
        const today = formatDate(mine.window_start, viewerTz) === formatDate(new Date(now), viewerTz);
        eta = { label: `Requested window, ${today ? 'today' : formatDate(mine.window_start, viewerTz)}`, value: w, detail: 'An arrival time appears once a truck is assigned', hasTime: true };
      }
      facts = [...goods, { k: 'Truck', v: 'Not assigned yet' }, booked];
      note = 'No truck assigned yet — nothing to track';
      break;
    }
    case 'assigned': {
      headline = 'Truck assigned';
      sub = `Truck ${plate} will collect your goods${fromDepot ? ' from the depot' : ''}. It hasn't set off yet.`;
      updated = `Updated ${formatAgo(new Date(opts.checkedAt).toISOString(), now)} · refreshes on its own`;
      const w = window(mine);
      if (w) eta = { label: 'Estimated arrival window', value: w, detail: 'Narrows to a single time once the truck sets off', hasTime: true };
      facts = [...goods, { k: 'Truck', v: plate ?? '—' }, ...(distKm != null ? [{ k: 'Distance to your stop', v: `${formatDistance(distKm, opts.units)}${fromDepot ? ' from the depot' : ''}` }] : []), booked];
      break;
    }
    case 'completed': {
      const at = mine.completed_at ?? d.ended_at;
      headline = 'Delivered';
      sub = 'Delivered to your drop-off. Live tracking has ended.';
      if (at) eta = { label: 'Delivered at', value: t(at), detail: d.signed_by ? `Signed for by ${d.signed_by}` : '', hasTime: true };
      facts = [...goods, ...(plate ? [{ k: 'Truck', v: plate }] : []), booked];
      note = 'Tracking ended';
      break;
    }
    case 'failed': {
      const at = mine.completed_at ?? d.ended_at;
      headline = 'Delivery not completed';
      sub = at ? `The driver couldn't deliver your goods at ${t(at)}.` : "The driver couldn't deliver your goods.";
      notice = { tone: 'failed', title: FAIL_TITLE[d.failure_reason ?? 'other'], body: d.failure_detail ?? '', next: d.failure_next };
      facts = [...goods, ...(plate ? [{ k: 'Truck', v: plate }] : []), booked];
      note = 'Tracking ended — goods returning to depot';
      break;
    }
    case 'cancelled': {
      const at = d.ended_at;
      headline = 'Delivery cancelled';
      sub = at
        ? `${d.cancelled_by ?? op} cancelled this delivery on ${formatDate(at, viewerTz)} at ${t(at)}. Nothing is on its way on this link.`
        : 'This delivery was cancelled. Nothing is on its way on this link.';
      notice = { tone: 'neutral', title: 'Still expecting these goods?', body: `Call ${op}. This page won't update again.` };
      facts = [...goods, booked];
      note = 'Cancelled — no truck on the way';
      break;
    }
  }

  const stops: TimelineStop[] = d.stops.map((s) => {
    let dot: StopDot;
    if (d.status === 'cancelled') dot = 'cancelled';
    else if (s.status === 'done') dot = 'done';
    else if (s.status === 'failed') dot = 'failed';
    else if (live && s === firstPending) dot = 'next';
    else dot = 'todo';
    let time = '';
    if (dot === 'done' && s.completed_at) time = `${s.kind === 'pickup' ? 'Collected' : 'Delivered'} ${t(s.completed_at)}`;
    else if (dot === 'failed' && s.completed_at) time = `Not delivered ${t(s.completed_at)}`;
    else if (dot === 'cancelled') time = s.kind === 'pickup' || s.mine ? 'Cancelled' : '';
    else if (d.status === 'pending' && s.kind === 'pickup') time = 'Waiting for a truck';
    else if (d.status === 'in_transit' && s.eta && (s.mine || s.kind === 'pickup')) time = `Expected ${t(s.eta)}`;
    else if (s.mine && window(s)) time = `Window ${window(s)}`;
    return {
      key: s.seq,
      dot,
      label: `Stop ${s.seq} · ${s.kind === 'pickup' ? 'Pickup' : s.mine ? 'Your drop-off' : 'Drop-off'}`,
      main: s.address ?? "Another customer's drop-off",
      time,
      mine: s.mine,
      other: s.address == null,
    };
  });

  const history = d.events.map((e, i) => ({ key: `${e.at}-${i}`, t: formatWhen(e.at, viewerTz, undefined, new Date(now)), text: e.text }));

  // Map
  const showTruck = live && truckPos != null;
  const trucks: MapTruck[] = showTruck
    ? [
        {
          id: 'truck',
          ...truckPos!,
          state: stale ? 'stale' : 'live',
          size: 'md',
          label: stale
            ? `Last seen ${t(d.truck!.last_seen_at!)}`
            : d.status === 'assigned' && pickup && haversineKm(truckPos!, pickup) < 1
              ? `${plate} · at depot`
              : plate,
          aria: stale ? `Truck ${plate}, last seen ${t(d.truck!.last_seen_at!)}` : `Truck ${plate}`,
        },
      ]
    : [];
  const mapStops: MapStop[] = d.stops.map((s) => ({
    id: String(s.seq),
    n: s.seq,
    kind: s.kind,
    lat: s.lat,
    lng: s.lng,
    done: s.status === 'done',
    small: s.kind === 'dropoff' && !s.mine,
    label: s.mine ? 'Your drop-off' : null,
  }));
  const done = d.stops.filter((s) => s.status === 'done');
  const rest = d.stops.filter((s) => s.status !== 'done');
  const head: LatLng[] = showTruck && d.status === 'in_transit' ? [truckPos!] : done.length ? [done[done.length - 1]!] : [];
  const route: MapRoute = {
    travelled: showTruck && d.status === 'in_transit' ? [...done, truckPos!] : done,
    remaining: [...head, ...rest],
  };

  return {
    state,
    operator: op,
    phone: d.operator.phone,
    ref: d.ref,
    pill: d.status,
    headline,
    sub,
    updated,
    notice,
    eta,
    tzTag: diffZone && eta?.hasTime ? `Your time · ${viewerAbbr}` : null,
    tzNote,
    facts,
    stops,
    history,
    map: {
      show: true,
      trucks,
      stops: mapStops,
      route,
      note,
      dim: d.status === 'cancelled',
      fit: [...d.stops, ...(showTruck ? [truckPos!] : [])],
    },
  };
}
