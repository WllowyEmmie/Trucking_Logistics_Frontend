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
  /** The site contact at this stop, when one was given on create. Falls back to the customer. */
  contact_name: string | null;
  contact_phone: string | null;
  /** Proof of delivery at a drop-off that has one. Images: GET /deliveries/{id}/stops/{stopId}/proof/photo|signature. */
  proof?: StopProof | null;
}

export interface StopProof {
  receiver_name: string;
  captured_at: string;
  has_photo: boolean;
  has_signature: boolean;
  /** Where the phone was, when it knew. */
  lat: number | null;
  lng: number | null;
  /** Who sent it: the driver's name, or the dispatcher's email. */
  saved_by: string;
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
   *  completed, cancelled, failed, stop_arrived, stop_completed, and
   *  truck_maintenance (after a breakdown or accident failure), and reopened
   *  (a failed delivery sent out again; see lib/reopen.ts). */
  event_type: string;
  /** On a `failed` event, the bare reason (see `failReasonOf`); on `assigned`, a human note. */
  note: string | null;
  created_at: string;
  /** Set on stop_arrived / stop_completed; null on delivery-level events. */
  stop_id: string | null;
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
  /** Promised by (the last drop-off); null when no time was promised. */
  due_by: string | null;
  /** Estimated arrival at the last stop: assigned or in transit, with a truck position. See lib/due.ts. */
  eta: string | null;
  /** When it was completed, cancelled or failed; null while open. */
  finished_at: string | null;
}

/** GET /deliveries/history: a finished delivery and how it got there. */
export interface HistoryItem {
  id: string;
  reference: string;
  customer_name: string;
  status: 'completed' | 'cancelled' | 'failed';
  created_at: string;
  finished_at: string;
  due_by: string | null;
  /** Times it failed, and was sent out again, along the way. */
  failures: number;
  reopens: number;
  first_fail_reason: FailReason | null;
  /** The truck on the last assignment. */
  plate: string | null;
  /** Completed after its due time. */
  late: boolean;
}

export type HistoryOutcome = '' | 'completed' | 'cancelled' | 'failed' | 'recovered' | 'late';

export interface HistoryPage {
  items: HistoryItem[];
  /** Pass as `before` for the next page; null on the last. */
  next: string | null;
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
  due_by: string | null;
}

/** Estimated arrival at each stop still to do, and at the last one. */
export interface DeliveryEta {
  arrival: string;
  stops: { stop_id: string; at: string }[];
}

/** GET /deliveries/{id} — siblings, not a nested object. */
export interface DeliveryDetailResponse {
  delivery: DeliveryDetail;
  stops: Stop[];
  /** Oldest first. */
  events: DeliveryEvent[];
  /** Null unless it's on the road and the truck has a position. */
  eta: DeliveryEta | null;
}

/** POST /deliveries */
export interface CreateDeliveryRequest {
  customer_name: string;
  customer_phone?: string | null;
  goods_desc?: string | null;
  /** ISO time; optional. */
  due_by?: string | null;
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
  /** Whether its driver is on shift (GPS is only recorded then). False with no driver. */
  driver_on_shift?: boolean;
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
  /** Whether the driver can sign in to the app yet (GET /drivers, dispatchers). Never the PIN. */
  has_pin?: boolean;
  /** On shift now (their phone sends GPS only then), and since when. */
  on_shift?: boolean;
  shift_since?: string | null;
}

export interface CreateDriverRequest {
  name: string;
  phone: string;
  /** Optional: 4–8 digits, so the driver can sign in to the app straight away. */
  pin?: string;
  /** Optional: have the API make a random 6-digit PIN, returned once as `pin` in the response. */
  generate_pin?: boolean;
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
  /** Who received it, at a drop-off that has proof. Images: GET /track/{token}/stops/{seq}/photo|signature. */
  proof?: { receiver_name: string; captured_at: string; has_photo: boolean; has_signature: boolean } | null;
}

/** /track events (TrackingEvent): no `id` and no `stop_id`, unlike /deliveries/{id} events. */
export interface TrackEvent {
  event_type: string;
  note: string | null;
  created_at: string;
}

