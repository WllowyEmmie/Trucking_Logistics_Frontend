'use client';

import { haversineKm } from '@/lib/format';
import { useDriver } from './DriverProvider';

/** "You've been given KF-03": once, when dispatch or auto mode gives this driver a truck. */
export function GivenTruck() {
  const { givenTruck: t, dismissGiven, config } = useDriver();
  if (!t) return null;
  const atDepot =
    config.depot && t.lat != null && t.lng != null && haversineKm({ lat: t.lat, lng: t.lng }, config.depot) <= 0.3;
  return (
    <div role="status" className="flex items-center justify-between gap-3 rounded-lg border-2 border-ink px-4 py-3">
      <div className="flex min-w-0 flex-col gap-1">
        <span className="t-driver-action">You&apos;ve been given {t.plate_number}</span>
        <span className="t-driver-meta text-ink-muted">
          {atDepot ? `It's parked at the depot, ${config.depot!.address}.` : 'Your deliveries on it show here.'}
        </span>
      </div>
      <button
        type="button"
        onClick={dismissGiven}
        className="t-driver-meta min-h-14 flex-none rounded-lg border-2 border-border bg-surface-100 px-3.5 font-bold text-ink"
      >
        OK
      </button>
    </div>
  );
}
