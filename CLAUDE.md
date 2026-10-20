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
- **Real API:** set `NEXT_PUBLIC_API_MOCKING` to anything else. The browser calls `/api/*`, and `next.config.ts` rewrites that to `BACKEND_URL` (default `http://localhost:8080`). The position socket goes the same way (`/api/ws`; Next proxies the upgrade). The API has CORS for `localhost:3000`/`3471` (GET/POST/PATCH) and the socket checks the same origins, but the rewrite stays so nothing depends on that list. Set `NEXT_PUBLIC_WS_URL` (e.g. `ws://localhost:8080/ws`) to connect the socket directly instead.
- **In mock mode there is no rewrite**, on purpose. A request MSW misses gets a 404 instead of reaching a real backend.
  - Before that fix, one missed request wrote test trucks into the developer's real database. **Never test write flows in mock mode while the proxy is on.**
- **The agent** (`../../PycharmProjects/PythonProject1/agent`, FastAPI on :8200) answers the Ask box and writes proposals on a timer. The console calls `POST /ask` directly at `NEXT_PUBLIC_AGENT_URL` (default `http://localhost:8200`), because the agent has CORS for `localhost:3000`/`3471`, so there's no rewrite. In mock mode MSW answers `/ask` ("which trucks are free" only).
- Every operator setting (region, map and service area, company name, phones, depot, agent switch, alert thresholds) comes from `GET /config` and is edited on Settings (`PUT /config`). Stored in the API database; applies without a restart.

