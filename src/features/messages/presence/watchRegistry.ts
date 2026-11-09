/**
 * Which threads this tab's socket is watching right now, as each usePresenceWatch last published
 * it. The server takes `presence:state` only for a thread the socket watches, so usePresenceReport
 * (a composer that reports without watching) asks here first. Requested id → survivor id (after a
 * merge the server watches, and expects states for, the survivor).
 */
import type { PresenceSettings } from './presence.types';

export interface WatchPublication {
  /** Requested id → survivor id; empty while the watch is unavailable. */
  survivorOf: ReadonlyMap<number, number>;
  settings: PresenceSettings | null;
  /** Bumped on every successful watch ack: the server wants this tab's states again. */
  ackSeq: number;
}

const publications = new Map<object, WatchPublication>();
const listeners = new Set<() => void>();
let version = 0;

const sameMap = (left: ReadonlyMap<number, number>, right: ReadonlyMap<number, number>) =>
  left.size === right.size && [...left].every(([key, value]) => right.get(key) === value);

/**
 * A watcher's current set; `null` when it unmounts. A set equal to the one already published
 * (the watcher republishes on every viewer-list event) notifies nobody: each notification
 * re-renders every reporter, the ticket composer and its editor included.
 */
export const publishWatch = (owner: object, publication: WatchPublication | null): void => {
  const before = publications.get(owner);
  if (publication === null) {
    if (!before) return;
    publications.delete(owner);
  } else {
    if (
      before &&
      before.settings === publication.settings &&
      before.ackSeq === publication.ackSeq &&
      sameMap(before.survivorOf, publication.survivorOf)
    )
      return;
    publications.set(owner, publication);
  }
  version += 1;
  listeners.forEach((listener) => listener());
};

export const subscribeWatches = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const watchesVersion = (): number => version;

export interface WatchedTargets {
  /** The survivors of the given ids that some watcher holds now (ids watched by none: left out). */
  targets: number[];
  settings: PresenceSettings | null;
  /** Sum of the contributing watchers' ack counters: moves when any of them is acknowledged again. */
  ackSeq: number;
}

export const resolveWatched = (ids: number[]): WatchedTargets => {
  const targets = new Set<number>();
  let settings: PresenceSettings | null = null;
  let ackSeq = 0;
  for (const publication of publications.values()) {
    let contributes = false;
    for (const id of ids) {
      const survivor = publication.survivorOf.get(id);
      if (survivor === undefined) continue;
      targets.add(survivor);
      contributes = true;
    }
    if (!contributes) continue;
    settings ??= publication.settings;
    ackSeq += publication.ackSeq;
  }
  return { targets: [...targets].sort((left, right) => left - right), settings, ackSeq };
};

/** Every survivor some watcher holds now. */
export const allWatchedSurvivors = (): Set<number> =>
  new Set(
    [...publications.values()].flatMap((publication) => [...publication.survivorOf.values()])
  );

export const resetWatchRegistryForTests = (): void => {
  publications.clear();
  version += 1;
};
