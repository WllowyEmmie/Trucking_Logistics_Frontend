# Dispatch frontend: build status

Truck dispatch and delivery tracking (Kestrel Freight demo operator). Built from the design handoff in `Design/design_handoff_dispatch/`. Read `README.md` (what the screens look like) and `BUILD.md` (how they connect) there first.

**The handoff's own `CLAUDE.md` (the engineering contract with the exact Go API shapes) was not in the package.** The API in `lib/types.ts` is inferred from README/BUILD. Check it against the real backend before relying on it.

## Stack
Next.js 15 App Router, React 19, TypeScript 5 strict (`noUncheckedIndexedAccess`), Tailwind v4 (`@tailwindcss/postcss`), TanStack Query v5, Leaflet 1.9 + react-leaflet v5 (OSM tiles), lucide-react, MSW v2 for mock mode.

TypeScript is pinned to 5.x on purpose: npm resolved 7.x, which Next 15 doesn't handle.

## Run
```
cp .env.example .env.local   # already done
npm run dev                  # http://localhost:3000, index page links every surface
npm run typecheck
```
`NEXT_PUBLIC_API_MOCKING=enabled` serves the API from MSW in the browser, so no Go backend is needed. Set it to anything else and set `NEXT_PUBLIC_API_URL` (default `http://localhost:8080`) to use the real API.

## Rules (from the handoff)
- Tokens: `app/dispatch-tokens.css` is a verbatim copy of the design tokens. Don't hand-edit values. `app/globals.css` imports it and adds base and map styles. Never hardcode colours; use the token utilities (`bg-surface-100`, `text-ink`, `border-border`, `text-attention`, …) or `var(--…)`.
- No shadows except selection rings and marker outlines.
- Minimum target size is 44px (the tokens file enforces it on buttons), and 56px under `.driver`.
- `StatusPill` is the only thing that colours a status.
- Every fetch goes through `lib/api.ts`. A 409 shows the server message word for word and triggers a refetch.
- `lib/positions.ts` (`usePositions`) is the only place that polls `/trucks`, every 10 s.
- All times, dates and distances go through `lib/format.ts` (Intl).
- The map container is always `dir="ltr"`. A truck with null coordinates is never drawn.
- Use logical properties (`ps-`/`pe-`/`start-`/`end-`/`border-s`) so RTL works.

## Done
**Project setup:** package.json, tsconfig, next.config.ts, postcss, `.env.example`/`.env.local`, `.gitignore`, `public/mockServiceWorker.js`.

**`app/`**
- `layout.tsx`: Google Fonts (Inter and JetBrains Mono), leaflet.css, globals.
- `providers.tsx`: QueryClient; starts MSW; renders on the client only, after mount (this avoids time hydration mismatches); applies `.dark` from the OS theme; shows a `/health` banner if the server is down.
- `page.tsx`: a dev index linking the console, fleet, settings, driver and every tracking demo token.
- `t/[token]/page.tsx`: **customer tracking, complete.** Polls every 30 s and stops once the delivery has ended. Uses the phone layout below 900px and the desktop layout above.

**`lib/`**
- `types.ts`: Delivery, Stop, Truck, Driver, Config, TrackResponse, Proposal.
- `api.ts`: `api`, `post`, `ApiError`, `isConflict`, `isNotFound`.
- `format.ts`: time, date, `formatWhen`, durations, distance, tz abbreviation and offset, `haversineKm`.
- `config.ts`: `useConfig()` with `DEFAULT_CONFIG` (`TODO(config)`) and `staleTime: Infinity`.
- `positions.ts`: `usePositions()`.
- `exceptions.ts`: pure rules for `isStale`, `lateMinutes`, `currentStopIndex` and `deriveExceptions` (silent truck, pending N+ while trucks are free, failed in the window, agent flags).
- `labels.ts`: status labels and fail reasons.
- `useNow.ts`, `useMediaQuery.ts`.

