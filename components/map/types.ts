// Kept apart from the Leaflet code so screens can import these without loading Leaflet.

import type { Map as LeafletMap } from 'leaflet';
import type { ReactNode } from 'react';

export interface LatLng {
  lat: number;
  lng: number;
}

export interface MapTruck extends LatLng {
  id: string;
  /** live = moving, filled · idle = available, ringed · stale = silent, dashed grey. */
  state: 'live' | 'idle' | 'stale';
  size: 'md' | 'sm';
  selected?: boolean;
  /** Stale trucks are always labelled, e.g. "KF-19 · 26 min". */
  label?: string | null;
  aria: string;
}

export interface MapStop extends LatLng {
  id: string;
  n: number;
  kind: 'pickup' | 'dropoff';
  done: boolean;
  small?: boolean;
  label?: string | null;
  /** Shown in the console's callouts at the first and last stop. */
  address?: string | null;
}

export interface MapRoute {
  travelled: LatLng[];
  remaining: LatLng[];
}

export interface MapLink {
  a: LatLng;
  b: LatLng;
}

export interface DispatchMapProps {
  /** 'console': the console design's markers, route and callouts (ConsoleLayers). */
  variant?: 'default' | 'console';
  tiles?: 'street' | 'satellite' | 'dark';
  /** Console variant: draw for a dark page. */
  dark?: boolean;
  /** Console variant: the route and selection colour. */
  accent?: string;
  /** Console variant: address callouts at the first and last stop. */
  callouts?: boolean;
  /** Room the fit leaves for the floating card: top-left and bottom-right, in px. */
  fitPadding?: { tl: [number, number]; br: [number, number] };
  /** The Leaflet map once it exists, for the page's own controls (zoom, recentre). */
  onMap?: (map: LeafletMap) => void;
  /** Drawn over the map (the console's floating card and panels). */
  children?: ReactNode;
  center: LatLng;
  zoom?: number;
  trucks?: MapTruck[];
  stops?: MapStop[];
  route?: MapRoute | null;
  links?: MapLink[];
  note?: string | null;
  /** Above the note, in the attention colour: e.g. positions aren't live. */
  alert?: string | null;
  dim?: boolean;
  controls?: boolean;
  legend?: boolean;
  /** For the legend: config.stale_minutes. */
  staleMinutes?: number;
  /** Seconds a marker takes to glide to its new position: the ping interval. */
  animateSeconds: number;
  onTruck?: (id: string) => void;
  /** When this changes the map fits `fitPoints`. */
  fitKey?: string;
  fitPoints?: LatLng[];
  ariaLabel?: string;
}
