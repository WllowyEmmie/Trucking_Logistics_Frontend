'use client';

import L from 'leaflet';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Marker } from 'react-leaflet';
import { truckIcon, truckIconKey } from './markers';
import type { MapTruck } from './types';

/**
 * Glides from wherever the marker is now to the latest ping over one ping interval.
 * It trails the latest ping by at most one interval and never jumps.
 */
export function TruckMarker({
  truck,
  seconds,
  onClick,
  makeIcon,
  iconKey,
}: {
  truck: MapTruck;
  seconds: number;
  onClick?: (id: string) => void;
  /** Another look (the console design's pins); `iconKey` says when to rebuild it. */
  makeIcon?: (t: MapTruck) => L.DivIcon;
  iconKey?: string;
}) {
  const ref = useRef<L.Marker | null>(null);
  // Leaflet owns the position after mount; the prop is only the starting point.
  const [initial] = useState<[number, number]>(() => [truck.lat, truck.lng]);
  const key = iconKey ?? truckIconKey(truck);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const icon = useMemo(() => (makeIcon ?? truckIcon)(truck), [key]);

  useEffect(() => {
    const m = ref.current;
    if (!m) return;
    const from = m.getLatLng();
    const to = L.latLng(truck.lat, truck.lng);
    if (from.equals(to)) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || seconds <= 0) {
      m.setLatLng(to);
      return;
    }
    const dur = seconds * 1000;
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const f = Math.min(1, (now - t0) / dur);
      m.setLatLng([from.lat + (to.lat - from.lat) * f, from.lng + (to.lng - from.lng) * f]);
      if (f < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    // A newer ping cancels this glide where it is and starts the next one from there.
    return () => cancelAnimationFrame(raf);
  }, [truck.lat, truck.lng, seconds]);

  useEffect(() => {
    const el = ref.current?.getElement();
    if (!el) return;
    el.setAttribute('aria-label', truck.aria);
    if (!onClick) el.setAttribute('aria-hidden', 'true');
  }, [icon, truck.aria, onClick]);

  return (
    <Marker
      ref={ref}
      position={initial}
      icon={icon}
      title={truck.aria}
      keyboard={!!onClick}
      interactive={!!onClick}
      zIndexOffset={truck.selected ? 900 : truck.size === 'sm' ? 0 : 400}
      eventHandlers={onClick ? { click: () => onClick(truck.id) } : undefined}
    />
  );
}
