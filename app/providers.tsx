'use client';

import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { api } from '@/lib/api';

const MOCKING = process.env.NEXT_PUBLIC_API_MOCKING === 'enabled';

async function startMocks() {
  if (!MOCKING) return;
  const { worker } = await import('@/mocks/browser');
  await worker.start({ onUnhandledRequest: 'bypass', quiet: true });
}

/**
 * Follows the OS theme: tokens switch on `.dark`; map tiles stay light either way.
 * `.dark` goes on <body>, not <html>, so `:root` keeps the light values: globals.css captures the
 * light marker colours there for the map, which must not go dark.
 */
function useSystemTheme() {
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      document.body.classList.toggle('dark', mq.matches);
      document.documentElement.style.colorScheme = mq.matches ? 'dark' : 'light';
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);
}

function HealthBanner() {
  const { isError } = useQuery({ queryKey: ['health'], queryFn: () => api('/health'), retry: 1, staleTime: Infinity });
  if (!isError) return null;
  return (
    <div role="alert" className="t-body-sm border-b border-status-failed bg-status-failed-bg px-4 py-2 font-semibold text-ink">
      The dispatch server isn&apos;t responding. What you see may be out of date.
    </div>
  );
}

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { refetchOnWindowFocus: true, retry: 1 } },
      }),
  );
  // Everything here is live data and local time, so render on the client only:
  // no server/client time mismatch, and the mock worker is up before the first fetch.
  const [ready, setReady] = useState(false);
  useSystemTheme();
  useEffect(() => {
    startMocks()
      .catch((e) => console.error('Mock API failed to start', e))
      .finally(() => setReady(true));
  }, []);

  return (
    <QueryClientProvider client={client}>
      {ready && (
        <>
          <HealthBanner />
          {children}
        </>
      )}
    </QueryClientProvider>
  );
}
