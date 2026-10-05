import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { DriverRoot } from '@/components/driver/DriverRoot';

export const metadata: Metadata = {
  title: 'Driver',
  manifest: '/driver.webmanifest',
  appleWebApp: { capable: true, title: 'Driver', statusBarStyle: 'default' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Literal colour: the browser chrome can't read CSS tokens. Matches --surface-100.
  themeColor: '#fafaf9',
};

export default function DriverLayout({ children }: { children: ReactNode }) {
  return <DriverRoot>{children}</DriverRoot>;
}
