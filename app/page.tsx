import Link from 'next/link';

// Development index: where each surface lives. Not part of any product surface.
// Tracking tokens are exactly 16 characters in the API; these exist in the mock data.
const TRACK = [
  ['demointransit001', 'In transit (single drop-off)'],
  ['demomultidrop001', 'In transit (multi-drop: other drop-offs hidden)'],
  ['demopending00001', 'Pending'],
  ['demoassigned0001', 'Assigned'],
  ['demostale0000001', 'Stale position'],
  ['democompleted001', 'Completed'],
  ['demofailed000001', 'Failed'],
  ['democancelled001', 'Cancelled'],
  ['nosuchlink000000', 'Link not found'],
];

export default function Home() {
  return (
    <main className="mx-auto flex max-w-[720px] flex-col gap-8 px-4 py-12">
      <div className="flex flex-col gap-2">
        <span className="t-label text-ink-muted">Kestrel Freight</span>
        <h1 className="t-display m-0">Dispatch</h1>
      </div>
      <section className="flex flex-col gap-3">
        <h2 className="t-h2 m-0">Dispatcher</h2>
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          <li><Link href="/console" className="t-body font-semibold">Console</Link></li>
          <li><Link href="/console/fleet" className="t-body font-semibold">Fleet</Link></li>
          <li><Link href="/console/settings" className="t-body font-semibold">Operator settings</Link></li>
        </ul>
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="t-h2 m-0">Driver</h2>
        <Link href="/driver" className="t-body font-semibold">Driver app (truck {process.env.NEXT_PUBLIC_DEMO_TRUCK_ID ?? 'KF-12'})</Link>
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="t-h2 m-0">Customer tracking links (mock data)</h2>
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {TRACK.map(([token, label]) => (
            <li key={token}>
              <Link href={`/t/${token}`} className="t-body font-semibold">{label}</Link>{' '}
              <span className="t-mono text-ink-muted">/t/{token}</span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
