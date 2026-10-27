import type { ReactNode } from 'react';
import { DispatcherGate } from '@/components/auth/Gate';
import { ConsoleShell } from '@/components/console/ConsoleShell';

// Every /console page needs a dispatcher sign-in, and sits in the console frame (sidebar + panel).
export default function ConsoleLayout({ children }: { children: ReactNode }) {
  return (
    <DispatcherGate>
      <ConsoleShell>{children}</ConsoleShell>
    </DispatcherGate>
  );
}
