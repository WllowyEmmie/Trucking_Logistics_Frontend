// Maps GET /track/{token} to one of eight view states and everything both layouts show.
import type { LatLng, MapRoute, MapStop, MapTruck } from '@/components/map/types';
import { customerEventText, eventAt, failReasonOf, hasLatLng } from '@/lib/deliveries';
import { describeOffset, formatAgo, formatDate, formatDistance, formatDuration, formatTime, formatWhen, haversineKm, minutesSince, tzAbbr, zonesDiffer } from '@/lib/format';
import type { DeliveryStatus, FailReason, TrackResponse, TrackStop } from '@/lib/types';

export type TrackViewState = DeliveryStatus | 'stale' | 'not_found';

export type StopDot = 'done' | 'next' | 'todo' | 'failed' | 'cancelled';

export interface TimelineStop {
  key: number;
  dot: StopDot;
  label: string;
  main: string;
  time: string;
  /** The only drop-off on a single-drop delivery: labelled "Your drop-off". */
  mine: boolean;
  /** Proof of delivery: who received it, and image addresses when there are images. */
  proof: { text: string; photo: string | null; signature: string | null } | null;
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

const stopDone = (s: TrackStop) => s.status === 'completed' || s.status === 'skipped';

export interface TrackingOpts {
  now: number;
  viewerTz: string;
  staleMinutes: number;
  checkedAt: number;
  units: 'metric' | 'imperial';
  /** The API's /track has no operator block: these come from config. */
  operator: string;
  phone: string | null;
  operatorTz: string;
  /** Where this link's proof images live: `${imageBase}/${seq}/photo`. */
  imageBase?: string;
}

export function buildTrackingView(d: TrackResponse, opts: TrackingOpts): TrackingView {
  const { now, viewerTz } = opts;
  const op = opts.operator;
  const t = (iso: string) => formatTime(iso, viewerTz);
  // Every stop on a delivery belongs to the customer holding the link, so all of them are shown.
  const drops = d.stops.filter((s) => s.stop_type === 'dropoff');
  const multi = drops.length > 1;
  const mine = multi ? null : (drops[0] ?? null);
  // Where the truck is heading next: distance and "arrived" follow it.
  const nextDrop = drops.find((s) => !stopDone(s)) ?? null;
  const truckPos: LatLng | null = d.truck_lat != null && d.truck_lng != null ? { lat: d.truck_lat, lng: d.truck_lng } : null;
  const live = d.status === 'in_transit' || d.status === 'assigned';
  const seenMin = d.truck_seen_at ? minutesSince(d.truck_seen_at, now) : null;
  const stale = d.status === 'in_transit' && seenMin != null && seenMin >= opts.staleMinutes;
  const state: TrackViewState = stale ? 'stale' : d.status;
  const plate = d.plate_number;

  const diffZone = zonesDiffer(viewerTz, opts.operatorTz, new Date(now));
  const viewerAbbr = tzAbbr(viewerTz, new Date(now));
  const tzNote = diffZone
    ? `Times are in your time zone (${viewerAbbr}). ${op} works in ${tzAbbr(opts.operatorTz, new Date(now))}, ${describeOffset(viewerTz, opts.operatorTz, new Date(now))}.`
    : `Times are in your time zone (${viewerAbbr}).`;

  const distKm = truckPos && nextDrop && hasLatLng(nextDrop) ? haversineKm(truckPos, nextDrop) : null;
  const distLabel = multi && nextDrop ? `Distance to the next drop-off (stop ${nextDrop.sequence})` : 'Distance to your drop-off';
  const goods = d.goods_desc ? [{ k: 'Goods', v: d.goods_desc }] : [];
  // The promised time, while it's still to come; and the API's estimate (lib/due.ts).
  const dueFact = d.due_by && live ? [{ k: 'Due by', v: formatWhen(d.due_by, viewerTz, undefined, new Date(now)) }] : [];
  const etaLabel = multi ? 'Estimated arrival at the last drop-off' : 'Estimated arrival';
  const etaDetail = () => {
    const mins = Math.max(0, (Date.parse(d.eta!) - now) / 60_000);
    const dist = distKm != null ? ` · ${formatDistance(distKm, opts.units)} away` : '';
    return `${mins < 2 ? 'Any minute now' : `In about ${formatDuration(mins)}`}${dist}. An estimate: traffic can change it.`;
  };
  const booked = { k: 'Booked', v: formatWhen(d.created_at, viewerTz, undefined, new Date(now)) };
  const truckFact = { k: 'Truck', v: plate ?? 'Assigned' };
  const distEta = (label: string) => (distKm != null ? { label, value: formatDistance(distKm, opts.units), detail: 'Straight-line distance from the truck', hasTime: false } : null);

  let headline = '';
  let sub = '';
  let updated: string | null = null;
  let notice: Notice | null = null;
  let eta: TrackingView['eta'] = null;
  let facts: TrackingView['facts'] = [];
  let note: string | null = null;

  const doneDrops = drops.filter(stopDone).length;
  // In transit starts when the driver sets off, which is before the pickup: don't say the truck
  // has the goods until the pickup stop is done.
  const pickupStop = d.stops.find((s) => s.stop_type === 'pickup');
  const collected = !pickupStop || stopDone(pickupStop);
  const onTheWay = collected ? 'On the way to you' : 'On the way to collect your goods';
  const progressSub = !collected
    ? 'The truck is on its way to the pickup. It heads to you once your goods are loaded.'
    : multi
      ? `The truck is on its way. ${doneDrops} of ${drops.length} drop-offs done so far.`
      : 'The truck has your goods and is heading to you.';

  switch (state) {
    case 'in_transit': {
      const here = nextDrop?.status === 'arrived' && nextDrop.arrived_at ? nextDrop : null;
      headline = here ? 'The truck has arrived' : onTheWay;
      sub = here ? `Arrived${multi ? ` at stop ${here.sequence}` : ''} at ${t(here.arrived_at!)}. The driver is unloading.` : progressSub;
      updated = `Updated ${d.truck_seen_at ? formatAgo(d.truck_seen_at, now) : formatAgo(new Date(opts.checkedAt).toISOString(), now)} · refreshes on its own`;
      if (!here) eta = d.eta ? { label: etaLabel, value: t(d.eta), detail: etaDetail(), hasTime: true } : distEta(distLabel);
      facts = [...goods, truckFact, ...dueFact, booked];
      break;
    }
    case 'stale': {
      const seen = d.truck_seen_at!;
      headline = onTheWay;
      sub = progressSub;
      updated = `Last position ${formatDuration(seenMin!)} ago`;
      notice = {
        tone: 'stale',
        title: `Truck position is ${formatDuration(seenMin!)} old`,
        body: `The driver's phone last reported at ${t(seen)}. The delivery is still in progress. The map shows that last known position, not where the truck is now.`,
      };
      eta = distEta('Distance at last position');
      facts = [...goods, truckFact, { k: 'Last known position', v: `At ${t(seen)}` }, booked];
      note = `Position not updated since ${t(seen)}`;
      break;
    }
    case 'pending': {
      headline = 'Waiting for a truck';
      sub = `${op} has your booking. No truck has been assigned yet, so there is no position to show. This page updates on its own when one is.`;
      updated = `Checked ${formatAgo(new Date(opts.checkedAt).toISOString(), now)}`;
      facts = [...goods, { k: 'Truck', v: 'Not assigned yet' }, ...(d.due_by ? [{ k: 'Due by', v: formatWhen(d.due_by, viewerTz, undefined, new Date(now)) }] : []), booked];
      note = 'No truck assigned yet — nothing to track';
      break;
    }
    case 'assigned': {
      headline = 'Truck assigned';
      sub = `${plate ? `Truck ${plate}` : 'A truck'} will collect your goods. It hasn't set off yet.`;
      updated = `Updated ${formatAgo(new Date(opts.checkedAt).toISOString(), now)} · refreshes on its own`;
      facts = [
        ...goods,
        truckFact,
        ...(d.eta ? [{ k: etaLabel, v: t(d.eta) }] : distKm != null ? [{ k: distLabel, v: formatDistance(distKm, opts.units) }] : []),
        ...dueFact,
        booked,
      ];
      break;
    }
    case 'completed': {
      const at = eventAt(d.events, 'completed');
      headline = 'Delivered';
      sub = 'Your delivery is complete. Live tracking has ended.';
      if (at) eta = { label: 'Delivered at', value: t(at), detail: '', hasTime: true };
      facts = [...goods, ...(plate ? [truckFact] : []), booked];
      note = 'Tracking ended';
      break;
    }
    case 'failed': {
      const at = eventAt(d.events, 'failed');
      headline = 'Delivery not completed';
      sub = at ? `The driver couldn't complete the delivery at ${t(at)}.` : "The driver couldn't complete the delivery.";
      notice = {
        tone: 'failed',
        title: FAIL_TITLE[failReasonOf(d.events) ?? 'other'],
        body: `${op} will be in touch about what happens next.`,
        next: opts.phone ? `You can also call ${op} on ${opts.phone}.` : null,
      };
      facts = [...goods, ...(plate ? [truckFact] : []), booked];
      note = 'Tracking ended';
      break;
    }
    case 'cancelled': {
      const at = eventAt(d.events, 'cancelled');
      headline = 'Delivery cancelled';
      sub = at
        ? `This delivery was cancelled on ${formatDate(at, viewerTz)} at ${t(at)}. Nothing is on its way on this link.`
        : 'This delivery was cancelled. Nothing is on its way on this link.';
      notice = { tone: 'neutral', title: 'Still expecting these goods?', body: `Contact ${op}. This page won't update again.` };
      facts = [...goods, booked];
      note = 'Cancelled — no truck on the way';
      break;
    }
  }

  const firstOpen = d.stops.find((s) => !stopDone(s));
  const stops: TimelineStop[] = d.stops.map((s) => {
    const isPickup = s.stop_type === 'pickup';
    let dot: StopDot;
    if (d.status === 'cancelled') dot = 'cancelled';
    else if (s.status === 'completed') dot = 'done';
    else if (live && s === firstOpen) dot = 'next';
    else dot = 'todo';
    let time = '';
    if (s.status === 'completed') time = `${isPickup ? 'Collected' : 'Delivered'}${s.arrived_at ? ` · arrived ${t(s.arrived_at)}` : ''}`;
    else if (s.status === 'skipped') time = 'Skipped';
    else if (s.status === 'arrived' && s.arrived_at) time = `Truck arrived ${t(s.arrived_at)}`;
    else if (dot === 'cancelled') time = 'Cancelled';
    else if (d.status === 'pending' && isPickup) time = 'Waiting for a truck';
    return {
      key: s.sequence,
      dot,
      label: `Stop ${s.sequence} · ${isPickup ? 'Pickup' : s === mine ? 'Your drop-off' : 'Drop-off'}`,
      main: s.address,
      time,
      mine: s === mine,
      proof: s.proof
        ? {
            text: `Received by ${s.proof.receiver_name} at ${t(s.proof.captured_at)}`,
            photo: s.proof.has_photo && opts.imageBase ? `${opts.imageBase}/${s.sequence}/photo` : null,
            signature: s.proof.has_signature && opts.imageBase ? `${opts.imageBase}/${s.sequence}/signature` : null,
          }
        : null,
    };
  });

  // Events come oldest first; the page shows newest first. Internal ones (stop arrivals) are skipped.
  const history = [...d.events]
    .reverse()
    .flatMap((e, i) => {
      const text = customerEventText(e, plate);
      return text ? [{ key: `${e.created_at}-${i}`, t: formatWhen(e.created_at, viewerTz, undefined, new Date(now)), text }] : [];
    });

  // Map: every stop with a position, and the truck while it's live.
  const shown = d.stops.filter(hasLatLng) as (TrackStop & LatLng)[];
  const showTruck = live && truckPos != null;
  const trucks: MapTruck[] = showTruck
    ? [
        {
          id: 'truck',
          ...truckPos!,
          state: stale ? 'stale' : 'live',
          size: 'md',
          label: stale ? `Last seen ${t(d.truck_seen_at!)}` : plate,
          aria: stale ? `Truck ${plate ?? ''}, last seen ${t(d.truck_seen_at!)}` : `Truck ${plate ?? ''}`,
        },
      ]
    : [];
  const mapStops: MapStop[] = shown.map((s) => ({
    id: String(s.sequence),
    n: s.sequence,
    kind: s.stop_type,
    lat: s.lat,
    lng: s.lng,
    done: s.status === 'completed',
    label: s === mine ? 'Your drop-off' : null,
  }));
  const done = shown.filter(stopDone);
  const rest = shown.filter((s) => !stopDone(s));
  const head: LatLng[] = showTruck && d.status === 'in_transit' ? [truckPos!] : done.length ? [done[done.length - 1]!] : [];
  const route: MapRoute = {
    travelled: showTruck && d.status === 'in_transit' ? [...done, truckPos!] : done,
    remaining: [...head, ...rest],
  };

  return {
    state,
    operator: op,
    phone: opts.phone,
    ref: d.reference,
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
      fit: [...shown, ...(showTruck ? [truckPos!] : [])],
    },
  };
}
