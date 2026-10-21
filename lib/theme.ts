'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useSyncExternalStore } from 'react';
import { isPublicPath } from './site';

/**
 * Light, dark, or whatever the OS says. A per-browser convenience, kept in localStorage; if that
 * isn't available (private window, blocked storage) the console just follows the OS.
 *
 * `.dark` goes on <body>, not <html>, so `:root` keeps the light values: globals.css captures the
 * light marker colours there for the map, whose tiles stay light in both themes.
 */
export type ThemePref = 'system' | 'light' | 'dark';

const KEY = 'dispatch-theme';
const ORDER: ThemePref[] = ['system', 'light', 'dark'];
const listeners = new Set<() => void>();

function read(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

let pref: ThemePref | null = null;
const current = () => (pref ??= read());

export function setThemePref(next: ThemePref) {
  pref = next;
  try {
    if (next === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, next);
  } catch {
    // Not saved; it still applies for this page.
  }
  listeners.forEach((l) => l());
}

/** System → Light → Dark → System. */
export const nextThemePref = (p: ThemePref): ThemePref => ORDER[(ORDER.indexOf(p) + 1) % ORDER.length]!;

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};

export function useThemePref(): ThemePref {
  return useSyncExternalStore(subscribe, current, () => 'system');
}

/** Applies the preference to the page. Mounted once, in Providers. */
export function useApplyTheme() {
  const p = useThemePref();
  // The public website is always light; the theme switch is for the console and driver app.
  const publicPage = isPublicPath(usePathname());
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = !publicPage && (p === 'dark' || (p === 'system' && mq.matches));
      document.body.classList.toggle('dark', dark);
      document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
    };
    apply();
    if (p !== 'system' || publicPage) return;
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [p, publicPage]);
}
