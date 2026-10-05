# Dispatch: build guide

How to build the frontend, how the parts connect, and the order to build them in. Read with:
- `CLAUDE.md`: the stack, the rules and the API. It wins on any engineering conflict.
- `README.md`: what every screen looks like and how it behaves.
- The `.dc.html` files: open them in a browser as the visual reference.

## 1. What you're building

One Next.js 15 app (App Router, TypeScript strict, Tailwind) over one Go REST API. There are three surfaces plus two dispatcher screens, separated by route group:

| Route | Surface | Who | Auth |
|---|---|---|---|
| `/t/[token]` | Customer tracking | Anyone with the SMS link | None, public |
| `/driver` | Driver PWA | Driver, phone in the cab | Hardcoded demo session |
| `/console` | Dispatcher console | Dispatcher, desktop | Hardcoded demo session |
| `/console/fleet` | Fleet: add trucks and drivers | Dispatcher | Same session |
| `/console/settings` | Operator configuration | Dispatcher | Same session |

Out of scope everywhere: sign-in screens, customer accounts, customer-created deliveries, billing, chat, route optimisation, multi-tenancy. The demo session is a constant (for example `DEMO_DRIVER_TRUCK_ID`, `DEMO_DISPATCHER`), not a login flow.

## 2. How the parts connect

```
                 ┌───────────────────────── Go REST API ─────────────────────────┐
                 │  /deliveries  /trucks  /drivers  /locations  /track/{token}   │
                 │  /config (startup config)   /proposals (not yet)              │
                 └──────▲───────────────▲──────────────────▲─────────────────────┘
       POST /locations  │   GET /track  │      GET/POST everything else
       POST /deliveries │   /{token}    │      (poll /trucks every 10 s)
       /{id}/start|     │   (poll 30 s) │
       complete|fail    │               │
                 ┌──────┴─────┐  ┌──────┴───────┐  ┌───────┴──────────────────────┐
                 │ Driver PWA │  │ Customer page│  │ Dispatcher console           │
                 │ /driver    │  │ /t/[token]   │  │ /console (+fleet, settings)  │
                 └────────────┘  └──────────────┘  └──────────────────────────────┘
```

**One delivery's life, end to end:**
1. **Console.** The dispatcher clicks New delivery and submits `POST /deliveries`. It appears as `pending` in the console list. The backend issues a tracking token, and the customer is texted `/t/{token}`; the SMS is sent by the backend, not the frontend.
2. **Customer page.** It shows "Waiting for a truck", with no marker and no ETA.
3. **Console.** The dispatcher picks a truck in the inline assign panel and submits `POST /deliveries/{id}/assign {truck_id}`. The delivery becomes `assigned` and the truck `on_delivery`. On a 409, show the server message word for word and refetch `/trucks`.
4. **Driver PWA.** It polls for its assigned delivery. "Today" shows the stops, and the driver starts the run with `POST /deliveries/{id}/start`, which makes the delivery `in_transit`.
5. **Driver PWA.** From then on, `navigator.geolocation.watchPosition` batches pings into `POST /locations {truck_id, pings[]}` about every 15 s. Pings queue offline.
6. **Console and customer page.** Both read positions through their polling: `/trucks` every 10 s in the console, `/track/{token}` in the customer page. Markers glide between pings and never jump. A position older than the stale threshold is shown as stale on both.
7. **Driver PWA.** The driver confirms arrival and completion per stop by press-and-hold, ending with `POST /deliveries/{id}/complete`. If something goes wrong, they send `POST /deliveries/{id}/fail {reason}` with a reason from the fixed list.
8. **All three surfaces** show the end state with the same `<StatusPill>`.

**Per-stop arrival and completion.** The API listed in CLAUDE.md has no per-stop endpoints. Until they exist, queue stop events locally and show progress in the driver UI. Only delivery-level `start`, `complete` and `fail` reach the server. Mark this with `TODO(stops-api)`.

## 3. Project structure

