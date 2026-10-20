'use client';

import L from 'leaflet';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import { LinkLine, RouteLine } from './RouteLine';
import { StopPin } from './StopPin';
import { TruckMarker } from './TruckMarker';
import type { DispatchMapProps, LatLng } from './types';

const overlayBox = 'absolute z-[1000] rounded-md border border-border bg-[var(--map-label-bg)] text-[var(--map-ink)]';

function Fit({ fitKey, points }: { fitKey?: string; points?: LatLng[] }) {
  const map = useMap();
  const pointsRef = useRef(points);
  pointsRef.current = points;
  useEffect(() => {
    if (!fitKey) return;
    const fit = () => {
      const p = pointsRef.current;
      if (!p?.length) return;
      if (p.length === 1) map.setView([p[0]!.lat, p[0]!.lng], Math.max(map.getZoom(), 12));
      else map.fitBounds(L.latLngBounds(p.map((x) => [x.lat, x.lng] as [number, number])), { padding: [56, 56], maxZoom: 14 });
    };
    fit();
    // A fit made while hidden (a tab at 0×0) is meaningless: redo it once the map has a size.
    const onResize = (e: L.ResizeEvent) => {
      if (e.oldSize.x === 0 || e.oldSize.y === 0) fit();
    };
    map.on('resize', onResize);
    return () => {
      map.off('resize', onResize);
    };
  }, [fitKey, map]);
  return null;
}

/**
 * MapContainer reads `center` and `zoom` once. The console first renders with the defaults (0, 0)
 * and gets the operator's centre from GET /config a moment later, so follow later changes too, as
 * long as there are no points to fit (those decide the view instead).
 */
function Recenter({ center, zoom, hasFit }: { center: LatLng; zoom?: number; hasFit: boolean }) {
  const map = useMap();
  const first = useRef(true);
  const hasFitRef = useRef(hasFit);
  hasFitRef.current = hasFit;
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (!hasFitRef.current) map.setView([center.lat, center.lng], zoom ?? map.getZoom());
  }, [center.lat, center.lng, zoom, map]);
  return null;
}

/** Leaflet measures once; panes that were hidden (tabs) need a re-measure when shown. */
function AutoResize({ el }: { el: HTMLElement | null }) {
  const map = useMap();
  useEffect(() => {
    if (!el) return;
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(el);
    return () => ro.disconnect();
  }, [el, map]);
  return null;
}

function LegendItem({ swatch, children }: { swatch: ReactNode; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {swatch}
      {children}
    </span>
  );
}

const dot = (bg: string, border: string) => (
  <span aria-hidden="true" style={{ width: 14, height: 14, borderRadius: 999, background: bg, border, boxSizing: 'border-box' }} />
);

export default function DispatchMap(p: DispatchMapProps) {
  const [map, setMap] = useState<L.Map | null>(null);
  const [wrap, setWrap] = useState<HTMLDivElement | null>(null);

  return (
    // The map container is always LTR, whatever the page direction.
    <div ref={setWrap} dir="ltr" className={`dm-map relative isolate h-full w-full overflow-hidden ${p.dim ? 'dm-dim' : ''}`}>
      <MapContainer
        ref={setMap}
        center={[p.center.lat, p.center.lng]}
        zoom={p.zoom ?? 11}
        zoomControl={false}
        scrollWheelZoom
        className="h-full w-full"
        aria-label={p.ariaLabel ?? 'Map'}
      >
        <TileLayer
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          maxZoom={19}
        />
        {p.route && <RouteLine route={p.route} />}
        {p.links?.map((l, i) => <LinkLine key={i} link={l} />)}
        {p.stops?.map((s) => <StopPin key={s.id} stop={s} />)}
        {p.trucks?.map((t) => <TruckMarker key={t.id} truck={t} seconds={p.animateSeconds} onClick={p.onTruck} />)}
        <Fit fitKey={p.fitKey} points={p.fitPoints} />
        <Recenter center={p.center} zoom={p.zoom} hasFit={!!p.fitPoints?.length} />
        <AutoResize el={wrap} />
      </MapContainer>

      {p.alert && (
        <div
          role="status"
          className={`${overlayBox} start-3 end-3 top-3 max-w-max px-3 py-2 text-[14px] leading-5 font-semibold`}
          style={{ borderColor: 'var(--attention)', borderWidth: 2 }}
        >
          {p.alert}
        </div>
      )}
      {p.note && (
        <div
          role="status"
          className={`${overlayBox} start-3 end-3 max-w-max px-3 py-2 text-[14px] leading-5 font-semibold`}
          style={{ top: p.alert ? 60 : 12 }}
        >
          {p.note}
        </div>
      )}

      {p.controls && map && (
        <div className="absolute end-3 top-3 z-[1000] flex flex-col gap-2" style={{ top: 12 + 48 * (Number(!!p.note) + Number(!!p.alert)) }}>
          {(
            [
              ['+', 'Zoom in', () => map.zoomIn()],
              ['−', 'Zoom out', () => map.zoomOut()],
            ] as const
          ).map(([s, label, fn]) => (
            <button
              key={s}
              type="button"
              aria-label={label}
              onClick={fn}
              className="h-11 w-11 rounded-md border border-border bg-[var(--map-label-bg)] text-[20px] leading-none font-semibold text-[var(--map-ink)]"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {p.legend && (
        <div
          className={`${overlayBox} start-3 bottom-3 flex max-w-[calc(100%-24px)] flex-wrap gap-x-3.5 gap-y-1.5 px-3 py-2 text-[12px] leading-4 font-medium`}
          style={{ bottom: 24 }}
        >
          <LegendItem swatch={dot('var(--marker-truck)', '2px solid var(--map-label-bg)')}>Moving</LegendItem>
          <LegendItem swatch={dot('var(--map-label-bg)', '3px solid var(--marker-truck)')}>Available</LegendItem>
          <LegendItem swatch={dot('var(--map-label-bg)', '2px dashed var(--marker-stale)')}>Silent {p.staleMinutes ?? 20}+ min</LegendItem>
          <LegendItem swatch={<span aria-hidden="true" style={{ width: 14, height: 14, borderRadius: 3, background: 'var(--marker-pickup)' }} />}>
            Pickup
          </LegendItem>
          <LegendItem swatch={dot('var(--marker-dropoff)', 'none')}>Drop-off</LegendItem>
        </div>
      )}
    </div>
  );
}
