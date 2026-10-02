import { useEffect, useState, type RefObject } from 'react';

/**
 * Whether an element has come within `margin` of the viewport. Sticky: once seen, true for good,
 * so what a bubble fetched when it scrolled in is not thrown away when it scrolls out.
 *
 * ⚠️ Without `IntersectionObserver` (an old browser, jsdom) the answer is true from the start:
 * the caller then behaves exactly as it did before this hook existed, never worse.
 */
export const useInView = (ref: RefObject<Element | null>, margin = '0px'): boolean => {
  const observable = typeof IntersectionObserver !== 'undefined';
  const [seen, setSeen] = useState(!observable);
  useEffect(() => {
    if (seen || !observable) return undefined;
    const node = ref.current;
    if (!node) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setSeen(true);
          observer.disconnect();
        }
      },
      { rootMargin: margin }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref, seen, observable, margin]);
  return seen;
};