```
app/
  layout.tsx                 root: globals.css, leaflet.css, fonts, QueryClientProvider
  globals.css                = dispatch-tokens.css (do not hand-edit values)
  t/[token]/page.tsx         customer tracking (public)
  driver/
    layout.tsx               <div className="driver">: 56px target floor; registers the service worker
    page.tsx                 Today
    stop/[n]/page.tsx        Current stop
    stop/[n]/contact/page.tsx
    stop/[n]/problem/page.tsx
    done/page.tsx
  console/
    layout.tsx               header: counts, exception table, nav (Console · Fleet · Settings)
    page.tsx                 the three panes plus the proposals rail
    fleet/page.tsx
    settings/page.tsx
components/
  StatusPill.tsx             the only status representation
  map/
    DispatchMap.tsx          react-leaflet; wrap in next/dynamic, ssr:false
    TruckMarker.tsx  StopPin.tsx  RouteLine.tsx
  console/  DeliveryList.tsx  DeliveryRow.tsx  AssignPanel.tsx  NewDeliveryForm.tsx
            TruckList.tsx  ExceptionTable.tsx  AskBox.tsx  ProposalsPane.tsx
  driver/   GpsStrip.tsx  HoldToConfirm.tsx  StopList.tsx  QueueCard.tsx  PausedNotice.tsx
  tracking/ TrackingPhone.tsx  TrackingDesktop.tsx  StopTimeline.tsx  History.tsx
lib/
  api.ts                     fetch wrapper, ApiError, the single error parser
  types.ts                   Delivery, Stop, Truck, Driver, Config: nullable fields typed as | null
  format.ts                  Intl helpers: time, date, distance, duration
  config.ts                  useConfig(), with defaults marked TODO(config) until the endpoint is confirmed
  positions.ts               usePositions(): the ONLY place that knows about polling
  exceptions.ts              pure rules: silent, pending too long, failed recently
  offlineQueue.ts            IndexedDB queue for the driver
```

## 4. Shared layer, built first

**`lib/api.ts`**
```ts
export class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'}${path}`,
    { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.error ?? res.statusText);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}
