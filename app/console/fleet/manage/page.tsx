import { redirect } from 'next/navigation';

// Trucks are added and changed on Fleet itself now, and drivers on Drivers.
export default function FleetManagePage() {
  redirect('/console/fleet');
}
