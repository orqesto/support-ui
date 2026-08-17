/**
 * Last-known numeric counts, persisted per scope key.
 *
 * Exists for one narrow job: nav items whose VISIBILITY is gated on a count. Those
 * queries start at `undefined` on a cold load and again on every org/department switch
 * (the scope is part of the queryKey), so the sidebar has to guess while the count is in
 * flight — and either guess is visible. Guessing "has items" makes an item appear and
 * then vanish; guessing "none" makes it appear late. Seeding from the previous answer
 * removes the guess: the first render shows what was true last time, then the fetch
 * corrects it if it changed.
 *
 * Deliberately NOT for badge numbers. A stale *count* on screen is wrong information,
 * which is worse than a count that arrives a moment late; only use this where the value
 * decides whether a thing is shown.
 *
 * Failures are swallowed on purpose — private-mode Safari throws on write, quota can be
 * exhausted, and a cache miss just returns to the pre-existing loading behaviour.
 */

const PREFIX = 'odly.count.';

export const readPersistedCount = (key: string): number | undefined => {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw === null) return undefined;
    // `Number('')` and `Number('  ')` are 0, which would claim "known to have none" from a
    // value that knows nothing. The two states must stay distinct: 0 = confirmed empty,
    // undefined = never fetched for this scope.
    if (raw.trim() === '') return undefined;
    const parsed = Number(raw);
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
  } catch {
    return undefined;
  }
};

export const writePersistedCount = (key: string, value: number): void => {
  try {
    localStorage.setItem(PREFIX + key, String(value));
  } catch {
    // no-op: see module comment
  }
};
