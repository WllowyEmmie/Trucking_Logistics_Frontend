# Handoff: Dispatch — customer tracking, driver app, dispatcher console

## Overview
Truck dispatch and delivery tracking for a 30–50 truck operator. Three surfaces over one Go REST API:
- **Customer tracking** (public, no login). It shows the state of one delivery to whoever has the link, and nothing else.
- **Driver app** (phone PWA mounted in a cab).
- **Dispatcher console** (desktop, one person per shift) with an embedded AI agent: proposals pane, ask box, attention markers.
- **Operator configuration**: the one settings screen allowed.
- **Fleet**: adding trucks and drivers, separate from the console's live truck pane.

`CLAUDE.md` (included) is the engineering contract: stack, API, token rules and non-negotiables. This README describes the designs. Where they conflict, CLAUDE.md wins on engineering and this README wins on UI.

## About the design files
The `.dc.html` files are **design references built in HTML**. They are working prototypes of the intended look and behaviour, not production code. Rebuild them in the target stack: Next.js 15 App Router, TypeScript strict, Tailwind, TanStack Query, and Leaflet via react-leaflet with OSM tiles. Open any `.dc.html` in a browser; they need `support.js`, `map.js` and `dispatch-tokens.css` next to them.

`map.js` is a schematic stand-in for Leaflet. The real build uses react-leaflet (`next/dynamic`, `ssr: false`). Keep the marker designs, not the fake tiles.

## Fidelity
**High fidelity.** Colours, type, spacing, radii, target sizes and copy are final. Build pixel-close using the tokens in `dispatch-tokens.css`, which is `app/globals.css`. Never hardcode a value.

## Design tokens
All tokens are in `dispatch-tokens.css`: light values in `:root`, dark values in `.dark`, and a Tailwind v4 `@theme` block. Key values (light theme):
- Surfaces `#fafaf9 / #f1f1ef / #e6e6e3`; ink `#1a1d24`, ink-muted `#555d6b`, ink-subtle `#757d8a` (18px+ only).
- Border `#8a8a85` (control boundaries, 3:1). Divider `#dededa` (decorative only, fails 3:1).
- Accent `#8a5a00` / accent-bg `#faf1de`. Focus ring `#1f5b99`, 2px, offset 2px.
- Delivery status fg/bg: pending `#555d6b/#f0f1f3`, assigned `#1f5b99/#e7f0f9`, in_transit `#8a5a00/#faf1de`, completed `#1e6b47/#e6f2ec`, cancelled `#4a4a52/#eeeef0`, failed `#a3281e/#fbeae8`.
- Truck statuses alias these: available = completed, on_delivery = transit, maintenance = assigned, offline = pending.
- Markers: truck `#8a5a00`, pickup `#1a1d24`, drop-off `#1f5b99`, stale `#757d8a`.
- Attention `#a3281e/#fbeae8`; agent `#5c3d99/#f1edf9`.
- Spacing 4, 8, 12, 16, 24, 32, 48. Radius 4, 8, 12, 999.
- Targets: 44px minimum, 56px on the driver app (the root carries `.driver`); gap 8px, or 16px where a mis-tap changes state.
- Type: Inter plus JetBrains Mono. Classes `t-display-lg` 40/44/700 … `t-label` 11/14/600 caps. Driver-only: `t-driver-address` 26/32/700, `t-driver-action` 19/24/700, `t-driver-meta` 16/22/500.
- Map tiles use `--map-*` tokens that the dark theme does not override, because tiles stay light. Board annotation uses `--board-canvas` and `--ink-annotation`; neither appears inside a product screen.
- **No shadows.** The only box-shadows in the designs are rings: selection `inset 0 0 0 2px accent`, and the white or dark marker outlines.

## StatusPill (one component, used everywhere)
Props: `status` (10 values) · `size` sm 22px / md 26px / lg 34px · optional `label` override.
- Structure: pill with a 1px border in the status fg, the status bg fill, fg text at weight 600, and a leading dot.
- The dot is **filled** for assigned, in_transit, completed, failed, available and on_delivery. It is **hollow** for pending, cancelled, maintenance and offline.
- Labels: Pending, Assigned, In transit, Completed, Cancelled, Failed, Available, On delivery, Maintenance, Offline.
- Sizes (height / font / padding-inline / dot): sm 22/12/8/8 · md 26/13/10/9 · lg 34/16/14/11.
- See `StatusPill.dc.html`. The label override is used for "Arrived 14:06" style pills in the driver app.

