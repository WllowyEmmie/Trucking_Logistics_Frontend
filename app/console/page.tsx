import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ConsoleView } from '@/components/console/ConsoleView';

export const metadata: Metadata = { title: 'Dispatch console' };

// useSearchParams (selection lives in the URL) needs a Suspense boundary.
export default function ConsolePage() {
  return (
    <Suspense>
      <ConsoleView />
    </Suspense>
  );
}
