import Link from 'next/link';

const LINKS = [
  ['/console', 'Console'],
  ['/console/history', 'History'],
  ['/console/fleet', 'Fleet'],
  ['/console/settings', 'Settings'],
] as const;

export type DispatchPage = (typeof LINKS)[number][0];

/**
 * Console · Fleet · Settings as a segmented control: the current page is a raised tab on a sunken
 * track, the others are muted until hovered. Who's signed in lives in AccountMenu, at the end of
 * the header.
 */
export function DispatchNav({ current }: { current: DispatchPage }) {
  return (
    <nav aria-label="Dispatch" className="inline-flex items-center gap-0.5 rounded-lg border border-divider bg-surface-200 p-0.5">
      {LINKS.map(([href, label]) => {
        const on = href === current;
        return (
          <Link
            key={href}
            href={href}
            aria-current={on ? 'page' : undefined}
            // Inline colour: the global unlayered `a { color }` rule beats Tailwind utilities.
            className={`inline-flex min-h-11 items-center rounded-md px-3.5 text-[14px] font-semibold no-underline transition-colors ${
              on ? 'bg-surface-100' : 'hover:bg-surface-300'
            }`}
            style={{
              color: on ? 'var(--ink)' : 'var(--ink-muted)',
              boxShadow: on ? '0 0 0 1px var(--border), 0 1px 2px rgb(0 0 0 / 0.06)' : 'none',
            }}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
