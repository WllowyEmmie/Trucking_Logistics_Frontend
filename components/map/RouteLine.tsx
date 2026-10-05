'use client';

import { Polyline } from 'react-leaflet';
import type { LatLng, MapLink, MapRoute } from './types';

// Colours come from CSS classes (globals.css) so they follow the tokens.
const pts = (a: LatLng[]) => a.map((p) => [p.lat, p.lng] as [number, number]);
const base = { lineCap: 'round', lineJoin: 'round', interactive: false } as const;

export function RouteLine({ route }: { route: MapRoute }) {
  return (
    <>
      {route.travelled.length > 1 && (
        <>
          <Polyline positions={pts(route.travelled)} pathOptions={{ ...base, weight: 7, className: 'dm-casing' }} />
          <Polyline positions={pts(route.travelled)} pathOptions={{ ...base, weight: 3.5, className: 'dm-travelled' }} />
        </>
      )}
      {route.remaining.length > 1 && (
        <>
          <Polyline positions={pts(route.remaining)} pathOptions={{ ...base, weight: 8, className: 'dm-casing' }} />
          <Polyline positions={pts(route.remaining)} pathOptions={{ ...base, weight: 4.5, className: 'dm-remaining' }} />
        </>
      )}
    </>
  );
}

/** Candidate or assigned link: 2.5px ink, dashed 7/6. */
export function LinkLine({ link }: { link: MapLink }) {
  const p = pts([link.a, link.b]);
  return (
    <>
      <Polyline positions={p} pathOptions={{ ...base, weight: 6, className: 'dm-casing' }} />
      <Polyline positions={p} pathOptions={{ ...base, weight: 2.5, dashArray: '7 6', className: 'dm-link' }} />
    </>
  );
}
