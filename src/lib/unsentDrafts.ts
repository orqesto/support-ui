/*
  Unsent editor text kept in THIS browser, so a closed panel, a page change or a phone browser
  killing the background tab does not lose what the agent typed (owner request 2026-11-09).

  Browser-only on purpose: no server writes while typing. A draft stays on the device it was
  written on. Keyed by user + workspace + the place it was written (thread, ticket, …), so it never
  shows for another person or in another workspace; sign-out removes all of them (shared computers)
  and an entry older than a week is dropped when read.
*/

const PREFIX = 'odly:unsent-draft:v1:';
export const UNSENT_DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
// A pasted page of HTML is fine; a runaway entry must not eat the origin's ~5 MB quota.
const MAX_STORED_CHARS = 500_000;

type StoredDraft<T> = { savedAt: number; data: T };

const storage = (): Storage | null => {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    // Blocked site data (some private modes, strict settings): the feature is simply off.
    return null;
  }
};

export const unsentDraftKey = (
  userId: number | null | undefined,
  workspaceId: number | null | undefined,
  scope: string
): string | null =>
  userId === null || userId === undefined
    ? null
    : `${PREFIX}${userId}:${workspaceId ?? 'none'}:${scope}`;

export const removeUnsentDraft = (key: string): void => {
  try {
    storage()?.removeItem(key);
  } catch {
    /* nothing to do */
  }
};

export function readUnsentDraft<T>(key: string, now = Date.now()): T | null {
  try {
    const raw = storage()?.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredDraft<T>> | null;
    if (!parsed || typeof parsed.savedAt !== 'number' || parsed.data === undefined) {
      removeUnsentDraft(key);
      return null;
    }
    if (now - parsed.savedAt > UNSENT_DRAFT_TTL_MS) {
      removeUnsentDraft(key);
      return null;
    }
    return parsed.data;
  } catch {
    removeUnsentDraft(key);
    return null;
  }
}

export function writeUnsentDraft<T>(key: string, data: T, now = Date.now()): void {
  try {
    const raw = JSON.stringify({ savedAt: now, data } satisfies StoredDraft<T>);
    // Too big to keep: drop the older copy too, so an outdated version never comes back.
    if (raw.length > MAX_STORED_CHARS) removeUnsentDraft(key);
    else storage()?.setItem(key, raw);
  } catch {
    // Quota full or storage blocked: typing must never fail because of this.
  }
}

const ownKeys = (): string[] => {
  const store = storage();
  if (!store) return [];
  const keys: string[] = [];
  try {
    for (let index = 0; index < store.length; index += 1) {
      const key = store.key(index);
      if (key?.startsWith(PREFIX)) keys.push(key);
    }
  } catch {
    return [];
  }
  return keys;
};

/** Sign-out: the next person on this browser must not see the previous one's words. */
export const clearAllUnsentDrafts = (): void => {
  ownKeys().forEach(removeUnsentDraft);
};

/** Drops week-old entries for places never reopened (reading drops only the one it reads). */
export const pruneUnsentDrafts = (now = Date.now()): void => {
  ownKeys().forEach((key) => readUnsentDraft(key, now));
};

let prunedThisLoad = false;
/** Once per page load: the first editor that opens sweeps the week-old entries. */
export const pruneUnsentDraftsOnce = (): void => {
  if (prunedThisLoad) return;
  prunedThisLoad = true;
  pruneUnsentDrafts();
};

/** Test seam: the once-per-page prune runs again. */
export const resetUnsentDraftPruneForTests = (): void => {
  prunedThisLoad = false;
};
