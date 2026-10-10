// API shapes. Nullable fields are typed `| null` and must be handled: a truck with
// null coordinates is never drawn, and is never drawn at 0,0.
// API shapes, written against the Go API as it actually is.
//
// Nullable fields are `| null` and must be handled: a truck with null
// coordinates is never drawn, and is never drawn at 0,0.
//
// Fields the backend does not have yet are marked TODO with a tag. Do not
// add a field here speculatively — if it isn't in a Go response struct, the
// UI cannot rely on it.

export type DeliveryStatus =
  | 'pending'
  | 'assigned'
  | 'in_transit'
  | 'completed'
  | 'cancelled'
  | 'failed';

export type TruckStatus = 'available' | 'on_delivery' | 'maintenance' | 'offline';

export type PillStatus = DeliveryStatus | TruckStatus;

export type FailReason =
  | 'breakdown'
  | 'customer_unavailable'
  | 'goods_damaged'
  | 'accident'
  | 'other';

export type StopKind = 'pickup' | 'dropoff';

/** Four values, matching the delivery_stops CHECK constraint. `skipped` is
 *  reachable in the schema but no endpoint writes it yet. */
export type StopStatus = 'pending' | 'arrived' | 'completed' | 'skipped';

// ---- Stops ----

export interface Stop {
  /** uuid. Needed to call the arrive/complete endpoints. */
  id: string;
  sequence: number;
  stop_type: StopKind;
  address: string;
  /** Null only if the row somehow has no position; treat as undrawable. */
  lng: number | null;
  lat: number | null;
  status: StopStatus;
  arrived_at: string | null;
  completed_at: string | null;
}

/** POST /deliveries returns a narrower stop row than GET /deliveries/{id}. */
export interface CreatedStop {
  id: string;
  sequence: number;
  stop_type: StopKind;
  address: string;
  status: StopStatus;
}

// ---- Events ----

export interface DeliveryEvent {
  id: number;
  /** Free-form on the server. Known values: created, assigned, in_transit,
   *  completed, cancelled, failed, stop_arrived, stop_completed. */
  event_type: string;
  note: string | null;
  created_at: string;
  /** TODO(events-stop-id): the column exists and is populated, but
   *  ListEventsForDelivery does not select it yet. */
  stop_id?: string | null;
}

// ---- Deliveries ----

/** A row from GET /deliveries. The list is deliberately thin. */
export interface DeliveryListItem {
  id: string;
  reference: string;
  status: DeliveryStatus;
  customer_name: string;
  truck_id: string | null;
  created_at: string;
}

/** The `delivery` object inside GET /deliveries/{id}. */
export interface DeliveryDetail {
  id: string;
  reference: string;
  status: DeliveryStatus;
  customer_name: string;
  customer_phone: string | null;
  goods_desc: string | null;
  /** Operator-only. This is what the console shows as the customer link.
   *  It is NOT in the public /track response. */
  tracking_token: string;
  truck_id: string | null;
  plate_number: string | null;
  truck_lng: number | null;
  truck_lat: number | null;
  truck_seen_at: string | null;
  created_at: string;
}

/** GET /deliveries/{id} — three siblings, not a nested object. */
export interface DeliveryDetailResponse {
  delivery: DeliveryDetail;
  stops: Stop[];
  /** Oldest first. */
  events: DeliveryEvent[];
}

/** POST /deliveries */
export interface CreateDeliveryRequest {
  customer_name: string;
  customer_phone?: string | null;
  goods_desc?: string | null;
  stops: Array<{
    stop_type: StopKind;
    address: string;
    lat: number;
    lng: number;
    contact_name?: string | null;
    contact_phone?: string | null;
  }>;
}

export interface CreateDeliveryResponse {
  delivery: {
    id: string;
    reference: string;
    tracking_token: string;
    customer_name: string;
    customer_phone: string | null;
    goods_desc: string | null;
    status: DeliveryStatus;
    created_at: string;
  };
  stops: CreatedStop[];
}

