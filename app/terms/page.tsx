'use client';

import { SiteShell } from '@/components/site/SiteChrome';
import { fillIn } from '@/components/tracking/CustomerInfo';
import { useConfig } from '@/lib/config';

// The delivery terms in full, from Settings → Proof and customer page. Linked from the booking form.
export default function TermsPage() {
  const c = useConfig();
  const blocks = fillIn(c.customer_terms, c.operator_name, c.support_phone || null)
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);
  return (
    <SiteShell>
      <main className="mx-auto flex w-full max-w-[720px] flex-col gap-5 px-4 py-14">
        <h1 className="t-display m-0">Delivery terms</h1>
        {blocks.length === 0 && <p className="t-body m-0 text-ink-muted">{c.operator_name} hasn&apos;t published its terms yet.</p>}
        {blocks.map((b, i) => {
          const [first, ...rest] = b.split('\n');
          const heading = rest.length > 0 && first!.length <= 60 && !/[.!?:]$/.test(first!.trim());
          return heading ? (
            <section key={i} className="flex flex-col gap-1">
              <h2 className="t-h2 m-0">{first}</h2>
              <p className="t-body m-0 whitespace-pre-line" style={{ textWrap: 'pretty' }}>
                {rest.join('\n')}
              </p>
            </section>
          ) : (
            <p key={i} className="t-body m-0 whitespace-pre-line" style={{ textWrap: 'pretty' }}>
              {b}
            </p>
          );
        })}
      </main>
    </SiteShell>
  );
}
