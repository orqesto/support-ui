import { useEffect, useState, type RefObject } from 'react';

/**
 * The rendered width of an element, kept current as it resizes — for layouts that depend on the
 * space a component is given rather than on the window (a ticket in a side sheet vs a full page).
 * `fallback` until measured, and for good where ResizeObserver does not exist (jsdom).
 */
export const useElementWidth = (ref: RefObject<HTMLElement | null>, fallback: number): number => {
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    setWidth(element.clientWidth);
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return width;
};
