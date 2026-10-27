import type { Metadata } from 'next';
import { FleetMapView } from '@/components/fleet/FleetMapView';

export const metadata: Metadata = { title: 'Fleet' };

export default function FleetPage() {
  return <FleetMapView />;
}
