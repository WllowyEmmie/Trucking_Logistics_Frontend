'use client';

import { useEffect, useState } from 'react';

/**
 * Content width of an element, kept current with a ResizeObserver.
 * Use the returned callback as the element's `ref`. Width is null until measured.
 */
export function useElementWidth<T extends HTMLElement = HTMLElement>(): [(el: T | null) => void, number | null] {
  const [el, setEl] = useState<T | null>(null);
  const [width, setWidth] = useState<number | null>(null);
  useEffect(() => {
    if (!el) return;
    setWidth(el.getBoundingClientRect().width);
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setWidth(entry.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return [setEl, width];
}
