import { useCallback, useEffect, useRef, useState } from 'react';

/** v4's right-edge fade, applied only while the strip has more to scroll to. Alpha only. */
export const STRIP_FADE =
  '[mask-image:linear-gradient(90deg,black_calc(100%_-_18px),transparent)] [-webkit-mask-image:linear-gradient(90deg,black_calc(100%_-_18px),transparent)]';

/**
 * Does the strip overflow AND still have content to the right? Measured, because v4 decides this
 * with a container query this Tailwind build has no plugin for. Re-measured on scroll and resize,
 * and when `contentKey` changes — the tabs' widths change when a tab or a badge appears.
 */
export function useStripFade(contentKey: string) {
  const stripRef = useRef<HTMLDivElement>(null);
  const [stripFades, setStripFades] = useState(false);
  const updateStripFade = useCallback(() => {
    const strip = stripRef.current;
    if (!strip) return;
    setStripFades(strip.scrollWidth - strip.clientWidth - strip.scrollLeft > 1);
  }, []);
  useEffect(() => {
    updateStripFade();
    const strip = stripRef.current;
    if (!strip || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(updateStripFade);
    observer.observe(strip);
    return () => observer.disconnect();
  }, [updateStripFade, contentKey]);
  return { stripRef, stripFades, updateStripFade };
}