export const isConflict = (e: unknown): e is ApiError => e instanceof ApiError && e.status === 409;
```
Every call goes through this. UI rule: a 409 shows `error.message` word for word and triggers a refetch. Any other error shows its message plus a retry button.

**`lib/types.ts`.** Copy the nullability from CLAUDE.md exactly: `lat: number | null`, `lng: number | null`, `last_seen_at: string | null`, `truck_id: string | null`. A truck with null coordinates is never drawn.

**`lib/format.ts`.** Every time, date and distance shown on screen goes through here:
- `formatTime(iso, tz)`, `formatDate`, `formatDistance(km, units, locale)`, `formatAgo(iso)`, all via `Intl`.
- On the customer page, `tz` is the viewer's zone from `Intl.DateTimeFormat().resolvedOptions().timeZone`. When it differs from `config.timezone`, add the "Your time · {abbr}" tag.

**`lib/config.ts`.** Units, timezone, language, map centre, service area and thresholds: `stale_minutes` (20), `pending_minutes` (120), `failed_window_minutes` (60), `ping_seconds` (15). The backend reads its config at startup; fetch it once and cache it with `staleTime: Infinity`. If the endpoint's shape isn't confirmed yet, fall back to defaults tagged `TODO(config)`. The settings screen writes the same object.

**`lib/positions.ts`.**
```ts
export function usePositions() {
  return useQuery({ queryKey: ['trucks'], queryFn: () => api<Truck[]>('/trucks'), refetchInterval: 10_000 });
}
```
Nothing else polls trucks. Swapping to a WebSocket later changes only this file.

**`StatusPill.tsx`.** Ten statuses, three sizes. Build it straight from `StatusPill.dc.html`. No other component colours a status.

## 5. Map (shared by all three surfaces)

- `DispatchMap` is loaded with `next/dynamic(() => import(...), { ssr: false })`, and `leaflet.css` is imported once in the root layout. Tiles come from OSM with attribution. The map container is always `dir="ltr"`.
- Markers are `L.divIcon` using the README's marker spec and the `--marker-*` and `--map-*` tokens.
- **Smooth movement.** Keep the previous and latest ping per truck. On each new ping, animate from the marker's current position to the new one over `config.ping_seconds`, either with requestAnimationFrame or a CSS transition on the divIcon's wrapper. Never jump a marker to its new position. Skip the animation when `prefers-reduced-motion` is set.
- **Stale.** `now - last_seen_at >= config.stale_minutes`: hollow, grey, dashed, and always labelled with the age.

## 6. Customer tracking (`/t/[token]`)

- Fetch `GET /track/{token}` with React Query, refetching every 30 s while the tab is visible, plus on focus. A tab left open for hours must keep updating.
- Map the response to one of eight view states: pending, assigned, in_transit, stale, completed, failed, cancelled, not_found (404).
- Lay it out as phone below about 900px and desktop above, using two layout components with the same data. Don't stretch the phone layout to fill the desktop.
- **Privacy.** Other customers' stops come from the API without addresses, and are rendered as "Another customer's drop-off".
- No account, no forms, no links into the app.

## 7. Driver PWA (`/driver`)

- The `driver` class on the layout root sets the 56px floor. Every screen has `<GpsStrip>` at the top and one primary action at the bottom.
- **GPS.**
  - `watchPosition` with high accuracy. Batch pings and send them every `ping_seconds`.
  - Track `lastSentAt` and show "GPS live · N s ago".
  - Request a screen Wake Lock while a delivery is active. On `visibilitychange` back to visible, detect any gap longer than 2 minutes and show `<PausedNotice>` once for that gap.
- **Offline queue (`offlineQueue.ts`).**
  - Every state-changing action (start, complete, fail, location batches, stop events) is written to IndexedDB first, then sent.
  - The queue flushes in order on `online` and when the app opens; a 409 or 4xx drops the item and shows the message, a 5xx or network error keeps it.
  - The strip shows "Offline · N waiting". The queue card lists each item with the time it happened.
- **`HoldToConfirm`.**
  - Pointer down starts a 800ms timer, with pointer capture, `touch-action: none` and the context menu suppressed. Pointer up early resets it.
  - Space or Enter held works the same way. On completion it vibrates 40ms and fires.
  - This is the only confirm control; ship the hold version, not the slide.
- **Contact client.** `tel:` link to call. The quick messages are `sms:` links with a prefilled body, or a backend SMS endpoint if one is added. No free text.
- **Problem.** A fixed radiogroup of the five reasons, sent as `POST /deliveries/{id}/fail {reason}`.
- **Proof of delivery.** It needs a field on `/complete`, which doesn't exist yet. Build the UI but don't send the data; mark it `TODO(pod-api)`.

## 8. Dispatcher console (`/console`)

**State.**
- Selection lives in URL search params (`?d=DLV-40716&t=KF-07&f=pending`), so a refresh keeps the view.
- Data comes from React Query: `['deliveries']` refetched every 15 s, and `['trucks']` from `usePositions()`.

**Derived, all pure functions in `lib/exceptions.ts`.**
- Exceptions: silent trucks; pending past the threshold while any truck is available; failed within the window; agent-raised ones from `/proposals` once that exists.
- Header counts and the late flags.

**Interactions.**
- Selecting a delivery highlights its stops, route and truck on the map.
- Selecting a truck filters the delivery list.
- A row expands in place to show its stops, events and assign panel.
- Assign is `POST /assign`. Apply it optimistically, then roll back on error and show a 409 word for word.
- New delivery is an inline form above the list that calls `POST /deliveries`; then select and expand the new row.

**Agent.**
- Ask box: an inline answer card above the list, with no message history. Until there's an agent endpoint, answer by filtering locally (for example "late" means 10+ min past the promised time).
- Proposals pane: collapsed by default; a 404 counts as empty. Approve calls the underlying action (for example assign) and Reject is client-side until there's an endpoint.

**Fleet (`/console/fleet`).**
- `GET`/`POST /trucks` and `/drivers`.
- Normalise plates (strip spaces, hyphens and dots, uppercase) before checking for duplicates locally, but let the server's 409 decide.
- Payload, pallets, usual truck and the app-link SMS need backend fields (`TODO(fleet-api)`).

**Settings (`/console/settings`).** Edit the config object. Show unsaved changes in the header, with Save and Discard.

**Zoom.** Under a 1000px container width (200% zoom on a 1440 screen), switch the panes to tabs and stack the exception table.

## 9. Build order

1. Tokens (`globals.css`), fonts, `api.ts`, `types.ts`, `format.ts`, `config.ts`, `StatusPill`.
2. `DispatchMap` with markers and smooth movement, checked against a mock `/trucks`.
3. Customer tracking: it's read-only, so it proves the shared layer.
4. Console read paths: lists, map, selection, exceptions.
5. Console write paths: assign (including the 409), new delivery, row expansion.
6. Driver PWA: the screens and `HoldToConfirm`, then GPS, then the offline queue and the service worker.
7. Fleet, settings, and the agent pieces (empty states first).
8. Accessibility pass: 200% zoom, keyboard-only, focus never under sticky headers, contrast on the map tiles.

## 10. Environment and running

```
NEXT_PUBLIC_API_URL=http://localhost:8080
# demo session; replace when real auth exists (out of scope)
NEXT_PUBLIC_DEMO_TRUCK_ID=KF-12
```
Run `npm run dev`, with the Go API on `:8080`. Check `GET /health` on boot and show a plain banner if it fails.

**Mock mode.** For working without the backend, add MSW handlers using the sample data from the `.dc.html` files: 32 trucks, around 33 deliveries, one silent truck, one failed in the last hour, and four pending.

## 11. Open backend gaps (search for these TODO tags)

- `TODO(config)`: confirm the config read and write endpoints.
- `TODO(stops-api)`: per-stop arrive and complete.
- `TODO(pod-api)`: proof of delivery on `/complete`.
- `TODO(fleet-api)`: truck capacity, driver–truck link, sending the app-link SMS.
- `TODO(proposals-api)`: `GET /proposals`, approve and reject.
- `TODO(ws)`: a position socket to replace polling in `positions.ts`.

## Design source links

Each screen below has two references. The local file is the exact source and always works offline. The project link opens the same file in the design tool, where it may have been updated since this package was exported.

**Before using:** replace `DESIGN_PROJECT_URL` with this project's share link, copied from the design tool's Share menu. It should look like `https://…/projects/<id>`.

