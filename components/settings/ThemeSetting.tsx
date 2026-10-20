'use client';

import { setThemePref, useThemePref, type ThemePref } from '@/lib/theme';

const OPTIONS: [ThemePref, string][] = [
  ['system', 'Same as this device'],
  ['light', 'Light'],
  ['dark', 'Dark'],
];

/** Light, dark, or following the device (the default). Remembered per browser. */
export function ThemeSetting() {
  const pref = useThemePref();
  return (
    <label className="grid items-center gap-x-6 gap-y-2.5" style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }}>
      <span className="t-h3">Theme</span>
      <select
        value={pref}
        onChange={(e) => setThemePref(e.target.value as ThemePref)}
        className="min-h-11 min-w-[220px] rounded-md border border-border bg-surface-100 py-2 ps-3.5 text-[14px] text-ink"
      >
        {OPTIONS.map(([k, label]) => (
          <option key={k} value={k}>
            {label}
          </option>
        ))}
      </select>
      <span className="t-mono-sm col-span-2 text-ink-muted">This browser only. Same as this device follows its light or dark setting.</span>
    </label>
  );
}
