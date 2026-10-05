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
