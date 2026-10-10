# Dispatch frontend: build status

Truck dispatch and delivery tracking (Kestrel Freight demo operator). Built from the design handoff in `Design/design_handoff_dispatch/`. Read `README.md` (what the screens look like) and `BUILD.md` (how they connect) there first.

**The API is the Go backend in `../trucking-logistics`.** `lib/types.ts` is written against its response structs (`internal/api/*.go`, `internal/db/*`). Don't add a field to it unless a Go struct has it. When the backend changes, read its handlers and update `types.ts` first, then follow the type errors.

## Stack
Next.js 15 App Router, React 19, TypeScript 5 strict (`noUncheckedIndexedAccess`), Tailwind v4 (`@tailwindcss/postcss`), TanStack Query v5, Leaflet 1.9 + react-leaflet v5 (OSM tiles), lucide-react, MSW v2 for mock mode.

TypeScript is pinned to 5.x on purpose: npm resolved 7.x, which Next 15 doesn't handle.

## Run
```
cp .env.example .env.local   # already done
npm run dev                  # http://localhost:3000, index page links every surface
npm run typecheck
```
- **Mock mode** (`NEXT_PUBLIC_API_MOCKING=enabled`): MSW serves the API in the browser. No backend is needed.
- **Real API:** set `NEXT_PUBLIC_API_MOCKING` to anything else. The browser calls `/api/*`, and `next.config.ts` rewrites that to `BACKEND_URL` (default `http://localhost:8080`). The position socket goes the same way (`/api/ws`; Next proxies the upgrade). The API now has CORS for `localhost:3000`/`3471` (GET/POST only, no PATCH) and the socket checks the same origins, but the rewrite stays so nothing depends on that list.
- **In mock mode there is no rewrite**, on purpose. A request MSW misses gets a 404 instead of reaching a real backend.
  - Before that fix, one missed request wrote test trucks into the developer's real database. **Never test write flows in mock mode while the proxy is on.**
- Operator name, phones, the agent switch and the depot aren't served by the API. They're `NEXT_PUBLIC_*` env vars, read in `lib/config.ts` (`TODO(config)`).

