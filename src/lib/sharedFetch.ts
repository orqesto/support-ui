/**
 * One request per key, shared by every component that asks, kept for a short while.
 *
 * Each page renders its own Layout, so every navigation remounted the hooks that read plan
 * features and UI flags, and each fired its own request — on top of the same request from the
 * feature gates and pages that ask too (~8 requests per click across the Layout's hooks). The
 * answers change on a plan or flag change, not per click. Here, callers asking for the same key
 * while one request is in flight share it, and an answer is reused for `ttlMs`.
 *
 * Not react-query on purpose: these hooks run in components (and tests) rendered without a
 * QueryClientProvider. The key must carry everything the answer depends on (the workspace).
 * A failed request is not cached, so the next caller asks again.
 */
type Entry = { at: number; value?: unknown; inFlight?: Promise<unknown> };

const entries = new Map<string, Entry>();

export const sharedFetch = <T>(key: string, fetcher: () => Promise<T>, ttlMs: number): Promise<T> => {
  const now = Date.now();
  const entry = entries.get(key);
  if (entry?.inFlight) return entry.inFlight as Promise<T>;
  if (entry && 'value' in entry && now - entry.at < ttlMs) return Promise.resolve(entry.value as T);
  const inFlight = fetcher().then(
    (value) => {
      entries.set(key, { at: Date.now(), value });
      return value;
    },
    (error: unknown) => {
      entries.delete(key);
      throw error;
    }
  );
  entries.set(key, { at: now, inFlight });
  return inFlight;
};

/** The answer already held for `key`, if fresh — so a remounted hook starts with it, no flash. */
export const peekSharedFetch = <T>(key: string, ttlMs: number): T | undefined => {
  const entry = entries.get(key);
  if (!entry || !('value' in entry) || Date.now() - entry.at >= ttlMs) return undefined;
  return entry.value as T;
};

/** Forget one key's answer (after a change the user made), or every key (tests, sign-out). */
export const invalidateSharedFetch = (key?: string): void => {
  if (key === undefined) entries.clear();
  else entries.delete(key);
};