## Map markers
- **Truck.** A 34px circle (22px when de-emphasised) with a white truck icon. Live: filled `--marker-truck`, 2px white border, 1px ink outer ring. Available: white fill with a 3px solid truck-colour ring. Stale: white fill with a 2px dashed `--marker-stale` ring and a grey icon, **always labelled** "KF-19 · 26 min". Selected: `0 0 0 2px #fff, 0 0 0 5px focus-ring`. The hit area is always 44×44.
- **Stop pins.** 30px with a 3px border and a white 2px ring. Pickup is a rounded square (6px radius), drop-off a circle. Done stops are filled with a white number; pending stops are white with a coloured number.
- **Route.** Remaining route is a 4.5px drop-off-blue line on an 8px white casing. The travelled part is a 3.5px stale-grey line. Candidate or assigned link: 2.5px ink, dashed 7/6.
- **Movement.** Animate `left/top` linearly over the ping interval (default 10–15s). The marker trails the latest ping by at most one interval and never teleports. The map container is always `dir="ltr"`.
- **Offline trucks.** `lat/lng/last_seen_at = null`, so they are not rendered. Never draw a truck at 0,0.

## Screens

### Customer tracking — `Customer Tracking.dc.html`
Each state is shown at 375px (phone) and 1440×900 (desktop).
- **Phone layout.** Header 56px (operator name t-h3, ref t-mono-sm, pill md). Map 325px (40% of 812). Body padding 20/16, 24px gap: headline t-display, sub t-body muted, freshness t-body-sm 600, notice, ETA block, stops timeline, collapsible history, Call button (48px, bordered), timezone note.
- **Desktop layout.** The map fills the left side at full height with zoom controls. The right aside is 600px wide and scrolls, with a sticky header (operator t-h2, ref, "Updated … · refreshes on its own"). Body padding 32, max-width 640. Pill lg; headline t-display-lg; ETA at 64/68/700; a facts grid (auto-fit minmax 220px, bordered top and bottom); stops with time right-aligned; history always expanded; contact.
- **States:**
  - **in_transit.** Live truck; route split into travelled and remaining.
  - **pending.** Pins only, with a map note "No truck assigned yet — nothing to track". The ETA block is replaced by the requested window. No spinner.
  - **assigned.** Truck at the depot; ETA as a window.
  - **stale.** A neutral notice ("Truck position is 24 minutes old…"), stale marker, "Last estimate" label.
  - **completed.** "Delivered at" plus the signed-for name; the marker is removed.
  - **failed.** Red notice with the reason, plus a "What happens next" paragraph.
  - **cancelled.** Map dimmed at 62% white; the text says who cancelled and that the link won't update.
  - **not_found.** No brand, no map, no contact.
- **Multi-drop privacy.** Other customers' stops are shown as "Another customer's drop-off" with no address.
- **Timezones.** Times render in the viewer's zone. When that differs from the operator's zone, the ETA gets a "Your time · CEST" tag and the footer explains the offset. Use `Intl.DateTimeFormat`.
- **No account, no sign-in, no delivery creation** on this surface. Deliveries are created by dispatchers in the console.
- **Tweaks.** `dir` (RTL), `dark`, and `longStrings` (pseudo-localises strings to +40% with accents, to test reflow).

### Driver app — `Driver App.dc.html` (390×844 frames)
Every screen has:
- A **top strip** (48px, surface-200): "GPS live · N s ago" with a green dot, and "Online" at the end. Paused, recording and offline variants change the text; offline inverts the strip to ink.
- The **primary action** in a bottom bar: 72–76px, full width, ink fill, `t-driver-action`.
- Secondary actions as 64px buttons with a 2px ink border, 16px apart.