## Rules (from the handoff)
- Tokens: `app/dispatch-tokens.css` is a verbatim copy of the design tokens. Don't hand-edit values. `app/globals.css` imports it and adds base and map styles. Never hardcode colours; use the token utilities (`bg-surface-100`, `text-ink`, `border-border`, `text-attention`, …) or `var(--…)`.
- No shadows except selection rings and marker outlines.
- Minimum target size is 44px (the tokens file enforces it on buttons), and 56px under `.driver`.
- `StatusPill` is the only thing that colours a status.
- Every fetch goes through `lib/api.ts`. A 409 shows the server message word for word and triggers a refetch.
- `lib/positions.ts` (`usePositions`) is the only place that knows how positions arrive: one shared `GET /ws` socket per tab (snapshot, then `position` frames) laid over `GET /trucks`. `/trucks` is refetched every 30 s while the socket is up (status changes aren't pushed) and every 10 s while it's down; reconnects back off 1–30 s. A fix only replaces a newer one. In mock mode MSW's `ws.link` serves the socket (`mocks/handlers.ts`).
- Delivery data goes through `lib/deliveries.ts` (see below).
- All times, dates and distances go through `lib/format.ts` (Intl).
- The map container is always `dir="ltr"`. A truck with null coordinates is never drawn.
- Use logical properties (`ps-`/`pe-`/`start-`/`end-`/`border-s`) so RTL works.
- The global unlayered `a { color }` rule beats Tailwind utilities, so styled links set their colour inline.

## The API as the screens use it
- **`GET /deliveries` is a thin list** (`id, reference, status, customer_name, truck_id, created_at`): no stops, no end time, no truck filter.
  - Stops, events and `tracking_token` only come from `GET /deliveries/{id}`, which returns `{delivery, stops, events}` with events oldest first.
  - Screens fetch detail only where it's shown: the console's selected and expanded rows, failed deliveries from the last 48 h (for the failure time in the exception table), the driver's active delivery, and the driver summary.
- **IDs are UUIDs.** `reference` (`DEL-2026-10001`) is what people read. Console URLs carry the UUID.
- **Trucks have `driver_id`**, not a name, and no current delivery. Names come from `/drivers`; a truck's delivery is derived from the list (`activeByTruck`).
- **Assign** only works on `pending` deliveries; there's no reassignment.
- **`PATCH /trucks/{id}`** `{driver_id?, status?}`: a field left out is kept; `driver_id: ""` unassigns. Status can't leave `on_delivery` or be set to it (409, both owned by assign/complete). Unknown driver → 404 `driver not found`. Returns the truck without `lng`/`lat` (`UpdatedTruck`). Called with `patch()` from `lib/api.ts`.
- **Start/complete/fail/cancel** follow the server's state rules, and complete/fail release the truck.
- **Stops:** `POST /deliveries/{id}/stops/{stopId}/arrive|complete`, in order, only while `in_transit`. Statuses are `pending | arrived | completed | skipped`.
- **Create delivery** needs `lat`/`lng` per stop inside the service bounding box. There's no geocoding, so the form takes coordinates (`TODO(geocoding)`).
- **`POST /locations`** pings take `recorded_at`, `accuracy_m` and `speed_kph`, max 500, and must be inside the bounding box. The driver app filters out-of-area pings before sending.
- **`GET /config`** gives units (`metric | imperial`), timezone, language, centre, zoom and bounding box. It's read-only: there's no write path.
  - `useConfig()` returns an `AppConfig`: server config, the `NEXT_PUBLIC_*` values, `THRESHOLDS`, `locale` (= language), `center`, and `hasServiceArea`.
- **`GET /track/{token}`** (token exactly 16 characters) has no operator info, no ETA, and no "this is your stop" flag.
  - The failure reason is the note of the `failed` event, and end times come from events.
  - Its events have no `id`, although `TrackResponse` types them as `DeliveryEvent`; nothing reads it.
- **`/proposals` doesn't exist.** chi answers a plain 404, which the console treats as empty.

## Done
**Project setup:** package.json, tsconfig, `next.config.ts` (the API proxy), postcss, `.env.example`/`.env.local`, `.gitignore`, `public/mockServiceWorker.js`.

**`app/`**
- `layout.tsx`: Google Fonts (Inter and JetBrains Mono), leaflet.css, globals.
- `providers.tsx`: QueryClient; starts MSW; renders on the client only, after mount (no time hydration mismatches); applies `.dark` from the OS theme **on `<body>`** (see dark map markers below); shows a `/health` banner if the server is down.
- `page.tsx`: a dev index linking every surface and the 16-character demo tracking tokens.

**`lib/`**
- `types.ts`: the backend shapes (maintained by hand against the Go structs) and `THRESHOLDS`.
- `api.ts`: `api`, `post`, `ApiError`, `isConflict`, `isNotFound`. `API_URL` defaults to `/api`.
- `config.ts`: `useConfig()` → `AppConfig`, `inServiceArea`, `isRtlLocale`.
- `deliveries.ts`:
  - hooks: `useDeliveries`, `useDeliveryDetail`, `useDeliveryDetails`, `useDrivers`;
  - query keys;
  - event helpers: `eventText` (dispatcher wording), `customerEventText`, `eventAt`, `endedAt`, `failReasonOf`;
  - stop helpers: `stopDone`, `currentStopIndex`, `hasLatLng`.
- `exceptions.ts`: pure rules (`isStale`, `activeByTruck`, `deriveExceptions`): silent truck, pending N+ while trucks are free, failed in the window (times from detail), agent flags. There's no late rule, because there are no ETAs (`TODO(eta-api)`).
- `format.ts`: Intl time, date, durations, distance (`metric | imperial`), tz helpers and `haversineKm`.
- `positions.ts`, `offlineQueue.ts`, `labels.ts`, `useNow.ts`, `useMediaQuery.ts`, `useElementWidth.ts`.

**Customer tracking `/t/[token]`:** `components/tracking/view.ts` maps the response to 8 view states. Polls every 30 s and stops once the delivery has ended; phone layout below 900px.
- Truck plate: from the `assigned` event note.
- Distance replaces the ETA.
- Operator name, phone and timezone: from config.
- **Privacy (`TODO(track-privacy)`):** the API sends every stop's address to anyone with the link, and doesn't mark the viewer's stop.
  - A single drop-off is treated as the viewer's.
  - On a multi-drop delivery, no drop-off address or pin is shown.
  - The backend should return only the link's own stop.

**Dispatcher console `/console`:** `ConsoleView` orchestrates the panes.
- URL state `?d=&t=&f=`.
- Queries: the list every 15 s, positions, drivers, detail on demand, and proposals.
- Optimistic assign with rollback; a 409 is shown word for word and refetched.
- New delivery with coordinates; the depot is pre-filled from env.
- Map: selection and candidate links; tabs below 1000px.
- Row lines are what the list knows: waiting time, truck · driver, failure time.
- The expanded row shows phone, goods, the **customer link** (`/t/{tracking_token}`), stops (arrived and completed times) and events.
- The Ask box answers "which trucks are free". "Late" says it can't tell yet (`TODO(eta-api)`).
- Other pieces: `ConsoleHeader`, `DeliveryList`, `DeliveryRow`, `AssignPanel`, `NewDeliveryForm`, `TruckList`, `ExceptionTable`, `AskBox` (`TODO(agent-api)`), `ProposalsPane` (`TODO(proposals-api)`), `DispatchNav`, `ui.ts`.

**Fleet `/console/fleet`:**
- Trucks: plate, model, status, usual driver (via `driver_id`). Drivers: name, phone, usual truck (reverse of `driver_id`).
- Add a truck: plate + model (`POST /trucks`), and "Starts as" Available or In maintenance. The API creates every truck available, so maintenance is a `PATCH` straight after.
- Add a driver: name + phone (`POST /drivers`), and an optional usual truck (only trucks with no `driver_id`), set by `PATCH`ing that truck's `driver_id` straight after.
- If the follow-up PATCH is refused, the row is still added and the form says so (`FormResult` `title`), with the server message word for word.
- The plate duplicate hint is local; the server's 409 decides. The DB unique check is exact, not normalised.
- The lists are display-only, as in the design: there's no edit for an existing truck's status or driver yet, though the PATCH supports it.
- Capacity and the app-link SMS need backend support (`TODO(fleet-api)`).

**Settings `/console/settings`: read-only.**
- Shows the server config with the env var that sets each value (`OPERATOR_UNITS/TIMEZONE/LANGUAGE`, `MAP_CENTER_*`, `MAP_DEFAULT_ZOOM`, `SERVICE_MIN/MAX_LAT/LNG`).
- Also shows the frontend env values, the thresholds, the service area outlined on a map, and the Intl preview including RTL.
- Warns when no service area is set.
- The sticky header sets the root `scroll-padding-top` from its live height.

**Driver PWA `/driver`:** routes `/driver` (Today or empty), `/driver/stop/[n]`, `stop/[n]/contact`, `stop/[n]/problem`, `/driver/done`.
- `DriverProvider`:
  - Resolves `NEXT_PUBLIC_DEMO_TRUCK_ID` (a plate or UUID) against `/trucks`.
  - Filters the delivery list to this truck and polls the active delivery's detail. Truck, list and detail are cached in localStorage so the app opens offline.
  - Optimistic statuses come from queued actions, and per-stop confirm times are kept locally.
  - GPS `watchPosition` batches to `/locations` every `ping_seconds`. A parked phone sends nothing between fixes (there is no heartbeat).
  - Also handles Wake Lock and the 2-minute gap notice.
- `lib/offlineQueue.ts` (IndexedDB):
  - Start, **stop arrive/complete**, complete, fail and location batches are written first, then sent in order.
  - A 4xx/409 drops the item; `dropped` carries the item and its message, shown word for word. A 5xx or network error keeps it.
  - Refused actions are rolled back in `DriverProvider`. A stop event loses its `arrived`/`done` record (by `stopAction`, or by the path for older items). A start, complete or fail loses its status override, so the screens fall back to the server's status; a refused complete also clears the receiver's name, and a refused fail clears its reason.
- Stop screen: hold to arrive, then hold to complete. The last drop-off takes the receiver's name (not sent, `TODO(pod-api)`), then the last stop's complete and `POST /complete` follow.
- Contact uses the **delivery's customer phone**: stop contacts are stored on create but not returned (`TODO(stop-contacts)`).
- Problem → `POST /fail {reason}`.
- The summary reads stops, start/end and reason from the ended delivery's detail.
- `public/driver-sw.js` (scope `/driver`), `driver.webmanifest`, `driver-icon.svg`. The worker isn't registered in mock mode (it would take over from MSW's).

