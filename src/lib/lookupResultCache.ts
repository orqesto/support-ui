/**
 * The lookup cache (support-ui #920, owner 2026-11-11): a thread's connected-system lookup results,
 * kept IN THIS BROWSER for five minutes, so leaving the Lookups tab and coming back — or going back
 * to a thread just answered — reuses them instead of calling the client's vendor again. "Look up
 * again" always calls.
 *
 * Owner's choices: in the agent's browser (no customer records stored on our servers), fresh for
 * five minutes. A page reload or another agent runs it again.
 *
 * ⛔ Keyed by workspace + user + thread + the customer's email: one person's results never show for
 * another login, another workspace, or after the thread's customer changed. Only runs FOR THE
 * CUSTOMER are kept (never a run as a typed email), and never a run where a lookup failed — a
 * vendor timeout must not be served as the answer for five minutes.
 * ⛔ Bounded (MAX_ENTRIES, oldest first), swept of expired entries on every write, and emptied by
 * authStore.logout — a customer's records do not outlive the sign-in that fetched them.
 *
 * Generic, in `lib`, so the auth store can clear it (a store may not import a feature).
 *
 * IN-FLIGHT RUNS are shared too: reopening the tab (or React's development double-mount) while the
 * first run is still answering joins that run instead of sending the vendor a second one.
 */
export const LOOKUP_CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_ENTRIES = 50;

type Entry = { results: unknown[]; ranAt: string; storedAt: number };

const entries = new Map<string, Entry>();
const inFlight = new Map<string, Promise<unknown[]>>();

export const lookupCacheKey = (
  orgId: number | null,
  userId: number | null,
  conversationId: number | undefined,
  customerEmail: string | undefined
): string | null =>
  orgId !== null && userId !== null && conversationId
    ? `${orgId}|${userId}|${conversationId}|${(customerEmail ?? '').trim().toLowerCase()}`
    : null;

/** The fresh results for this key, or null (none, or older than the TTL — then forgotten). */
export const readLookupCache = <T>(
  key: string | null,
  now: number = Date.now()
): { results: T[]; ranAt: string } | null => {
  if (!key) return null;
  const entry = entries.get(key);
  if (!entry) return null;
  if (now - entry.storedAt >= LOOKUP_CACHE_TTL_MS) {
    entries.delete(key);
    return null;
  }
  return { results: entry.results as T[], ranAt: entry.ranAt };
};

export const writeLookupCache = (
  key: string | null,
  results: unknown[],
  ranAt: string,
  now: number = Date.now()
): void => {
  if (!key) return;
  for (const [entryKey, entry] of entries) {
    if (now - entry.storedAt >= LOOKUP_CACHE_TTL_MS) entries.delete(entryKey);
  }
  entries.delete(key); // re-insert so the newest is last (Map keeps insertion order)
  entries.set(key, { results, ranAt, storedAt: now });
  while (entries.size > MAX_ENTRIES) {
    const oldest = entries.keys().next().value;
    if (oldest === undefined) break;
    entries.delete(oldest);
  }
};

/** The customer run still answering for this key, if any. */
export const inFlightLookup = <T>(key: string | null): Promise<T[]> | null =>
  key ? ((inFlight.get(key) as Promise<T[]> | undefined) ?? null) : null;

/** Register a customer run so a remount joins it; it leaves the registry when it settles. */
export const trackInFlightLookup = <T>(key: string | null, call: Promise<T[]>): Promise<T[]> => {
  if (!key) return call;
  inFlight.set(key, call);
  const leave = () => {
    if (inFlight.get(key) === call) inFlight.delete(key);
  };
  call.then(leave, leave);
  return call;
};

/** Forget everything: on sign-out (authStore.logout), after an admin changes the lookups, in tests. */
export const clearLookupCache = (): void => {
  entries.clear();
  inFlight.clear();
};