Screens:
1. **Today.** Progress bar in five segments (done ink, current accent, todo surface-300). Done rows are muted with a check. The current row has a 3px accent border on an accent-bg fill, a "Now" label and the address at 20/26/700. Primary action: "Open stop 2".
2. **Current stop.** Back and "Problem" buttons (the latter in failed colour) in a row with space between. Then the address in t-driver-address, "Deliver to", "From dispatch", and Call + Navigate (the Navigate link hands off to the phone's map app). Primary: **press-and-hold**.
   - The hold takes 800ms. A fill grows from the inline-start edge in accent; the label changes to "Keep holding…"; the phone vibrates 40ms on completion.
   - Releasing early resets the fill with a 200ms ease-out and shows the hint "Keep holding until the bar fills".
   - Space or Enter held works the same way. Use pointer capture, `touch-action: none`, and suppress the context menu.
   - Stages: arrived → completed → "Next: stop 3".
3. **Report a problem.** A fixed radiogroup of 64px rows, 8px apart: breakdown, customer_unavailable, goods_damaged, accident, other. "Send report" is disabled (45% opacity) until a reason is picked. Choosing Accident shows an emergency-services note.
4–6. **Confirm candidates.** A: hold. B: slide-to-confirm plus a "Tap to confirm instead" button 16px below it; the tap opens a sheet where "Yes" sits higher than the button that opened it. **Ship A.**
7. **Offline.** Inverted strip reading "Offline · 2 waiting". A queue card lists each action with the time it happened. Actions still work and join the queue.
8. **Tracking paused.** An inline card after unlock: "Location paused for 11 minutes…", with "Keep screen on" (Wake Lock API) and "OK". Not a modal; shown once per gap.
9. **Empty.** "No delivery yet", with Call dispatch as the only action.
10. **Contact client.** Primary: call the client. Four fixed quick-message SMS buttons (64px) that each show "Sent HH:MM" once sent. Below: call site reception and call dispatch.
11. **Proof of delivery.** Receiver name input (64px, 20px text) and an optional photo. The hold is disabled until a name is entered. **This needs an API field on `/complete`.**
12. **Delivery done.** A summary list, and "Navigate to depot" as the primary action.
- **Tweaks.** `dark`, `dir`.

### Dispatcher console — `ConsoleView.dc.html` (component), `Dispatcher Console.dc.html` (board of scenarios)
- **Layout at 1440×900.**
  - Header: a grid with a 360px counts column and the exceptions table filling the rest.
  - Main row: deliveries 400px · map flex (min 280) · trucks 300px · proposals rail 56px collapsed or 340px open.
- **Counts.** Three buttons: Active, Unassigned, Needs attention. They act as filters; the active one gets a 2px ink border.
- **Exception table.** A div grid with columns 150 / 210 / 1fr / 52 / 76 / 88 and 44px rows on an attention-bg tint. Columns: Issue (attention bold), Subject (mono), Detail, Since, Raised by, Action. Raised by shows "Rule" or an **Agent** marker (agent colours, diamond glyph). Rules:
  - truck silent 20+ min;
  - pending 2 h+ while any truck is available;
  - failed in the last hour;
  - agent-raised rows.
- **Deliveries pane.**
  - Ask box first.
  - Inline answer card (agent-bg with agent border). Each row selects its delivery; there's a dismiss button. Not a chat.
  - "Deliveries · N" with a **New delivery** button. It opens an inline form (2px ink border, max-height 520 with scrolling): customer, phone, pickup, drop-offs (add/remove), goods, then "Create as pending" and Cancel, 16px apart. On create, the delivery is inserted as pending, selected and expanded.
  - Filter chips: 44px pill buttons, active = ink fill.
  - Delivery rows: ref in mono, customer t-h3, pill sm; a second line of meta; a late/attention flag in attention colour. A 44px chevron button expands the row in place:
    - an **assign panel** (pending only): up to 5 available trucks by straight-line distance to the pickup. Hover or focus highlights the truck and draws a dashed line on the map. The Assign buttons are 44px with 20px+ between them;
    - a **409 alert**: show the server message word for word in mono, then refresh the list;
    - a success note;
    - **stops**: 22px numbered dots joined by a 2px line; filled ink = done, hollow = pending, 3px accent = current;
    - **events**: mono time plus text, newest first.
- **Map.** A selected delivery lights its stops, route and truck. When a pending delivery is selected, every available truck is enlarged. Markers not in focus drop to 22px with no label. A legend sits bottom-start.
- **Trucks pane.** Chips, then rows sorted stale first. Selecting a truck filters the delivery list and shows a "Truck KF-07 ×" chip. Second line: "DLV-… · ping N s ago", "No position for 26 min" (bold, dashed dot), "In workshop until…", or "No position reported today".
- **Proposals.**
  - Collapsed: a 56px rail with a count badge and a vertical "Agent proposals" label.
  - Open, empty state: "Nothing to review…" plus the last-check time.
  - Proposal card: what it would do, why, "What changes" as before → after rows, "Show on map", and Approve / Reject 16px apart. Approve applies the change and posts a note.
  - `GET /proposals` doesn't exist yet; treat a 404 as empty.
- **200% zoom (720px CSS).** The header stacks, exceptions become stacked rows, and the panes become tabs (Deliveries, Map, Trucks, Proposals). No clipping. Switch with a container or media query at about 1000px.
- **Props.** `scenario`, `height`, `narrow`, `dark`, `dir`.

### Fleet — `Fleet.dc.html`
A separate dispatch screen for adding trucks and drivers. The console's truck pane is live operations only and has no add or edit. Fleet is linked from the console header next to Settings.
- **Header.** Dispatch nav (Console · Fleet · Settings, 44px links in Inter 600 14px; the current page has an ink fill) and Trucks / Drivers tabs as pill buttons with counts.
- **Layout.** A searchable list (spans two grid columns, sticky column headers, 52px rows, max-height 720 scroll) with the add form beside it in a 2px ink-bordered card. Grid uses auto-fit minmax(min(100%,440px),1fr), so it stacks when narrow. Not a modal.
- **Trucks list.** Plate (mono), model, capacity ("5,500 kg · 10 pallets", or "Capacity not set" muted), status pill sm, usual driver.
- **Add a truck.** Plate number (required, maps to `POST /trucks` `plate_number`). Duplicates are checked with spaces, hyphens and dots ignored, so "kf 03" matches KF-03. A 409 shows the server message word for word in mono. Optional fields: make and model, payload, pallet spaces. "Starts as": Available or In maintenance. Success shows a note and the new row at the top, tinted completed-bg with a "Just added" label.
- **Drivers list.** Name, phone (mono), usual truck, app state: "Signed in today" (completed), "Link sent" (assigned) or "Not signed in yet" (muted).
- **Add a driver.** Full name and mobile phone are required (`POST /drivers`). The phone must start with + and a country code; a duplicate number gives a 409. Optional usual truck: the select lists only trucks with no usual driver. "Text the driver a link to the app" is on by default and replaces any password.
- **Backend gaps.** Payload and pallet spaces need two new fields on `/trucks`. Usual truck needs a driver–truck link. The app-link SMS needs an endpoint. The mass unit should come from `GET /config`.
- **Tweaks.** `tab`, `dark`, `dir`.

### Operator configuration — `Operator Settings.dc.html`
- **Sticky header.** Unsaved-changes status, then Discard and Save (disabled at 45% when there are no changes).
- **Sections:**
  - Organisation: name, support phone.
  - Region: locale select, operator timezone select, km/mi toggle.
  - Map: centre lat/lng, service radius, and a map preview.
  - Tracking and exceptions: stale threshold, pending threshold, failed window, ping interval.
  - Agent on/off.
- **Live preview.** Renders a sample ETA, distance and date through `Intl.DateTimeFormat` and `Intl.NumberFormat` (unit style) for the chosen locale and zone. It switches to RTL for Arabic.
- **Backend.** This is the screen for the missing `GET /config`; it also needs a `PUT /config`.

### Reference sheet — `Delivery States Reference.dc.html`
A printable landscape table: what each delivery and truck state looks like on each surface.

## Interaction and state notes
- **One error type.** 409 is a state conflict, not a failure: show the message as-is and refresh the relevant data.
- **Position feed.** Put it behind one hook: poll `GET /trucks` every 10s now, swap to a socket later.
- **Stale.** `now - last_seen_at >= config.stale_minutes`.
- **Late.** 10+ minutes past the stop's promised time.
- **Driver offline queue.** Persist to IndexedDB. Show the queue depth in the strip and list items with their original timestamps. Flush in order on reconnect.
- **Focus.** 2px `--focus-ring` outline with 2px offset. Scroll containers need `scroll-padding-top` so sticky headers never hide the focused element.
- **Addresses.** Never truncated. Wrap with `overflow-wrap: anywhere`.

## Assets
- Icons are Lucide (truck, phone, navigation, arrow-left, chevron-down, triangle-alert, wifi-off, x, check), stroke 2.25–2.75, inlined as SVG. Use `lucide-react`.
- No images.
- Fonts: Inter and JetBrains Mono from Google Fonts.

## Files
- `dispatch-tokens.css`: tokens (= `app/globals.css`)
- `StatusPill.dc.html`
- `map.js`: marker and route spec (a stand-in for Leaflet)
- `Customer Tracking.dc.html`, `Driver App.dc.html`, `ConsoleView.dc.html`, `Dispatcher Console.dc.html`, `Operator Settings.dc.html`, `Fleet.dc.html`, `Dispatch Tokens.dc.html`, `Delivery States Reference.dc.html`
- `support.js`, `doc-page.js`: prototype runtime only, not for production
- `CLAUDE.md`: engineering contract

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