// ---- Trucks ----

export interface Truck {
  id: string;
  plate_number: string;
  model: string | null;
  status: TruckStatus;
  /** An id, not a name. Join against /drivers to display one. */
  driver_id: string | null;
  lng: number | null;
  lat: number | null;
  last_seen_at: string | null;
}

export interface CreateTruckRequest {
  plate_number: string;
  model?: string | null;
}

/**
 * PATCH /trucks/{id}. A field left out is kept. `driver_id: ""` unassigns the driver.
 * `status` can't leave on_delivery (409) or be set to it (409): assign and complete own that.
 */
export interface UpdateTruckRequest {
  driver_id?: string;
  status?: Exclude<TruckStatus, 'on_delivery'>;
}

/** UpdateTruckRow: the truck without its position. 404 "driver not found" for an unknown driver_id. */
export type UpdatedTruck = Omit<Truck, 'lng' | 'lat'>;

// ---- Drivers ----

export interface Driver {
  id: string;
  name: string;
  phone: string;
}

export interface CreateDriverRequest {
  name: string;
  phone: string;
}

// ---- Locations: POST /locations ----

export interface LocationPing {
  lat: number;
  lng: number;
  /** RFC3339. The server uses the ping with the latest recorded_at to update
   *  the truck's position, and ignores any ping older than what it already
   *  has — so late batches are safe to send. */
  recorded_at: string;
  speed_kph?: number | null;
  accuracy_m?: number | null;
}

export interface PostLocationsRequest {
  truck_id: string;
  /** Max 500 per request. */
  pings: LocationPing[];
}

// ---- Customer tracking: GET /track/{token} ----

export interface TrackStop {
  sequence: number;
  stop_type: StopKind;
  address: string;
  lng: number | null;
  lat: number | null;
  status: StopStatus;
  arrived_at: string | null;
}

export interface TrackResponse {
  reference: string;
  status: DeliveryStatus;
  customer_name: string;
  goods_desc: string | null;
  created_at: string;
  /** All null until a truck is assigned. */
  truck_lng: number | null;
  truck_lat: number | null;
  truck_seen_at: string | null;
  stops: TrackStop[];
  /** Oldest first. The failure reason, when there is one, is in the note of
   *  the `failed` event — there is no separate failure_reason field. */
  events: DeliveryEvent[];
}

// ---- Config: GET /config ----

export interface Config {
  /** 'metric' | 'imperial' — not 'km' | 'mi'. */
  units: 'metric' | 'imperial';
  /** IANA name, e.g. "Africa/Lagos". */
  timezone: string;
  /** BCP-47, e.g. "en". */
  language: string;
  center_lat: number;
  center_lng: number;
  default_zoom: number;
  /** A bounding box, not a radius. Defaults to the whole world when the
   *  operator has not configured a service area. */
  min_lat: number;
  max_lat: number;
  min_lng: number;
  max_lng: number;
}

/** Client-side thresholds. The backend does not serve these and cannot
 *  receive them — config is read from the environment at startup, so there
 *  is no write path. Keep them here until that changes.
 *  TODO(config-thresholds) */
export const THRESHOLDS = {
  stale_minutes: 20,
  pending_minutes: 120,
  failed_window_minutes: 60,
  ping_seconds: 15,
} as const;

// ---- Agent: GET /proposals ----
// TODO(proposals-api): no endpoint exists. A 404 must be treated as empty,
// not as an error. These shapes are a guess and will change.

export interface ProposalChange {
  k: string;
  from: string;
  to: string;
}

export interface Proposal {
  id: string;
  kind: 'change' | 'flag';
  created_at: string;
  title: string;
  why: string;
  delivery_id: string | null;
  truck_id: string | null;
  action: { type: 'assign'; delivery_id: string; truck_id: string } | null;
  changes: ProposalChange[];
}