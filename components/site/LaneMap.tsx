'use client';

import L from 'leaflet';
import { Fragment, useEffect } from 'react';
import { CircleMarker, MapContainer, Marker, Polyline, TileLayer, useMap } from 'react-leaflet';
import { LANE_COLOR, type Lane } from '@/lib/landing';

/** The home page's dispatch board map: each lane's route, done part in its status colour. */

function at(r: [number, number][], p: number): [number, number] {
  const n = r.length;
  const t = p * (n - 1);
  const i = Math.min(Math.floor(t), n - 2);
  const f = t - i;
  return [r[i]![0] + (r[i + 1]![0] - r[i]![0]) * f, r[i]![1] + (r[i + 1]![1] - r[i]![1]) * f];
}

const truckIcon = (c: string) =>
  L.divIcon({
    className: 'lh-ic',
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    html: `<div style="width:26px;height:26px;border-radius:50%;background:${c};border:2.5px solid #fff;box-shadow:0 3px 8px rgba(0,0,0,.25);display:grid;place-items:center"><svg width="12" height="12" viewBox="0 0 24 24" fill="#fff"><path d="M2 6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v10H2z"/><path d="M14 8h3.5l3.5 4.2V16h-7z"/><circle cx="7" cy="17.5" r="2"/><circle cx="17" cy="17.5" r="2"/></svg></div>`,
  });

function Fit({ lanes }: { lanes: Lane[] }) {
  const map = useMap();
  useEffect(() => {
    const all = lanes.flatMap((l) => l.route);
    map.invalidateSize();
    map.fitBounds(L.latLngBounds(all), { padding: [30, 30], maxZoom: 7 });
  }, [lanes, map]);
  return null;
}

export default function LaneMap({ lanes }: { lanes: Lane[] }) {
  return (
    <MapContainer center={[39, -95]} zoom={4} zoomControl={false} scrollWheelZoom={false} attributionControl className="h-full w-full" style={{ background: '#EDEDEA' }}>
      <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}" attribution="© Esri" maxZoom={16} />
      {lanes.map((l) => {
        const c = LANE_COLOR[l.status];
        const pos = at(l.route, l.p);
        const n = l.route.length;
        const i = Math.min(Math.floor(l.p * (n - 1)), n - 2);
        return (
          <Fragment key={l.name}>
            <Polyline positions={[...l.route.slice(0, i + 1), pos]} pathOptions={{ color: c, weight: 3.5 }} />
            <Polyline positions={[pos, ...l.route.slice(i + 1)]} pathOptions={{ color: '#151515', weight: 2, dashArray: '4 6' }} />
            <CircleMarker center={l.route[0]!} radius={4} pathOptions={{ color: '#151515', weight: 2, fillColor: '#fff', fillOpacity: 1 }} />
            <CircleMarker center={l.route[n - 1]!} radius={4} pathOptions={{ color: '#151515', weight: 2, fillColor: '#151515', fillOpacity: 1 }} />
            <Marker position={pos} icon={truckIcon(c)} />
          </Fragment>
        );
      })}
      <Fit lanes={lanes} />
    </MapContainer>
  );
}
