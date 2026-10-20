'use client';

import { ChevronDown } from 'lucide-react';

/** {company} and {support_phone} in the operator's own text. */
export function fillIn(text: string, company: string, phone: string | null): string {
  return text.replaceAll('{company}', company).replaceAll('{support_phone}', phone || 'their usual number');
}

/**
 * The delivery terms as small print under the delivery details, the way carriers put a notice
 * at the foot of a tracking page: one plain line, with the full terms folded behind a link.
 */
export function TermsNotice({ terms, company, phone }: { terms: string; company: string; phone: string | null }) {
  const blocks = fillIn(terms, company, phone)
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);
  if (!blocks.length) return null;
  return (
    <aside aria-label="Delivery terms" className="flex flex-col gap-1.5 border-t border-divider pt-3 text-[12px] leading-[17px] text-ink-muted">
      <p className="m-0" style={{ textWrap: 'pretty' }}>
        <strong className="font-semibold">Notice:</strong> Deliveries from {company} are carried under its delivery terms. Please check
        your goods before you sign; signing confirms you received them in good order.
      </p>
      <details className="group">
        <summary className="inline-flex min-h-8 cursor-pointer list-none items-center gap-1 font-semibold text-ink underline underline-offset-2">
          Read the delivery terms
          <ChevronDown size={14} aria-hidden="true" className="flex-none transition-transform group-open:rotate-180" />
        </summary>
        <div className="mt-1.5 flex max-h-[260px] flex-col gap-2.5 overflow-auto rounded-md border border-divider bg-surface-200 p-3">
          {blocks.map((b, i) => {
            const [first, ...rest] = b.split('\n');
            const heading = rest.length > 0 && first!.length <= 60 && !/[.!?:]$/.test(first!.trim());
            return heading ? (
              <section key={i} className="flex flex-col gap-0.5">
                <h3 className="m-0 text-[12px] leading-[17px] font-semibold text-ink">{first}</h3>
                <p className="m-0 whitespace-pre-line" style={{ textWrap: 'pretty' }}>
                  {rest.join('\n')}
                </p>
              </section>
            ) : (
              <p key={i} className="m-0 whitespace-pre-line" style={{ textWrap: 'pretty' }}>
                {b}
              </p>
            );
          })}
        </div>
      </details>
    </aside>
  );
}
