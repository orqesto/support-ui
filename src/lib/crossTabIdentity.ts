/**
 * The saved login (`auth-storage`) is shared by every tab of the browser, but each tab keeps its
 * own copy in memory and nothing synced them: after another tab signed out and in as someone else,
 * this tab went on showing — and marking as "yours" — the previous person (staging 2026-11-19).
 * The server was never fooled (it reads the session cookie), the screen was.
 *
 * Watches the other tabs' writes: a DIFFERENT person or a sign-out calls `onChange` (the store
 * reloads the page, which re-reads the login and every list fresh). A write for the same person
 * (a new photo key, a name change) does nothing.
 *
 * No reload loop: a `storage` event reaches only the OTHER tabs, never the tab that wrote, and the
 * reloaded tab's own rehydration writes the SAME id the other tab already holds (ignored there).
 * Unsent editor text survives the reload: it lives in localStorage (`lib/unsentDrafts`), and only a
 * sign-out clears it — which the signing-out tab does itself, before this tab reloads.
 */
const AUTH_KEY = 'auth-storage';

const savedUserId = (value: string | null): number | null => {
  if (!value) return null;
  try {
    const id = (JSON.parse(value) as { state?: { user?: { id?: unknown } | null } }).state?.user
      ?.id;
    return typeof id === 'number' ? id : null;
  } catch {
    return null;
  }
};

/** Starts watching; returns the stop function. */
export const watchCrossTabIdentity = (
  currentUserId: () => number | null,
  onChange: () => void
): (() => void) => {
  const onStorage = (event: StorageEvent) => {
    if (event.key !== AUTH_KEY) return;
    if (savedUserId(event.newValue) !== currentUserId()) onChange();
  };
  window.addEventListener('storage', onStorage);
  return () => window.removeEventListener('storage', onStorage);
};