**`components/`**
- `StatusPill.tsx`: 10 statuses and 3 sizes, built to spec.
- `map/`: `DispatchMap` (react-leaflet; `index.tsx` wraps it in `next/dynamic` with `ssr:false`), `TruckMarker` (a divIcon with a 44px hit area that glides over the ping interval with rAF and respects reduced motion), `StopPin`, `RouteLine`/`LinkLine` (colours come from CSS classes), `markers.ts` (marker HTML per spec) and `types.ts`. It also handles the note overlay, zoom controls, legend, fit-to-points by `fitKey`, and the cancelled-state dim (`.dm-dim`, which fades the tile pane).
- `tracking/`: `view.ts` maps the response to 8 view states and builds the view model, including multi-drop privacy and the timezone tag and note. Also `TrackingPhone`, `TrackingDesktop`, `StopTimeline`, `History`, `NoticeBox`.
- `console/`: **complete and wired up** at `/console` (`app/console/page.tsx`, wrapped in `<Suspense>`).
  - `ConsoleView` orchestrates everything:
    - URL state `?d=&t=&f=` (`f` also takes `active`/`attention` from the header counts);
    - queries: `['deliveries']` every 15 s, `usePositions`, and `['proposals']` every 30 s (a 404 counts as empty; only when `agent_enabled`);
    - optimistic assign with rollback, the 409 shown word for word, and a refetch;
    - proposal approve (calls assign), reject (client-side, `TODO(proposals-api)`) and "Show on map";
    - map highlights, enlarged available trucks for a pending delivery, dashed candidate links, and fit per selection;
    - tabs below a 1000px container width (`lib/useElementWidth.ts`).
  - Also: `ConsoleHeader` (counts as filters, rules line from config, Fleet/Settings links, clock in the operator zone) and `DeliveryList` (Ask box, New delivery, chips, sorting, empty, no-match and load-error states; it scrolls the selected row into view).
  - Earlier pieces: `ui.ts`, `ExceptionTable`, `AskBox` (`TODO(agent-api)`), `NewDeliveryForm`, `AssignPanel`, `DeliveryRow`, `TruckList`, `ProposalsPane`.
  - The default pickup for a new delivery is the most common pickup address (the depot), because config has no depot field.
  - Checked in headless Edge against the mocks: wide layout, the 409-then-success assign flow, proposal approve, and narrow tabs.
- `map/DispatchMap`: `Fit` refits when the map goes from 0×0 to visible, so a fit made while its tab was hidden is redone.
- `console/DispatchNav`: the Console · Fleet · Settings nav used by Fleet and Settings. Link colours are inline because the global unlayered `a { color }` rule beats Tailwind utilities; keep that in mind for any styled link.
- `fleet/`: **complete** at `/console/fleet`.
  - `FleetView` has Trucks/Drivers tabs with counts, a searchable sticky-header list, and the "Just added" row pinned and tinted at the top.
  - `AddTruckForm`: plate normalisation gives a local duplicate hint, but the server's 409 decides and is shown word for word. It has a "Starts as" radio, and payload/pallets are sent (`TODO(fleet-api)`).
  - `AddDriverForm`: the phone must be + and country code. Usual truck lists only trucks with no driver. The app-link checkbox defaults on (`TODO(fleet-api)`).
  - `forms.ts` and `FormResult` are shared.
- `settings/SettingsView`: **complete** at `/console/settings`.
  - The draft stays `null` until the first edit, so the form follows the loaded config.
  - Sticky header with the unsaved state and Save/Discard (disabled when clean).
  - Field validation, then `PUT /config` (`put` added to `lib/api.ts`), which writes the result into the `['config']` cache.
  - A map preview of the centre, and the Intl preview including RTL for Arabic.
  - The nav was added to the header; the design had no way back to the console.
- Fleet and Settings were checked in headless Edge: the 409 and success paths for trucks and drivers, phone validation, and settings validate → save → reload.

**`mocks/`:** `data.ts` (seeded in-memory DB plus simulation), `handlers.ts` (all endpoints) and `browser.ts`.
- 32 trucks, about 33 deliveries, 4 pending, 1 failed in the last hour, and silent truck KF-19 (26 min).
- Trucks on delivery move along their legs and report on the ping interval.
- Assigning KF-25 the first time returns a 409, to demo the stale-list path.
- The proposal reassigns KF-19's delivery, and there is one agent "Likely to miss window" flag.
- The driver demo truck is KF-12 on DLV-40718 (5 stops, stop 1 done).
- Tracking tokens are `demo`, `demo-in-transit`, `demo-pending`, `demo-assigned`, `demo-stale`, `demo-completed`, `demo-failed` and `demo-cancelled`, plus `t-<delivery id lowercased>` for every delivery.
- `POST /locations` only moves a truck when the ping is inside the service radius.

**Driver PWA (`/driver`): complete.** Routes: `/driver` (Today, or the empty state), `/driver/stop/[n]`, `stop/[n]/contact`, `stop/[n]/problem` and `/driver/done`.
- `app/driver/layout.tsx` sets the manifest and theme colour; `components/driver/DriverRoot` renders `<div className="driver">` (56px floor) and registers the service worker.
- `DriverProvider` (`useDriver()`):
  - polls `GET /deliveries?truck_id=KF-12` every 15 s, and caches the last answer in localStorage so the app opens offline;
  - shows optimistic statuses from in-flight and queued actions;
  - keeps per-stop progress (arrived/done, quick messages sent, POD name) in localStorage per delivery;
  - GPS `watchPosition` batched to `POST /locations` every `ping_seconds`. While the watch is healthy it repeats the last fix, so a parked truck doesn't go silent;
  - Wake Lock while a delivery is active;
  - gap detection: hidden for more than 2 min shows `PausedNotice` once for that gap; it clears on OK or at the next stop confirmation.
