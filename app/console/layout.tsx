import type { ReactNode } from 'react';
import { DispatcherGate } from '@/components/auth/Gate';

// Every /console page needs a dispatcher sign-in.
export default function ConsoleLayout({ children }: { children: ReactNode }) {
  return <DispatcherGate>{children}</DispatcherGate>;
}
