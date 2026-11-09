/**
 * One sender for this tab's presence states (spec §5.1, §5.2). Several parts of a page report on
 * the same threads over the one shared socket: the ticket view says "viewing" on every thread it
 * watches, and its reply composer says "writing a reply" on the ticked ones. Each of them (an
 * owner) states the state it wants per thread; the arbiter sends the strongest per thread
 * (writing_reply > writing_note > viewing > away), so the two never take turns overwriting each
 * other, and one leaving never drops the other's state.
 *
 * - A changed strongest state goes out at once, at most one per thread per second (BE contract).
 * - The same state again every `heartbeatMs` (the shortest any owner asks for), so the server's
 *   entry does not expire.
 * - Only threads some watcher holds right now (watchRegistry) are sent to: the server takes
 *   `presence:state` only for watched threads. A thread that stops being watched is forgotten
 *   (the server forgot it too); one that becomes watched gets the state at once.
 * - A thread nobody reports on any more is forgotten. If it was left while "writing" and is still
 *   watched, it goes back to viewing at once — a stale "writing" would hold other agents' sends.
 */
import { presenceClient } from './presenceClient';
import { PRESENCE_STATE_RANK, type PresenceState } from './presence.types';
import { allWatchedSurvivors, subscribeWatches } from './watchRegistry';

/** At most one `presence:state` per thread per second (the BE contract). */
export const STATE_MIN_GAP_MS = 1_000;

interface OwnerWants {
  states: ReadonlyMap<number, PresenceState>;
  heartbeatMs: number | undefined;
}

const owners = new Map<object, OwnerWants>();
/** Per thread: when a state was last queued for it, and which. */
const lastSent = new Map<number, { at: number; state: PresenceState }>();
/** Threads whose change waits out the 1 s gap. */
const held = new Set<number>();
let heldTimer: ReturnType<typeof setTimeout> | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let heartbeatEvery: number | null = null;

const isWriting = (state: PresenceState | undefined) =>
  state === 'writing_reply' || state === 'writing_note';

const strongest = (id: number): PresenceState | undefined => {
  let best: PresenceState | undefined;
  for (const wants of owners.values()) {
    const state = wants.states.get(id);
    if (state && (best === undefined || PRESENCE_STATE_RANK[state] > PRESENCE_STATE_RANK[best]))
      best = state;
  }
  return best;
};

const wantedIds = (): number[] => [
  ...new Set([...owners.values()].flatMap((wants) => [...wants.states.keys()])),
];

/** Send the strongest state to `ids`; `force` re-sends an unchanged one (a heartbeat, a re-watch). */
const send = (ids: number[], force: boolean): void => {
  const watched = allWatchedSurvivors();
  const now = Date.now();
  let wait = 0;
  for (const id of ids) {
    const state = strongest(id);
    if (!state || !watched.has(id)) continue;
    const last = lastSent.get(id);
    if (!force && last?.state === state) continue;
    if (last && now - last.at < STATE_MIN_GAP_MS) {
      held.add(id);
      wait = Math.max(wait, STATE_MIN_GAP_MS - (now - last.at));
      continue;
    }
    held.delete(id);
    lastSent.set(id, { at: now, state });
    presenceClient.setState(id, state);
  }
  if (held.size === 0 || heldTimer !== null) return;
  heldTimer = setTimeout(() => {
    heldTimer = null;
    const due = [...held];
    held.clear();
    send(due, false);
  }, wait);
};

const scheduleHeartbeat = (): void => {
  const periods = [...owners.values()]
    .filter((wants) => wants.states.size > 0)
    .map((wants) => wants.heartbeatMs)
    .filter((period): period is number => typeof period === 'number' && period > 0);
  const every = periods.length > 0 ? Math.min(...periods) : null;
  if (every === heartbeatEvery) return;
  if (heartbeatTimer !== null) clearInterval(heartbeatTimer);
  heartbeatTimer = null;
  heartbeatEvery = every;
  if (every !== null) heartbeatTimer = setInterval(() => send(wantedIds(), true), every);
};

const clearAll = (): void => {
  if (heldTimer !== null) clearTimeout(heldTimer);
  heldTimer = null;
  held.clear();
  lastSent.clear();
};

// The watched set moved: what left it is gone on the server, what joined it needs the state.
subscribeWatches(() => {
  const watched = allWatchedSurvivors();
  for (const id of [...lastSent.keys()]) {
    if (!watched.has(id)) lastSent.delete(id);
  }
  send(wantedIds(), false);
});

export const presenceArbiter = {
  /**
   * The states `owner` wants per thread (survivor ids) now; `null` when it stops reporting (an
   * unmount). Threads it no longer names lose its vote.
   */
  setWants: (
    owner: object,
    states: ReadonlyMap<number, PresenceState> | null,
    heartbeatMs?: number
  ): void => {
    const before = owners.get(owner)?.states;
    if (states === null || states.size === 0) owners.delete(owner);
    else owners.set(owner, { states, heartbeatMs });
    const touched = new Set([...(before?.keys() ?? []), ...(states?.keys() ?? [])]);
    const changed: number[] = [];
    const watched = allWatchedSurvivors();
    for (const id of touched) {
      if (strongest(id) !== undefined) {
        changed.push(id);
        continue;
      }
      const last = lastSent.get(id);
      lastSent.delete(id);
      held.delete(id);
      if (isWriting(last?.state) && watched.has(id)) presenceClient.setState(id, 'viewing');
    }
    send(changed, false);
    scheduleHeartbeat();
    if (owners.size === 0) clearAll();
  },

  /** A watch was acknowledged again (the server wants the states again): re-send them now. */
  resend: (ids: number[]): void => send(ids, true),

  /** The server dropped this socket's states (a disconnect): nothing counts as sent any more. */
  forgetSent: (): void => clearAll(),
};

export const resetPresenceArbiterForTests = (): void => {
  owners.clear();
  clearAll();
  if (heartbeatTimer !== null) clearInterval(heartbeatTimer);
  heartbeatTimer = null;
  heartbeatEvery = null;
};