| Design | Local file | Project link | Builds |
|---|---|---|---|
| Customer tracking | `./Customer Tracking.dc.html` | DESIGN_PROJECT_URL/Customer%20Tracking.dc.html | `/t/[token]` |
| Driver app | `./Driver App.dc.html` | DESIGN_PROJECT_URL/Driver%20App.dc.html | `/driver` |
| Dispatcher console (board of scenarios) | `./Dispatcher Console.dc.html` | DESIGN_PROJECT_URL/Dispatcher%20Console.dc.html | `/console` |
| Console component (live) | `./ConsoleView.dc.html` | DESIGN_PROJECT_URL/ConsoleView.dc.html | `/console` |
| Fleet | `./Fleet.dc.html` | DESIGN_PROJECT_URL/Fleet.dc.html | `/console/fleet` |
| Operator settings | `./Operator Settings.dc.html` | DESIGN_PROJECT_URL/Operator%20Settings.dc.html | `/console/settings` |
| Status pill | `./StatusPill.dc.html` | DESIGN_PROJECT_URL/StatusPill.dc.html | `components/StatusPill.tsx` |
| Tokens | `./Dispatch Tokens.dc.html` | DESIGN_PROJECT_URL/Dispatch%20Tokens.dc.html | `app/globals.css` |
| States reference | `./Delivery States Reference.dc.html` | DESIGN_PROJECT_URL/Delivery%20States%20Reference.dc.html | `—` |

**For Claude Code:** if a screen's behaviour is unclear from README.md:
- Open the local `.dc.html` first. The markup is the layout and the `class Component` block is the behaviour.
- If you have access to the project link and it differs from the local file, the project link is newer. Say so before building from it.
