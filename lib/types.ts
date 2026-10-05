// API shapes. Nullable fields are typed `| null` and must be handled: a truck with
// null coordinates is never drawn, and is never drawn at 0,0.

export type DeliveryStatus = 'pending' | 'assigned' | 'in_transit' | 'completed' | 'cancelled' | 'failed';
export type TruckStatus = 'available' | 'on_delivery' | 'maintenance' | 'offline';
export type PillStatus = DeliveryStatus | TruckStatus;

export type FailReason = 'breakdown' | 'customer_unavailable' | 'goods_damaged' | 'accident' | 'other';

export type StopKind = 'pickup' | 'dropoff';
export type StopStatus = 'pending' | 'done' | 'failed';

export interface Stop {
  seq: number;
  kind: StopKind;
  address: string;
  lat: number;
  lng: number;
  status: StopStatus;
  contact_name: string | null;
  contact_phone: string | null;
  /** Alternative number, e.g. site reception. */
  alt_phone: string | null;
  /** Free-text instructions from dispatch. */
  notes: string | null;
  /** Time promised to the customer. Late = eta 10+ min past this. */
  promised_at: string | null;
  eta: string | null;
  completed_at: string | null;
}

export interface DeliveryEvent {
  at: string;
  text: string;
}

export interface Delivery {
  id: string;
  customer_name: string;
  customer_phone: string | null;
  goods: string | null;
  status: DeliveryStatus;
  truck_id: string | null;
  stops: Stop[];
  created_at: string;
  assigned_at: string | null;
  started_at: string | null;
  ended_at: string | null;
  failure_reason: FailReason | null;
  /** Newest first. */
  events: DeliveryEvent[];
}

export interface Truck {
  id: string;
  plate_number: string;
  model: string | null;
  status: TruckStatus;
  driver_name: string | null;
  lat: number | null;
  lng: number | null;
  last_seen_at: string | null;
  delivery_id: string | null;
  /** e.g. "In workshop until 16:00". */
  status_note: string | null;
  /** TODO(fleet-api): not on /trucks yet. */
  payload_kg?: number | null;
  /** TODO(fleet-api): not on /trucks yet. */
  pallet_spaces?: number | null;
}

export type DriverAppState = 'signed_in_today' | 'link_sent' | 'never';

export interface Driver {
  id: string;
  name: string;
  phone: string;
  /** TODO(fleet-api): driver–truck link. */
  truck_id: string | null;
  app_state: DriverAppState;
}

export interface Config {
  operator_name: string;
  support_phone: string;
  dispatch_phone: string;
  locale: string;
  timezone: string;
  units: 'km' | 'mi';
  mass_unit: 'kg' | 'lb';
  map_center: { lat: number; lng: number };
  service_radius: number;
  stale_minutes: number;
  pending_minutes: number;
  failed_window_minutes: number;
  ping_seconds: number;
  agent_enabled: boolean;
}

export interface LocationPing {
  lat: number;
  lng: number;
  accuracy: number | null;
  at: string;
}

// ---- Customer tracking: GET /track/{token} ----

export interface TrackStop {
  seq: number;
  kind: StopKind;
  /** True for the stop this link belongs to. */
  mine: boolean;
  /** Null for other customers' stops: never shown. */
  address: string | null;
  lat: number;
  lng: number;
  status: StopStatus;
  eta: string | null;
  completed_at: string | null;
  window_start: string | null;
  window_end: string | null;
}

export interface TrackResponse {
  ref: string;
  status: DeliveryStatus;
  operator: { name: string; phone: string; timezone: string };
  goods: string | null;
  booked_at: string;
  truck: { plate: string; lat: number | null; lng: number | null; last_seen_at: string | null } | null;
  stops: TrackStop[];
  /** Newest first. */
  events: DeliveryEvent[];
  ended_at: string | null;
  signed_by: string | null;
  failure_reason: FailReason | null;
  failure_detail: string | null;
  failure_next: string | null;
  cancelled_by: string | null;
}

// ---- Agent: GET /proposals (TODO(proposals-api)) ----

export interface ProposalChange {
  k: string;
  from: string;
  to: string;
}

export interface Proposal {
  id: string;
  /** "change" goes to the proposals pane; "flag" raises an exception row. */
  kind: 'change' | 'flag';
  created_at: string;
  title: string;
  why: string;
  delivery_id: string | null;
  truck_id: string | null;
  /** For kind "change": what Approve does. */
  action: { type: 'assign'; delivery_id: string; truck_id: string } | null;
  changes: ProposalChange[];
}
