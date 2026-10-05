'use client';

import { useMemo } from 'react';
import { Marker } from 'react-leaflet';
import { stopIcon, stopIconKey } from './markers';
import type { MapStop } from './types';

export function StopPin({ stop }: { stop: MapStop }) {
  const key = stopIconKey(stop);
  const icon = useMemo(() => stopIcon(stop), [key]);
  const title = `${stop.kind === 'pickup' ? 'Pickup' : 'Drop-off'}, stop ${stop.n}${stop.done ? ', done' : ''}`;
  return <Marker position={[stop.lat, stop.lng]} icon={icon} title={title} interactive={false} keyboard={false} zIndexOffset={200} />;
}
