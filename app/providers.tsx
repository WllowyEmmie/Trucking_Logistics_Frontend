'use client';

import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { api } from '@/lib/api';
import { useApplyTheme } from '@/lib/theme';

const MOCKING = process.env.NEXT_PUBLIC_API_MOCKING === 'enabled';

async function startMocks() {
  if (!MOCKING) return;
  const { worker } = await import('@/mocks/browser');
  await worker.start({ onUnhandledRequest: 'bypass', quiet: true });
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
  // Light, dark or the OS's, from the theme switch (lib/theme.ts).
  useApplyTheme();
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