**Mocks (`mocks/`):** mirror the Go handlers: routes, shapes, validation, state rules and error messages.
- UUIDs, `DEL-YYYY-NNNNN` references, 16-character tokens, a bounding box (53.4–54.1, −2.3 to −1.0), stops in order, release on complete/fail/cancel. `/proposals` gives a 404.
- Simulation: trucks on delivery drive to their next stop and report on the ping interval.
- Seed: 32 trucks, 30 drivers, 22 active deliveries (KF-04/10/15 assigned), 4 pending (oldest 2 h 14 min), 1 failed 21 min ago, 5 completed, 1 cancelled.
  - KF-19 is silent for 26 min; KF-25's first assign gives a 409.
  - KF-12 (the driver demo) holds at stop 2 of 5.
- Tokens: `demointransit001`, `demomultidrop001`, `demopending00001`, `demoassigned0001`, `demostale0000001`, `democompleted001`, `demofailed000001`, `democancelled001`.

**Accessibility:** checked at 200% zoom (720×450) and at 320px for the driver app, with no overflow, an h1 per page, targets ≥44/56px and a real Tab/Shift+Tab walk.
- Dark-theme map markers: the tokens' `.dark` block re-colours `--marker-*`, but tiles stay light (pickup 1.03:1).
- With `.dark` on `<body>`, `globals.css` captures the light marker colours on `:root` as `--map-marker-*` and restores them in `.dm-map`.
- Raise with the design-system owner: `--marker-*` arguably shouldn't be in `.dark`.