- `lib/offlineQueue.ts`: an IndexedDB queue (memory fallback), read with `useSyncExternalStore`.
  - Flushes in order on enqueue, on `online` and on open.
  - A 4xx/409 drops the item and its message shows word for word in `QueueCard`; a 5xx or network error keeps it and stops the flush.
  - Stop events have no endpoint (`TODO(stops-api)`). They queue so the driver sees "not sent", and leave the queue once there's a connection.
- Components: `HoldToConfirm`, `GpsStrip`, `QueueCard`, `PausedNotice`, `StopList`, `DriverScreen` (strip, body, bottom bar), `useStop`, `ui.ts`.
  - `HoldToConfirm`: 800ms, pointer capture, Space/Enter, 40ms vibrate, 200ms reset, and the "Keep holding until the bar fills" hint.
  - `GpsStrip` states: live, starting, gap, offline (inverted), GPS off.
- Flow: assigned → hold to start (`POST /start`) → per stop, hold to arrive, then hold to complete. The last drop-off asks who received it (name required, photo optional; neither is sent, `TODO(pod-api)`), then `POST /complete` → `/driver/done`.
  - Problem: a radiogroup with arrow keys and the accident note, then `POST /fail {reason}`.
  - Contact: `tel:` and one-tap `sms:` quick messages, each marked "Sent HH:MM".
  - Navigate: `geo:` on Android, Apple Maps on iOS.
- `public/driver-sw.js` (scope `/driver`), `driver.webmanifest` and `driver-icon.svg`.
  - Pages are network-first with a cached fallback; `/_next/static` and fonts are cache-first. API calls are never cached.
  - The page posts its already-loaded asset URLs to the worker, because the first visit loads before the worker controls it.
  - **Not registered in mock mode:** a second worker on `/driver` would take over from MSW's and the mock API would stop answering. Test it with `NEXT_PUBLIC_API_MOCKING=disabled`.
- Checked in headless Edge with emulated GPS and network:
  - the full stop flow with keyboard holds, including the early-release hint;
  - offline queueing (inverted strip, queue card, "not sent" pill);
  - contact SMS, the POD gate, the done summary ("Online · all sent");
  - the problem report reaching the server as `failed customer_unavailable`;
  - a new assignment picked up live, then the start hold;
  - the stationary heartbeat;
  - the worker installing and the app reloading offline.

**Accessibility pass: done.** Every screen was checked at 200% zoom (720×450), or at 320px for the driver app.
- Every page has no horizontal overflow, one h1, all targets ≥44px (≥56px on the driver app) and named controls.
- The keyboard walk used real Tab and Shift+Tab, with focus rings on every stop and nothing focused landing under a sticky header.
- Fixes made:
  - Settings sets the root `scroll-padding-top` from the sticky header's live height, which grows when it wraps.
  - The driver top-row links (Back/Problem/Cancel) got `min-h-14`, because the tokens only enforce 56px on `button` and `a[role=button]`.
  - **Dark-theme map markers:** the tokens' `.dark` block re-colours `--marker-*` for dark surfaces, but tiles stay light, so the pickup pin was 1.03:1. `.dark` now goes on `<body>` (`providers.tsx`); `globals.css` captures the light marker colours as `--map-marker-*` on `:root` and restores them inside `.dm-map`. No values are restated.
    - Raise this with the design-system owner: `--marker-*` arguably shouldn't be in `.dark`.
- Map contrast in both themes: label text 16.9:1, truck 5.2:1, pickup 14.7:1, drop-off 6.1:1, stale 3.6:1.

The type check passes (`npm run typecheck`). **Every step of BUILD.md's build order is done.**

**Visual checks:**
- `--headless --screenshot` with `--virtual-time-budget` renders blank, because the MSW worker never starts under virtual time. Drive Edge over CDP in real time instead.
- Kill the whole process tree afterwards (`taskkill /T /F`); `kill()` on the parent leaves renderer processes behind.
- Next's dev overlay (`NEXTJS-PORTAL`) shows up in focus and overlap audits; ignore it.

## Not done yet
Nothing from BUILD.md. What's left is backend work (the tags below) and checking `lib/types.ts` against the real Go API.

Reference behaviour and copy for each screen is in the matching `Design/design_handoff_dispatch/*.dc.html` file: the markup is the layout and the `class Component` block is the behaviour.

## Backend gaps (search for these TODO tags)
`TODO(config)`, `TODO(stops-api)`, `TODO(pod-api)`, `TODO(fleet-api)`, `TODO(proposals-api)`, `TODO(ws)`, `TODO(agent-api)`.
