'use client';

import { useEffect, type ReactNode } from 'react';
import { DriverGate } from '@/components/auth/Gate';
import { DriverProvider } from './DriverProvider';

const MOCKING = process.env.NEXT_PUBLIC_API_MOCKING === 'enabled';

/** `.driver` raises the target floor to 56px. Registers the app-shell service worker. */
export function DriverRoot({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    // In mock mode MSW's worker must control the page; a second worker on /driver would take
    // over and the mock API would stop answering. So the app shell is only cached against a real API.
    if (MOCKING) return;
    navigator.serviceWorker
      .register('/driver-sw.js', { scope: '/driver' })
      .then(() => navigator.serviceWorker.ready)
      .then((reg) => {
        // Hand over the build assets this page already loaded, so the next open works offline.
        const urls = performance.getEntriesByType('resource').map((r) => r.name);
        reg.active?.postMessage({ type: 'cache-urls', urls });
      })
      .catch((e) => console.error('Driver service worker failed', e));
  }, []);

  return (
    <div className="driver min-h-dvh bg-surface-200">
      {/* Phone number and PIN first; the app opens offline for the last driver signed in. */}
      <DriverGate>
        <DriverProvider>{children}</DriverProvider>
      </DriverGate>
    </div>
  );
}
