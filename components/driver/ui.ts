// Shared class strings for the driver app. Targets: 56px floor (from `.driver`), 64px secondary, 72–76px primary.

/** The one primary action, in the bottom bar. */
export const primaryCls =
  't-driver-action flex min-h-[72px] w-full items-center justify-center gap-3 rounded-lg border-0 bg-ink px-4 text-center no-underline disabled:opacity-45';
/** Inline colour: the global unlayered `a { color }` rule beats Tailwind utilities on links. */
export const primaryStyle = { color: 'var(--surface-100)' } as const;

/** Secondary actions: 64px, 2px ink border. */
export const secondaryCls =
  't-driver-action flex min-h-16 items-center justify-center gap-2.5 rounded-lg border-2 border-ink bg-surface-100 px-4 text-center no-underline';
export const secondaryStyle = { color: 'var(--ink)' } as const;

/** Small top-row buttons: Back, Problem, Cancel. */
export const topBtnCls =
  't-driver-meta inline-flex min-h-14 items-center gap-2 rounded-lg border-2 bg-surface-100 px-3.5 font-bold no-underline';

/** A tappable row with a label and a muted note at the end (contact screen). */
export const rowCls =
  't-driver-meta flex min-h-16 items-center justify-between gap-3 rounded-lg border-2 px-4 py-2 text-start font-bold no-underline';

export const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, '')}`;

export const smsHref = (phone: string, body: string) =>
  // "?&body=" works on both iOS and Android.
  `sms:${phone.replace(/[^\d+]/g, '')}?&body=${encodeURIComponent(body)}`;

/** Hands off to the phone's own map app. Without coordinates, it searches the address. */
export function navHref(lat: number | null, lng: number | null, label: string): string {
  const ios = typeof navigator !== 'undefined' && /iPhone|iPad|iPod/.test(navigator.userAgent);
  if (lat == null || lng == null) {
    return ios ? `https://maps.apple.com/?daddr=${encodeURIComponent(label)}` : `geo:0,0?q=${encodeURIComponent(label)}`;
  }
  return ios
    ? `https://maps.apple.com/?daddr=${lat},${lng}&q=${encodeURIComponent(label)}`
    : `geo:${lat},${lng}?q=${lat},${lng}(${encodeURIComponent(label)})`;
}