export interface TrackResponse {
  reference: string;
  status: DeliveryStatus;
  /** The assigned truck's plate; null until one is assigned (and again after a cancel). */
  plate_number: string | null;
  customer_name: string;
  goods_desc: string | null;
  created_at: string;
  /** All null until a truck is assigned. */
  truck_lng: number | null;
  truck_lat: number | null;
  truck_seen_at: string | null;
  due_by: string | null;
  /** Estimated arrival at the last stop, while it's on the road. */
  eta: string | null;
  /** Every stop on the delivery. They all belong to the one customer holding the link. */
  stops: TrackStop[];
  /** Oldest first. The failure reason, when there is one, is in the note of
   *  the `failed` event — there is no separate failure_reason field. */
  events: TrackEvent[];
}

// ---- Address search: GET /geocode?q= ----

/** One match for an address, inside the service area only (the API filters). q is 3–200 characters;
 *  502 when the provider is down, with a message to show as-is. */
export interface GeocodePlace {
  label: string;
  lat: number;
  lng: number;
}

// ---- Config: GET /config ----

export interface Config {
  /** ISO country the settings were filled from ("NG"); the default for phone numbers. */
  country: string;
  /** 'metric' | 'imperial' — not 'km' | 'mi'. */
  units: 'metric' | 'imperial';
  /** IANA name, e.g. "Africa/Lagos". */
  timezone: string;
  /** BCP-47, e.g. "en-NG". */
  language: string;
  center_lat: number;
  center_lng: number;
  default_zoom: number;
  /** A bounding box, not a radius. The whole world when no service area is set. */
  min_lat: number;
  max_lat: number;
  min_lng: number;
  max_lng: number;
  operator_name: string;
  /** E.164, or "" when not set. */
  support_phone: string;
  dispatch_phone: string;
  /** Pre-fills the pickup of a new delivery. */
  depot: { address: string; lat: number; lng: number } | null;
  agent_enabled: boolean;
  stale_minutes: number;
  pending_minutes: number;
  failed_window_minutes: number;
  ping_seconds: number;
  /** Arrival estimates: average road speed, and minutes spent at each stop. */
  eta_speed_kph: number;
  stop_minutes: number;
  /** Hours completed and cancelled deliveries stay on the console before they're only in History. */
  board_hours: number;
  /** Proof at each drop-off: the receiver's name always; these add a photo and a signature. */
  pod_photo_required: boolean;
  pod_signature_required: boolean;
  /** The tracking page's Delivery terms and Help tabs. {company} and {support_phone} are filled in. */
  customer_terms: string;
  customer_faq: { q: string; a: string }[];
  /** null until someone saves settings (environment defaults in effect). */
  updated_at?: string | null;
  /** Dispatchers only. */
  updated_by?: string;
}

/** The alert thresholds used until GET /config answers. */
export const THRESHOLDS = {
  stale_minutes: 20,
  pending_minutes: 120,
  failed_window_minutes: 60,
  ping_seconds: 15,
} as const;

// ---- Agent: /proposals (internal/api/proposal.go) ----
// GET /proposals?status= (default pending), POST /proposals (the agent writes; the console
// doesn't), POST /proposals/{id}/approve|reject. All four return this shape.

export type ProposalStatus = 'pending' | 'approved' | 'rejected' | 'expired';

export interface ProposalChange {
  k: string;
  from: string;
  to: string;
}

export interface Proposal {
  id: string;
  /** A change carries an action and can be approved; a flag has none (approving it is a 409). */
  kind: 'change' | 'flag';
  status: ProposalStatus;
  title: string;
  why: string;
  delivery_id: string | null;
  truck_id: string | null;
  /** Approving runs this server-side (assignTruckTx): the console doesn't call /assign itself. */
  /** assign: a pending delivery. reopen: a failed one going out again (see lib/reopen.ts). */
  action:
    | { type: 'assign'; delivery_id: string; truck_id: string }
    | { type: 'reopen'; mode: 'resume' | 'handover' | 'restart'; delivery_id: string; truck_id: string }
    | null;
  changes: ProposalChange[];
  created_at: string;
  decided_at: string | null;
  /** "dispatcher", "agent", or "system: <reason>" when a stale approve expired it. */
  decided_by: string | null;
}