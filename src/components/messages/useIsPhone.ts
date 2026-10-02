import { useEffect, useState } from 'react';

/**
 * Below the `sm` breakpoint (640px): the message detail's phone layout (v4 mobile).
 *
 * ⛔ EXACTLY Tailwind 3's `max-sm:` query, not `(max-width: 639px)`: the two disagree for widths
 * 639.01–639.99 (a zoomed or fractional viewport), where the page got the phone STYLES from the
 * `max-sm:` classes and the desktop STRUCTURE from this hook. One query, so they cannot split.
 */
export const PHONE_QUERY = 'not all and (min-width: 640px)';

const matches = (query: string): boolean =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(query).matches
    : false;

/**
 * `useMediaQuery(PHONE_QUERY)`, but safe where `matchMedia` does not exist (jsdom, old embeds):
 * there it answers false — the desktop layout — instead of throwing. `useMediaQuery` calls
 * `window.matchMedia` unguarded, and the header renders in dozens of tests that never stub it.
 */
export const useIsPhone = (): boolean => {
  const [isPhone, setIsPhone] = useState(() => matches(PHONE_QUERY));
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia(PHONE_QUERY);
    const onChange = (event: MediaQueryListEvent) => setIsPhone(event.matches);
    setIsPhone(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  return isPhone;
};
