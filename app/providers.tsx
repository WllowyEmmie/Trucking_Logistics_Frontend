'use client';

import { ConfirmHost } from '@/components/Confirm';

import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { api, setUnauthorizedHandler } from '@/lib/api';
import { ME_KEY } from '@/lib/auth';
import { useApplyTheme } from '@/lib/theme';

const MOCKING = process.env.NEXT_PUBLIC_API_MOCKING === 'enabled';

async function startMocks() {
  if (!MOCKING) return;
  const { worker } = await import('@/mocks/browser');
  await worker.start({ onUnhandledRequest: 'bypass', quiet: true });
}

function HealthBanner() {
  // Checked every 30 s, so the banner appears when the server goes down mid-shift and clears when it's back.
  const { isError } = useQuery({ queryKey: ['health'], queryFn: () => api('/health'), retry: 1, refetchInterval: 30_000 });
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
  // A 401 from any call means the session ended (expired, signed out elsewhere, PIN reset):
  // forget who was signed in, and the page's gate shows the sign-in form.
  useEffect(() => {
    setUnauthorizedHandler(() => client.setQueryData(ME_KEY, null));
    return () => setUnauthorizedHandler(null);
  }, [client]);
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
          <ConfirmHost />
        </>
      )}
    </QueryClientProvider>
  );
}
