import { useCallback, useState } from 'react';

/** Comfortable = one card per thread (staging's look); compact = one ruled line per thread. */
export type ListDensity = 'comfortable' | 'compact';
/** List = full-width rows, the thread opens as a slide-over; split = list left, thread right. */
export type ListLayout = 'list' | 'split';

const DENSITY_KEY = 'messages_list_density';
const LAYOUT_KEY = 'messages_list_layout';

// Storage can throw (private windows, blocked site data); the defaults are always a valid look.
const read = <T extends string>(key: string, allowed: readonly T[], fallback: T): T => {
  try {
    const stored = localStorage.getItem(key);
    return allowed.includes(stored as T) ? (stored as T) : fallback;
  } catch {
    return fallback;
  }
};

const write = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* a preference that does not survive a reload is not worth an error */
  }
};

/**
 * Row density and reading layout for the thread list (Messages list v2). Per browser, like
 * the view mode: they describe the agent's screen, not the workspace.
 */
export const useListPresentation = () => {
  const [density, setDensityState] = useState<ListDensity>(() =>
    read(DENSITY_KEY, ['comfortable', 'compact'] as const, 'comfortable')
  );
  const [layout, setLayoutState] = useState<ListLayout>(() =>
    read(LAYOUT_KEY, ['list', 'split'] as const, 'list')
  );

  const setDensity = useCallback((next: ListDensity) => {
    setDensityState(next);
    write(DENSITY_KEY, next);
  }, []);
  const setLayout = useCallback((next: ListLayout) => {
    setLayoutState(next);
    write(LAYOUT_KEY, next);
  }, []);

  return { density, setDensity, layout, setLayout };
};
