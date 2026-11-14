import { useCallback, useState, type Dispatch, type SetStateAction } from 'react';
import { clearOnSessionChange } from './sessionCaches';

/*
  The last value a view read for something, so reopening it draws that at once while its own read
  refreshes it in the background (stale-while-revalidate, per view).

  Why: the thread pane remounts for every thread it shows (`key={selectedMessage.id}`), and each
  part of it — the events, notes, activity, files, labels, KB references — reads on mount with
  its own effect and starts empty. Switching between two open tabs read fourteen endpoints and
  drew spinners every time, for data seen a second before. The reads stay exactly as they are
  (their paging, incremental reads and race guards are tuned); only the state they write to
  starts from the last value instead of empty, and they skip their loading state when it does.

  Kept in memory only, at most MAX_ENTRIES values (least recently written dropped), and cleared on
  sign-out and on a workspace switch (sessionCaches): nobody is drawn another person's or another
  workspace's last reads.
*/

const MAX_ENTRIES = 200;
const store = new Map<string, unknown>();
clearOnSessionChange(() => store.clear());

/** What a value belongs to: [what, whose id, which part], e.g. ['thread', 102, 'notes']. */
export type SeedKey = readonly [scope: string, id: string | number, part: string];

const storeKey = (key: SeedKey): string => key.join('\u0000');

export const readSeed = <T>(key: SeedKey): T | undefined => {
  const name = storeKey(key);
  return store.has(name) ? (store.get(name) as T) : undefined;
};

export const writeSeed = <T>(key: SeedKey, value: T): void => {
  const name = storeKey(key);
  store.delete(name);
  store.set(name, value);
  while (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest === undefined) break;
    store.delete(oldest);
  }
};

/** For tests, and for a view that knows its values are wrong now. */
export const forgetSeeds = (scope?: string, id?: string | number): void => {
  if (scope === undefined) {
    store.clear();
    return;
  }
  const prefix = id === undefined ? `${scope}\u0000` : `${scope}\u0000${id}\u0000`;
  for (const name of [...store.keys()]) if (name.startsWith(prefix)) store.delete(name);
};

type Slot<T> = { name: string; key: SeedKey; value: T; seeded: boolean };

const slotFor = <T>(key: SeedKey, fallback: T | (() => T)): Slot<T> => {
  const seed = readSeed<T>(key);
  const name = key.join('\u0000');
  // `null` is a value (merges not read yet), so not `??`: only a missing seed falls back.
  if (seed !== undefined) return { name, key, value: seed, seeded: true };
  const value = typeof fallback === 'function' ? (fallback as () => T)() : fallback;
  return { name, key, value, seeded: false };
};

/**
 * `useState`, starting from the last value written under `key` (or `fallback`), and writing every
 * update back. `seeded` says the value came from a previous read: the caller skips its loading
 * state then. When `key` changes (a view reused for another thread), the state starts over from
 * that key's value — never the previous thread's.
 */
export function useSeededState<T>(
  key: SeedKey,
  fallback: T | (() => T)
): [T, Dispatch<SetStateAction<T>>, boolean] {
  const [slot, setSlot] = useState<Slot<T>>(() => slotFor(key, fallback));
  let current = slot;
  if (slot.name !== key.join('\u0000')) {
    // React's pattern for state derived from a prop: replaced during render, no extra paint.
    current = slotFor(key, fallback);
    setSlot(current);
  }
  const setValue = useCallback<Dispatch<SetStateAction<T>>>((next) => {
    setSlot((previous) => {
      const value = typeof next === 'function' ? (next as (prior: T) => T)(previous.value) : next;
      if (value !== undefined) writeSeed(previous.key, value);
      return { ...previous, value };
    });
  }, []);
  return [current.value, setValue, current.seeded];
}
