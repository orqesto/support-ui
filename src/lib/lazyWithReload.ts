import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

/**
 * Lazy chunks across a deploy. The deploy replaces the hashed chunks (rsync --delete), so a tab
 * opened before it asks for a file that is gone. `React.lazy` keeps that rejection for good, the
 * root ErrorBoundary blanks the app, and its "Try again" only rethrows it.
 *
 * So: retry the import once (a dropped connection), and when it fails again, reload the page
 * ONCE to get the new build — guarded by a timestamp in sessionStorage so a chunk that is really
 * broken cannot reload the tab in a loop. Without storage there is no guard, so no reload.
 */
export const CHUNK_RELOAD_KEY = 'odly:chunk-reload-at';
/** A second stale-chunk failure within this window is not reloaded again: it is shown. */
export const CHUNK_RELOAD_GUARD_MS = 60_000;

/** Reloads the page unless it already did so for a stale chunk moments ago. True = reloading. */
export const reloadOnceForStaleChunk = (): boolean => {
  try {
    const last = Number(window.sessionStorage.getItem(CHUNK_RELOAD_KEY) ?? 0);
    if (Number.isFinite(last) && Date.now() - last < CHUNK_RELOAD_GUARD_MS) return false;
    window.sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()));
  } catch {
    return false;
  }
  window.location.reload();
  return true;
};

/** The import, retried once; on a second failure, the guarded reload (or the error). */
export const importWithReload = async <T>(factory: () => Promise<T>): Promise<T> => {
  try {
    return await factory();
  } catch {
    try {
      return await factory();
    } catch (error) {
      // The page is going away: stay suspended (the fallback shows) instead of failing.
      if (reloadOnceForStaleChunk()) return new Promise<T>(() => undefined);
      throw error;
    }
  }
};

/** `React.lazy` that survives a deploy (see above). */
// The same constraint React.lazy itself declares.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const lazyWithReload = <T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>
): LazyExoticComponent<T> => lazy(() => importWithReload(factory));

/**
 * Vite's own preload failure (a chunk's CSS or a dependency it preloads): the same guarded
 * reload. Without `preventDefault` Vite throws the error. Call once, at startup.
 */
export const installStaleChunkReload = (): void => {
  window.addEventListener('vite:preloadError', (event) => {
    if (reloadOnceForStaleChunk()) event.preventDefault();
  });
};