**Verified against the mock in headless Edge** after the API change:
- console: counts, exceptions, the assign 409 then success, new delivery with a coordinate check;
- Fleet: the 409, adds, the driver↔truck join;
- Settings;
- all tracking states including multi-drop privacy;
- the driver flow, with stop events going offline and flushing to the stop endpoints, completion and fail confirmed server-side;
- 200% zoom on the changed screens.

**Visual checks:**
- Drive Edge over CDP in real time (`--virtual-time-budget` renders blank because MSW never starts).
- Kill the process tree with `taskkill /T /F`.
- Pre-compile routes after a dev-server restart, or the first client navigation waits on compilation.
- Ignore Next's `NEXTJS-PORTAL` in focus audits.

## Not done yet
Nothing from BUILD.md. What's left is backend work (the tags below), and running the frontend against the real Go API end to end.

Reference behaviour and copy for each screen is in the matching `Design/design_handoff_dispatch/*.dc.html` file: the markup is the layout and the `class Component` block is the behaviour.

## Backend gaps (search for these TODO tags)
- `TODO(config)`: operator name, phones, agent switch and depot aren't in `GET /config`; there's no write path.
- `TODO(config-thresholds)`: stale, pending, failed-window and ping thresholds are client constants.
- `TODO(eta-api)`: no ETA or promised time per stop, so there's no late rule, no ETA on tracking, and the Ask box can't answer "late".
- `TODO(track-privacy)`: `/track` returns every stop's address and doesn't mark the viewer's stop.
- `TODO(stop-contacts)`: stop contact name and phone are stored on create but not returned.
- `TODO(events-stop-id)`: `ListEventsForDelivery` doesn't select `stop_id`, so events say "a stop" instead of "stop 3".
- `TODO(geocoding)`: delivery creation needs coordinates.
- `TODO(pod-api)`: proof of delivery on `/complete`.
- `TODO(fleet-api)`: truck capacity, app-link SMS.
- `TODO(proposals-api)`: `GET /proposals`, approve and reject.
- `TODO(agent-api)`: the Ask box answers locally.
- **Socket status:** `position` frames omit `status`, and assign/complete/fail/cancel/PATCH aren't broadcast, so status still comes from `/trucks` polling. `ingestLocations` only broadcasts when the stored fix moved (late batches are kept but not pushed); the client still ignores older fixes.
