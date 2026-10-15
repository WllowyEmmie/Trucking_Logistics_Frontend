'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { nextThemePref, setThemePref, useThemePref, type ThemePref } from '@/lib/theme';

const LABEL: Record<ThemePref, string> = { system: 'System', light: 'Light', dark: 'Dark' };
const ICON = { system: Monitor, light: Sun, dark: Moon } as const;

/** One button: System → Light → Dark. Shows the current setting, not the next one. */
export function ThemeToggle() {
  const pref = useThemePref();
  const next = nextThemePref(pref);
  const Icon = ICON[pref];
  return (
    <button
      type="button"
      onClick={() => setThemePref(next)}
      aria-label={`Theme: ${LABEL[pref]}. Switch to ${LABEL[next]}`}
      title={`Theme: ${LABEL[pref]}`}
      className="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-border bg-surface-100 px-2.5 text-[13px] font-semibold text-ink"
    >
      <Icon size={16} strokeWidth={2.5} aria-hidden="true" />
      {LABEL[pref]}
    </button>
  );
}
