// Marker designs from the handoff (map.js), rendered as L.divIcon HTML.
import L from 'leaflet';
import type { MapStop, MapTruck } from './types';

const truckSvg = (color: string, size: number) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" style="stroke:${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/></svg>`;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const CHIP =
  'position:absolute;left:50%;transform:translateX(-50%);background:var(--map-label-bg);color:var(--map-ink);border:1px solid var(--map-ink);border-radius:4px;padding:2px 6px;font:600 12px/16px var(--font-mono);white-space:nowrap;pointer-events:none';

export function truckIconKey(t: MapTruck): string {
  return [t.state, t.size, t.selected ? 1 : 0, t.label ?? ''].join('|');
}

export function truckIcon(t: MapTruck): L.DivIcon {
  const stale = t.state === 'stale';
  const idle = t.state === 'idle';
  const sz = t.size === 'sm' ? 22 : 34;
  const c = stale ? 'var(--marker-stale)' : 'var(--marker-truck)';
  const hollow = stale || idle;
  const border = stale ? `2px dashed ${c}` : idle ? `3px solid ${c}` : '2px solid var(--map-label-bg)';
  const ring = t.selected
    ? '0 0 0 2px var(--map-label-bg), 0 0 0 5px var(--focus-ring)'
    : hollow
      ? '0 0 0 2px var(--map-label-bg)'
      : '0 0 0 1px var(--map-ink)';
  const vis = `<span style="width:${sz}px;height:${sz}px;border-radius:999px;background:${hollow ? 'var(--map-label-bg)' : c};border:${border};box-shadow:${ring};display:flex;align-items:center;justify-content:center;box-sizing:border-box;flex:none">${truckSvg(hollow ? c : 'var(--map-label-bg)', Math.round(sz * 0.55))}</span>`;
  const label = t.label
    ? `<span style="${CHIP};top:${22 + sz / 2 + 4}px;${stale ? 'color:var(--map-ink-muted);border-style:dashed' : ''}">${esc(t.label)}</span>`
    : '';
  return L.divIcon({
    className: 'dm-icon',
    // The hit area is always 44×44.
    html: `<span style="position:relative;width:44px;height:44px;display:flex;align-items:center;justify-content:center">${vis}${label}</span>`,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
  });
}

export function stopIconKey(s: MapStop): string {
  return [s.kind, s.n, s.done ? 1 : 0, s.small ? 1 : 0, s.label ?? ''].join('|');
}

export function stopIcon(s: MapStop): L.DivIcon {
  const col = s.kind === 'pickup' ? 'var(--marker-pickup)' : 'var(--marker-dropoff)';
  const sz = s.small ? 22 : 30;
  const pin = `<span style="width:${sz}px;height:${sz}px;border-radius:${s.kind === 'pickup' ? 6 : 999}px;background:${s.done ? col : 'var(--map-label-bg)'};border:3px solid ${col};color:${s.done ? 'var(--map-label-bg)' : col};box-shadow:0 0 0 2px var(--map-label-bg);display:flex;align-items:center;justify-content:center;font:700 13px/1 var(--font-sans);box-sizing:border-box">${s.n}</span>`;
  const label = s.label ? `<span style="${CHIP};top:${sz + 6}px">${esc(s.label)}</span>` : '';
  return L.divIcon({
    className: 'dm-icon',
    html: `<span style="position:relative;display:block;width:${sz}px;height:${sz}px">${pin}${label}</span>`,
    iconSize: [sz, sz],
    iconAnchor: [sz / 2, sz / 2],
  });
}

// ---- The console design's markers (variant 'console'). Explicit colours: they sit on the map's
// own tiles (street, satellite or dark), not on a system surface. ----

const glyph = (fill: string, size = 16) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${fill}" aria-hidden="true"><path d="M2 6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v10H2z"/><path d="M14 8h3.5l3.5 4.2V16h-7z"/><circle cx="7" cy="17.5" r="2"/><circle cx="17" cy="17.5" r="2"/></svg>`;

export function consoleTruckKey(t: MapTruck, dark: boolean, accent: string): string {
  return [truckIconKey(t), dark ? 1 : 0, accent].join('|');
}

/** Selected: a pulsing disc in the accent. Others: a dark pin with a dot under it (moving), a
 *  white pin (free), a dashed grey one (silent). */
export function consoleTruckIcon(t: MapTruck, dark: boolean, accent: string): L.DivIcon {
  const ink = dark ? '#F2F2EF' : '#151515';
  const paper = dark ? '#151515' : '#ffffff';
  const label = t.label ? `<span style="position:absolute;top:44px;left:50%;transform:translateX(-50%);background:var(--surface-100);color:var(--ink);border:1px solid var(--divider);box-shadow:var(--shadow-card);border-radius:8px;padding:2px 7px;font:500 11.5px/16px var(--font-mono);white-space:nowrap;pointer-events:none">${esc(t.label)}</span>` : '';
  if (t.selected) {
    const fg = accent === '#FFCF33' || accent.toLowerCase() === '#ffcf33' ? '#151515' : '#ffffff';
    return L.divIcon({
      className: 'dm-icon',
      iconSize: [52, 52],
      iconAnchor: [26, 26],
      html: `<div style="position:relative;width:52px;height:52px;display:grid;place-items:center"><i class="dm-pulse" style="position:absolute;inset:0;border-radius:50%;background:${accent}"></i><div style="position:relative;width:40px;height:40px;border-radius:50%;background:${accent};border:3px solid #fff;box-shadow:0 6px 16px rgba(0,0,0,.25);display:grid;place-items:center">${glyph(fg)}</div>${label}</div>`,
    });
  }
  const stale = t.state === 'stale';
  const idle = t.state === 'idle';
  const bg = stale ? paper : idle ? paper : ink;
  const fg = stale ? '#8E8E8A' : idle ? ink : paper;
  const border = stale ? '2px dashed #8E8E8A' : idle ? `2px solid ${ink}` : `2px solid ${ink}`;
  const sz = t.size === 'sm' ? 26 : 30;
  return L.divIcon({
    className: 'dm-icon',
    iconSize: [44, 44],
    iconAnchor: [22, 30],
    html: `<div style="position:relative;width:44px;height:44px;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:3px;padding-bottom:6px"><div style="width:${sz}px;height:${sz}px;border-radius:50%;background:${bg};border:${border};box-sizing:border-box;display:grid;place-items:center;box-shadow:0 3px 8px rgba(0,0,0,.25)">${glyph(fg, sz > 26 ? 15 : 13)}</div><i style="width:5px;height:5px;border-radius:50%;background:${stale ? '#8E8E8A' : ink}"></i>${label}</div>`,
  });
}

/** Route ends: a dot (pickup in the accent, the last drop-off in ink); stops between: a number. */
export function consoleStopIcon(s: MapStop, end: 'first' | 'last' | null, dark: boolean, accent: string): L.DivIcon {
  const ink = dark ? '#F2F2EF' : '#151515';
  if (end) {
    const c = end === 'first' ? accent : ink;
    return L.divIcon({ className: 'dm-icon', iconSize: [14, 14], iconAnchor: [7, 7], html: `<i style="display:block;width:14px;height:14px;border-radius:50%;background:${c};border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.3);box-sizing:border-box"></i>` });
  }
  return L.divIcon({
    className: 'dm-icon',
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    html: `<span style="display:grid;place-items:center;width:22px;height:22px;border-radius:50%;background:${s.done ? ink : '#fff'};color:${s.done ? (dark ? '#151515' : '#fff') : '#151515'};border:2px solid ${ink};box-sizing:border-box;font:600 11px/1 var(--font-sans);box-shadow:0 2px 6px rgba(0,0,0,.2)">${s.n}</span>`,
  });
}

/** The address card beside the first pickup (arrow up) and the last drop-off (arrow down). */
export function calloutIcon(address: string, up: boolean): L.DivIcon {
  const arrow = up ? '<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>' : '<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>';
  const parts = address.split(',');
  const line1 = esc(parts[0] ?? address);
  const line2 = esc(parts.slice(1, 3).join(',').trim());
  return L.divIcon({
    className: 'dm-icon',
    iconSize: [0, 0],
    iconAnchor: [-14, 58],
    html: `<div style="display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:12px;background:var(--surface-100);color:var(--ink);box-shadow:var(--shadow-card);border:1px solid var(--divider);white-space:nowrap;font:400 11.5px/1.35 var(--font-sans);max-width:260px"><span style="flex:none;width:26px;height:26px;border-radius:50%;background:var(--surface-200);border:1px solid var(--border);display:grid;place-items:center"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${arrow}</svg></span><span style="overflow:hidden;text-overflow:ellipsis">${line1}${line2 ? `,<br>${line2}` : ''}</span></div>`,
  });
}
