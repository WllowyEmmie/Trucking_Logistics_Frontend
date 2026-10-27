import type { Metadata } from 'next';
import { Suspense } from 'react';
import { MessagesView } from '@/components/messages/MessagesView';

export const metadata: Metadata = { title: 'Messages' };

// ?driver=<id> opens that driver's thread; useSearchParams needs a Suspense boundary.
export default function MessagesPage() {
  return (
    <Suspense>
      <MessagesView />
    </Suspense>
  );
}
