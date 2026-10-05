'use client';

import dynamic from 'next/dynamic';

export type * from './types';

/** Leaflet touches `window`, so the map only ever renders in the browser. */
export const DispatchMap = dynamic(() => import('./DispatchMap'), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-[var(--map-land)]" />,
});
