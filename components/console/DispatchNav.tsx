import Link from 'next/link';

const LINKS = [
  ['/console', 'Console'],
  ['/console/fleet', 'Fleet'],
  ['/console/settings', 'Settings'],
] as const;

export type DispatchPage = (typeof LINKS)[number][0];

/** Console · Fleet · Settings. The current page has an ink fill. */
export function DispatchNav({ current }: { current: DispatchPage }) {
  return (
    <nav aria-label="Dispatch" className="flex flex-wrap gap-1">
      {LINKS.map(([href, label]) => {
        const on = href === current;
        return (
          <Link
            key={href}
            href={href}
            aria-current={on ? 'page' : undefined}
            // Inline colour: the global unlayered `a { color }` rule beats Tailwind utilities.
            className={`inline-flex min-h-11 items-center rounded-md px-3 text-[14px] font-semibold no-underline ${on ? 'bg-ink' : ''}`}
            style={{ color: on ? 'var(--surface-100)' : 'var(--ink)' }}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
