'use client';

import { useEffect, useState } from 'react';

/** Whether the console is showing dark right now (`.dark` on <body>, set by lib/theme.ts). */
export function useDark(): boolean {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const read = () => setDark(document.body.classList.contains('dark'));
    read();
    const mo = new MutationObserver(read);
    mo.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    return () => mo.disconnect();
  }, []);
  return dark;
}