## Rules (from the handoff)
- Tokens: `app/dispatch-tokens.css` is a verbatim copy of the design tokens. Don't hand-edit values. `app/globals.css` imports it and adds base and map styles. Never hardcode colours; use the token utilities (`bg-surface-100`, `text-ink`, `border-border`, `text-attention`, …) or `var(--…)`.
- No shadows except selection rings and marker outlines.
- Scrollbars are thin and themed everywhere (`globals.css`, `--border` thumb). Don't restyle them per element.
- Minimum target size is 44px (the tokens file enforces it on buttons), and 56px under `.driver`.
- `StatusPill` is the only thing that colours a status.
- Every fetch goes through `lib/api.ts`. A 409 shows the server message word for word and triggers a refetch.
- `lib/positions.ts` (`usePositions`) is the only place that knows how positions arrive: one shared `GET /ws` socket per tab (snapshot, then `position` frames) laid over `GET /trucks`. `/trucks` is refetched every 30 s while the socket is up (status changes aren't pushed) and every 10 s while it's down; reconnects back off 1–30 s. A fix only replaces a newer one. In mock mode MSW's `ws.link` serves the socket (`mocks/handlers.ts`).
  - The backstop is its own timer, **not** TanStack's `refetchInterval`: every `setQueryData` from the socket restarts that timer (query-core 5.104 `onQueryUpdate` → `#updateTimers`), so with trucks moving it never fired.
  - `usePositionsStatus()` is `connecting | live | down`. On `down` the console map dims and shows "Positions aren't live · reconnecting · last update …". Markers glide 3 s while live, 10 s while polling.
- Delivery data goes through `lib/deliveries.ts` (see below).
- All times, dates and distances go through `lib/format.ts` (Intl).
- The map container is always `dir="ltr"`. A truck with null coordinates is never drawn.
- Use logical properties (`ps-`/`pe-`/`start-`/`end-`/`border-s`) so RTL works.
- The global unlayered `a { color }` rule beats Tailwind utilities, so styled links set their colour inline.

## The API as the screens use it
- **Sign-in.** Every route except `/health`, `/config`, `/track/{token}` and `/auth/*` needs a session.
  - Dispatchers: `POST /auth/login {email, password}`; drivers: `POST /auth/driver-login {phone, pin}`. The API sets an HttpOnly `session` cookie; the page never sees the token. `GET /auth/me` → `{role, id, name, email?, truck_id?}` or 401. `POST /auth/logout`.
  - `components/auth/Gate.tsx`: `DispatcherGate` (in `app/console/layout.tsx`) and `DriverGate` (in `DriverRoot`) show the sign-in form until `me` is the right role. `useSignedInAs()` inside them.
  - A 401 from any other call clears `me` (`setUnauthorizedHandler` in Providers), so the gate shows sign-in again. The driver queue keeps a 401'd item and sends it after sign-in.
  - Drivers only get their own truck (the one with them as `driver_id`), its deliveries and themselves; someone else's is a 404. They can't open `/ws`. Dispatchers set PINs in Fleet (`POST /drivers/{id}/pin`), which signs that driver out.
  - The agent is reached at `/agent/*` on this origin (Next rewrite to `AGENT_BACKEND_URL`) so the cookie goes along; `/ask` checks a dispatcher is asking.
  - Mock mode: any email/password is a dispatcher; a mock driver's phone with PIN 1234 is that driver (`mocks/auth.ts`).
- **`GET /deliveries` is a thin list** (`id, reference, status, customer_name, truck_id, created_at`): no stops, no end time, no truck filter.
  - Stops, events and `tracking_token` only come from `GET /deliveries/{id}`, which returns `{delivery, stops, events}` with events oldest first.
  - Screens fetch detail only where it's shown: the console's selected and expanded rows, failed deliveries from the last 48 h (for the failure time in the exception table), the driver's active delivery, and the driver summary.
- **IDs are UUIDs.** `reference` (`DEL-2026-10001`) is what people read. Console URLs carry the UUID.
- **Trucks have `driver_id`**, not a name, and no current delivery. Names come from `/drivers`; a truck's delivery is derived from the list (`activeByTruck`).
- **Assign** only works on `pending` deliveries; there's no reassignment.
- **`PATCH /trucks/{id}`** `{driver_id?, status?}`: a field left out is kept; `driver_id: ""` unassigns. Status can't leave `on_delivery` or be set to it (409, both owned by assign/complete). Unknown driver → 404 `driver not found`. Returns the truck without `lng`/`lat` (`UpdatedTruck`). Called with `patch()` from `lib/api.ts`.
- **Start/complete/fail/cancel** follow the server's state rules, and complete/fail/cancel release the truck. A fail with `breakdown` or `accident` sends the truck to `maintenance` (the console says "In the workshop") and adds a `truck_maintenance` event after `failed`. The `failed` note is always the bare reason. Events are ordered by `created_at, id`, since one transaction's events share a timestamp.
- **Stops:** `POST /deliveries/{id}/stops/{stopId}/arrive|complete`, in order, only while `in_transit`. Statuses are `pending | arrived | completed | skipped`. Detail stops carry `contact_name`/`contact_phone` (nullable): the site contact.
- **Events** from `/deliveries/{id}` carry `stop_id` (set on `stop_arrived`/`stop_completed`), so the console says "Arrived at stop 2".
- **Create delivery** needs `lat`/`lng` per stop inside the service bounding box.
- **`GET /geocode?q=`** (3–200 characters) returns up to 5 `{label, lat, lng}` matches inside the service area. A 502 means the provider is down; its message is shown as-is.
  - The API uses Nominatim (OpenStreetMap) behind a `geocode.Geocoder` interface, configured by `GEOCODER_URL`, `GEOCODER_USER_AGENT` and `GEOCODER_EMAIL`.
  - It throttles to one request a second, as Nominatim's policy asks, and caches results for 24 h.
  - Switching to a paid provider means adding another `Geocoder`; nothing changes in the frontend.
- **`POST /locations`** pings take `recorded_at`, `accuracy_m` and `speed_kph`, max 500, and must be inside the bounding box. The driver app filters out-of-area pings before sending.
- **`GET /config`** (public) gives every operator setting: country, units (`metric | imperial`), timezone, language, centre, zoom, bounding box, operator_name, support_phone, dispatch_phone, depot, agent_enabled, stale/pending/failed-window/ping thresholds, updated_at (and updated_by for dispatchers). **`PUT /config`** (dispatchers) saves the whole object; **`POST /config/check`** counts open stops and trucks outside a proposed area.
  - `useConfig()` returns an `AppConfig`: the server config plus `locale` (= language), `center`, and `hasServiceArea`. Refetched every 5 minutes and on focus.
- **`GET /track/{token}`** (token exactly 16 characters) has no operator info and no ETA. It has `plate_number` (null until assigned, and after a cancel) and every stop.
  - The failure reason is the note of the `failed` event, and end times come from events.
  - Its events are `TrackEvent`: no `id`, no `stop_id`.
- **Proposals:** `GET /proposals?status=` (default `pending`), `POST /proposals` (the agent writes; the console doesn't), `POST /proposals/{id}/approve|reject`. All four return the same shape (`status`, `decided_at`, `decided_by`).
  - Approve runs the action server-side (`assignTruckTx`). The console never calls `/assign` for it.
  - 409s, shown word for word: `proposal is already <status>`, `a flag has nothing to approve`, and the assign rules' own (`truck X is on_delivery`, `delivery is … and cannot be assigned`). A stale proposal is set to `expired` with `decided_by: "system: <reason>"` and leaves the pending list.

## Done
**Project setup:** package.json, tsconfig, `next.config.ts` (the API proxy), postcss, `.env.example`/`.env.local`, `.gitignore`, `public/mockServiceWorker.js`.

**`app/`**
- `layout.tsx`: Google Fonts (Inter and JetBrains Mono), leaflet.css, globals.
- `providers.tsx`: QueryClient; starts MSW; renders on the client only, after mount (no time hydration mismatches); applies `.dark` **on `<body>`** from the theme preference (`lib/theme.ts`: System, Light or Dark, saved in localStorage, switched by `ThemeToggle` in the console header and `DispatchNav`; see dark map markers below); shows a `/health` banner if the server is down.
- `page.tsx`: a dev index linking every surface, plus real tracking links for the 20 most recent deliveries (tokens from each delivery's detail) and one link that doesn't exist.

**`lib/`**
- `types.ts`: the backend shapes (maintained by hand against the Go structs) and `THRESHOLDS`.
- `api.ts`: `api`, `post`, `ApiError`, `isConflict`, `isNotFound`. `API_URL` defaults to `/api`.
- `config.ts`: `useConfig()` → `AppConfig`, `inServiceArea`, `isRtlLocale`.
- `deliveries.ts`:
  - hooks: `useDeliveries`, `useDeliveryDetail`, `useDeliveryDetails`, `useDrivers`;
  - query keys;
  - event helpers: `eventText` (dispatcher wording), `customerEventText`, `eventAt`, `endedAt`, `failReasonOf`;
  - stop helpers: `stopDone`, `currentStopIndex`, `hasLatLng`.
- `exceptions.ts`: pure rules (`isStale`, `activeByTruck`, `deriveExceptions`): silent truck, pending N+ while trucks are free, failed in the window (times from detail), agent flags, and late / at risk against the due time (`lib/due.ts`).
- `format.ts`: Intl time, date, durations, distance (`metric | imperial`), tz helpers and `haversineKm`.
- `positions.ts`, `offlineQueue.ts`, `labels.ts`, `useNow.ts`, `useMediaQuery.ts`, `useElementWidth.ts`.

**Customer tracking `/t/[token]`:** `components/tracking/view.ts` maps the response to 8 view states. Polls every 30 s and stops once the delivery has ended; phone layout below 900px.
- Truck plate: the response's `plate_number`, never parsed out of an event note.
- Distance replaces the ETA. On a multi-drop delivery it's to the next open drop-off, labelled with its stop number.
- Operator name, phone and timezone: from config.
- **Questions box** (`AskDelivery`): the customer asks about this delivery and the agent answers through `POST /track/{token}/ask` (`askAboutDelivery` in `lib/api.ts`).
  - The agent has no tools for this. It answers from that link's `/track` data only, in the viewer's time zone, never gives an arrival time, and sends changes to the operator.
  - It's rate-limited per link; a 429 is shown as-is.
  - One answer at a time, in plain text. Failures point to the operator's phone, never to agent internals.
  - Hidden when `NEXT_PUBLIC_AGENT_ENABLED=false`. In mock mode MSW answers with a short summary.
- Every stop's address and pin is shown, because all stops on a delivery belong to the customer holding the link. A single drop-off is labelled "Your drop-off". If consolidated runs are ever built, the fix is a per-stop token, not redaction.

**Dispatcher console `/console`:** `ConsoleView` orchestrates the panes.
- URL state `?d=&t=&f=`.
- Queries: the list every 15 s, positions, drivers, detail on demand, and proposals.
- Optimistic assign with rollback; a 409 is shown word for word and refetched.
- New delivery (`NewDeliveryForm`):
  - It replaces the list while it's open, and the pane widens to 560 px.
  - One field per row, label on the left. It fits without a scrollbar at 1440×900; on shorter screens the pane scrolls once, with the title bar (×) and actions pinned. Esc closes it.
  - Each address has Find (`AddressFinder` → `/geocode`). Picking a match fills the coordinates, and fills the address too if it was empty. Coordinates can still be typed by hand.
  - The depot is pre-filled from env.
- Map: selection and candidate links; tabs below 1000px.
- Header: one row, like Fleet and Settings: the title, `DispatchNav` (Console · Fleet · Settings · theme), a **Needs attention** button with the count, and the clock. It has no counts, because the list's filter chips show them.
  - The exception table only opens from that button, like the proposals strip. Open or closed is remembered per browser.
- Every list filter is a chip in the list's own filter row, including "Needs attention". Nothing in the header filters the list. `?f=active` still works from a URL.
- Row lines are what the list knows: waiting time, truck · driver, failure time.
- Vertical space in the 400px deliveries pane is tight (about 310 px of list at 1366×768), so:
  - an expanded pending row shows the assign panel first, with one line per truck, and the details (phone, link, stops, events) behind a toggle;
  - the filter chips in both panes are one row that scrolls sideways;
  - Needs attention shows four rows and scrolls after that.
- The assign panel shows straight-line distance only. There's no "minutes to pickup", because the API has no ETA.
- The assign panel offers every available truck (up to 8). Trucks with a fresh position come first, nearest first. Then come the rest, with "Last position … ago" or "No position yet" instead of a distance. Hiding them made nothing assignable whenever positions went stale.
- The expanded row shows phone, goods, the **customer link** (`/t/{tracking_token}`), stops (arrived and completed times) and events.
- The Ask box calls the agent (`askAgent` in `lib/api.ts`) and shows one answer inline above the list.
  - There's no history: a new question aborts and replaces the last one.
  - States:
    - thinking: the question and a seconds counter, cancellable;
    - answered: markdown (`react-markdown` + `remark-gfm`, no raw HTML), capped at `min(30vh, 240px)` with scrolling;
    - failed: unreachable, timed out after 90 s, or the agent's own `detail`, with Retry using the same question.
  - The rest of the console doesn't depend on the agent. The box is hidden when `NEXT_PUBLIC_AGENT_ENABLED=false`.
- Proposals: pending changes go in `ProposalsPane`. Flags go in the exception table with the Agent marker; the subject is the delivery, or else the truck's plate.
  - Approve and Reject call the endpoints.
  - A refused proposal keeps its card where it was, with the 409 word for word and a line saying what happened, until it's dismissed. This holds even after the server expires it and the refetch drops it.
- Other pieces: `ConsoleHeader`, `DeliveryList`, `DeliveryRow`, `AssignPanel`, `NewDeliveryForm`, `TruckList`, `ExceptionTable`, `AskBox`, `ProposalsPane`, `DispatchNav`, `ui.ts`.

**Fleet `/console/fleet`:**
- Trucks: plate, model, status, usual driver (via `driver_id`). Drivers: name, phone, usual truck (reverse of `driver_id`).
- Add a truck: plate + model (`POST /trucks`), and "Starts as" Available or In maintenance. The API creates every truck available, so maintenance is a `PATCH` straight after.
- Add a driver: name + phone (`POST /drivers`), and an optional usual truck (only trucks with no `driver_id`), set by `PATCH`ing that truck's `driver_id` straight after.
- If the follow-up PATCH is refused, the row is still added and the form says so (`FormResult` `title`), with the server message word for word.
- The plate duplicate hint is local; the server's 409 decides. The DB unique check is exact, not normalised.
- Each truck row has an Edit button (`TruckEdit`) with two selects:
  - Status: Available, In maintenance or Offline. It's disabled on a truck that's on a delivery.
  - Usual driver, or none.
  - Save sends only what changed. A 409 is shown word for word and refetches.
  - This goes beyond the design, whose lists are display-only. Without it, a truck that broke down could never be dispatched again.
- Capacity and the app-link SMS need backend support (`TODO(fleet-api)`).

**Failed deliveries** get a "Send it out again" panel (`SendAgainPanel`, rules in `lib/reopen.ts`) calling `POST /deliveries/{id}/reopen {mode, truck_id}`: **Reassign** (nothing collected yet, any truck), **Try again** (goods on the truck, same truck), **Hand over** (goods on a truck that broke down: another truck collects from its last position, a "Handover from …" pickup is inserted), **Start over** (every stop again). Recommended option first, from the failure reason and whether a pickup was completed. One transaction: a refused truck leaves it failed. Same reference and tracking link; a `reopened` event marks the new attempt. The agent proposes these too: a proposal with `action: {type: 'reopen', mode, delivery_id, truck_id}`; approving runs the same rules.

**Due times and ETAs** (`lib/due.ts`): `due_by` is the promised time for the last drop-off, set on New delivery or in the row's details (`POST /deliveries/{id}/due`, `DueEdit`); datetime inputs are read in the operator's time zone. `eta` (list, tracking) and `eta.stops` (detail) are the API's estimate: straight-line distance x1.3 at the Settings average speed, plus Settings minutes per stop, from the truck's last position. Late = due passed and not delivered; at risk = ETA after due. Both appear in Needs attention.

**Console list and History.** The console fetches `GET /deliveries?board=1`: everything open, failed ones until they're sent out again or cancelled (a failed delivery can be cancelled to close it), and completed/cancelled ones for `board_hours` (Settings) after they finish (`finished_at`). **History `/console/history`** (`components/history/HistoryView.tsx`, `lib/history.ts`) pages through `GET /deliveries/history` (outcome: completed, cancelled, failed, recovered = failed then completed, late; q; from/to in the operator's days; keyset `before` cursor), shows each delivery's story in one line (`journey`), its full timeline on expand, and exports the loaded rows as CSV.

**Settings `/console/settings`:** browser-settings layout: sections in a sidebar, a search box that filters rows, one sticky Save/Discard bar. Picking a country (`lib/countries.ts`) fills time zone, language, units, map centre and a country-wide service area. A changed area is checked with `POST /config/check` first and the dispatcher confirms if open stops or trucks would fall outside. Appearance (theme) is per browser and saves at once.

**Driver PWA `/driver`:** routes `/driver` (Today or empty), `/driver/stop/[n]`, `stop/[n]/contact`, `stop/[n]/problem`, `/driver/done`.
- `DriverProvider`:
  - Uses the signed-in driver's `truck_id` from `/auth/me` (no socket: it polls `/trucks`, which shows a driver only their truck).
  - Filters the delivery list to this truck and polls the active delivery's detail. Truck, list and detail are cached in localStorage so the app opens offline.
  - Optimistic statuses come from queued actions, and per-stop confirm times are kept locally.
  - GPS `watchPosition` batches to `/locations` every `ping_seconds`. A parked phone sends nothing between fixes (there is no heartbeat).
  - Also handles Wake Lock and the 2-minute gap notice.
- `lib/offlineQueue.ts` (IndexedDB):
  - Start, **stop arrive/complete**, complete, fail and location batches are written first, then sent in order.
  - A 4xx/409 drops the item; `dropped` carries the item and its message, shown word for word. A 5xx or network error keeps it.
  - Refused actions are rolled back in `DriverProvider`. A stop event loses its `arrived`/`done` record (by `stopAction`, or by the path for older items). A start, complete or fail loses its status override, so the screens fall back to the server's status; a refused complete also clears the receiver's name, and a refused fail clears its reason.
- Stop screen: hold to arrive, then hold to complete. The last drop-off takes the receiver's name (not sent, `TODO(pod-api)`), then the last stop's complete and `POST /complete` follow.
- Contact: the stop's site contact ("Site contact") when it has one. Otherwise it's the customer ("Customer") at a drop-off, or dispatch at a pickup. The stop screen shows the site contact too.
- Problem → `POST /fail {reason}`.
- The summary reads stops, start/end and reason from the ended delivery's detail.
- `public/driver-sw.js` (scope `/driver`), `driver.webmanifest`, `driver-icon.svg`. The worker isn't registered in mock mode (it would take over from MSW's).

**Mocks (`mocks/`):** mirror the Go handlers: routes, shapes, validation, state rules and error messages.
- UUIDs, `DEL-YYYY-NNNNN` references, 16-character tokens, a bounding box (53.4–54.1, −2.3 to −1.0), stops in order, release on complete/fail/cancel. `/proposals` gives a 404.
- Simulation: trucks on delivery drive to their next stop and report on the ping interval.
- Seed: 32 trucks, 30 drivers, 22 active deliveries (KF-04/10/15 assigned), 4 pending (oldest 2 h 14 min), 1 failed 21 min ago, 5 completed, 1 cancelled.
  - Proposals: one change (KF-23 for the oldest pending delivery) and one flag (KF-07).
  - Most drop-offs have a site contact; every third falls back to the customer.
  - KF-19 is silent for 26 min; KF-25's first assign gives a 409.
  - KF-12 (the driver demo) holds at stop 2 of 5.
- Tokens: `demointransit001`, `demomultidrop001`, `demopending00001`, `demoassigned0001`, `demostale0000001`, `democompleted001`, `demofailed000001`, `democancelled001`.

**Accessibility:** checked at 200% zoom (720×450) and at 320px for the driver app, with no overflow, an h1 per page, targets ≥44/56px and a real Tab/Shift+Tab walk.
- Dark-theme map markers: the tokens' `.dark` block re-colours `--marker-*`, but tiles stay light (pickup 1.03:1).
- With `.dark` on `<body>`, `globals.css` captures the light marker colours on `:root` as `--map-marker-*` and restores them in `.dm-map`.
- Raise with the design-system owner: `--marker-*` arguably shouldn't be in `.dark`.

**Verified against the real Go API** on 2026-10-14, using a throwaway DB with the simulator running:
- socket: movement, two consoles, recovery after the API was killed and restarted, and the 30 s REST backstop picking up an assign;
- proposals: empty, approve, double approve, stale and reject;
- Fleet: breakdown → workshop → Available with the driver kept, the on-delivery 409, and unassigning then reassigning a driver;
- site contacts, the tracking plate and all stops, and event stop numbers.

The same flows were also checked in mock mode.

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
- Don't test two consoles as two tabs in one headless Edge: the background tab is hidden, so it doesn't render and its polling pauses. Use one Edge instance per page.
- To test writes against the real API, use a throwaway database:
  - `createdb fleet_e2e`, then `goose up`;
  - run the API on another port with `DATABASE_URL` pointed at it.
  - The backend `.env` sets `GOOSE_DBSTRING` to the dev DB, so override it explicitly.

## Not done yet
Nothing from BUILD.md. What's left is backend work (the tags below), and running the frontend against the real Go API end to end.

Reference behaviour and copy for each screen is in the matching `Design/design_handoff_dispatch/*.dc.html` file: the markup is the layout and the `class Component` block is the behaviour.

## Backend gaps (search for these TODO tags)
- `TODO(fleet-api)`: truck capacity, app-link SMS.
- Proposals come from the agent's scheduler (a tick every `TICK_SECONDS`, default 180). It only proposes a truck within 2 km of a pickup with a fresh position, so the pane is often empty.
- **Socket status:** every successful write is announced as `{type:"changed", topics, delivery_id}`; `lib/positions.ts` invalidates the matching queries (debounced 250 ms), and polling (60 s console, 15 s driver) is only the fallback. `position` frames still omit `status`.

## Shifts and proof of delivery
- A driver starts and ends a shift in the app (`POST /auth/me/shift`); starting a delivery starts one; dispatch can end one (`POST /drivers/{id}/shift/end`). One open shift per driver. GPS runs only on shift, and the API refuses positions (409) from a driver who's off shift. The agent skips trucks whose driver is off shift.
- Every drop-off needs proof before a driver can complete it: receiver name plus signature (and photo if Settings ask for one), posted as data URLs to `/deliveries/{id}/stops/{stopId}/proof` through the offline queue. Images live in `stop_proofs` (Postgres, so backups include them). Dispatchers can complete without proof.
- Tracking page: no tabs. The delivery terms are small print under the delivery details (`TermsNotice`, full text folded behind "Read the delivery terms"). The help questions go to the agent: it has the answers in its prompt, and the first four show as tap-to-ask suggestions in `AskDelivery`. Text comes from Settings → Proof and customer page, with `{company}` and `{support_phone}` filled in.
- Auto mode (Settings → Auto mode, `auto_assign` + `auto_radius_km`): the agent's supervisor (agent `app/supervisor.py`) gives an on-shift driver with no truck a free truck (nearest the depot), and assigns pending deliveries to the nearest ready truck (free, driver on shift) within the radius, else the nearest anywhere. It acts through `POST /supervisor/pair|assign` (agent only, refused when auto mode is off), wakes on the socket's `changed` messages, and the model is only asked when two deliveries want the same truck. The console lists its actions (`GET /supervisor/actions`, topic `supervisor`) in the agent pane; failed deliveries still come as proposals. The driver app polls `/auth/me` while it has no truck and shows "You've been given …".
- Trucks whose driver is off shift (or with no driver) are parked, never "silent". Every "how long" uses `formatDuration` / `formatSince` (min → h → days).
- Simulator: drives trucks back to the depot after a delivery; with `ALLOW_DISPATCH_SHIFT_START=true` on the API it also puts its trucks' drivers on shift so auto mode uses them.
- Picking a place from Find always sets the stop's address to the full geocoder label (what the driver and the tracking page show).
