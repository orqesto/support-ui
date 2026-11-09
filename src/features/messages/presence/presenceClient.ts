/**
 * The presence socket calls (BE contract: fe-context / spec §6). Every call answers `null` when
 * presence is not there — a timeout, `{ok:false}` (presence off, the socket not yet in its
 * workspace, the watch cap) — and the caller then renders nothing. Nothing here throws.
 */
import { getSocket, releaseSocket } from '@/lib/socketManager';
import type { PresenceState, SnapshotAck, WatchAck } from './presence.types';

export const PRESENCE_ACK_TIMEOUT_MS = 5_000;
/** `presence:watch` takes at most 20 ids per call. */
export const WATCH_BATCH_SIZE = 20;
/**
 * The server drops `presence:state` beyond 5 per second per socket (a fixed 1 s window), and all
 * of this tab's threads share one socket. One send per 250 ms keeps any second at 4 or fewer.
 */
export const STATE_SEND_GAP_MS = 250;

/** Borrow the shared socket without holding it: the hooks that use presence hold it. */
const withSocket = <T>(use: (socket: ReturnType<typeof getSocket>) => T): T => {
  const socket = getSocket();
  try {
    return use(socket);
  } finally {
    releaseSocket();
  }
};

const ask = async <T extends { ok: true }>(event: string, payload: unknown): Promise<T | null> => {
  try {
    const answer: unknown = await withSocket((socket) =>
      socket.timeout(PRESENCE_ACK_TIMEOUT_MS).emitWithAck(event, payload)
    );
    const ok = (answer as { ok?: unknown } | null)?.ok === true;
    return ok ? (answer as T) : null;
  } catch {
    return null; // the ack timed out
  }
};

/* Paced `presence:state` sends: the latest state per thread waits its turn (one per gap). */
const pending = new Map<number, PresenceState>();
let drainTimer: ReturnType<typeof setTimeout> | null = null;
let lastSentAt = Number.NEGATIVE_INFINITY;

const drain = () => {
  drainTimer = null;
  const next = pending.entries().next();
  if (next.done) return;
  const [conversationId, state] = next.value;
  pending.delete(conversationId);
  lastSentAt = Date.now();
  withSocket((socket) => socket.emit('presence:state', { conversationId, state }));
  if (pending.size > 0) drainTimer = setTimeout(drain, STATE_SEND_GAP_MS);
};

export const presenceClient = {
  /** One batch of ≤ 20 ids (the hook splits). */
  watch: (conversationIds: number[]): Promise<WatchAck | null> =>
    ask<WatchAck>('presence:watch', { conversationIds }),

  /** Queued: sent as soon as the pacing allows; a newer state for the same thread replaces it. */
  setState: (conversationId: number, state: PresenceState): void => {
    pending.set(conversationId, state);
    if (drainTimer !== null) return;
    const wait = Math.max(0, lastSentAt + STATE_SEND_GAP_MS - Date.now());
    if (wait === 0) drain();
    else drainTimer = setTimeout(drain, wait);
  },

  /** Fire-and-forget, in batches of ≤ 20; a state still queued for these threads is dropped. */
  unwatch: (conversationIds: number[]): void => {
    if (conversationIds.length === 0) return;
    for (const id of conversationIds) pending.delete(id);
    withSocket((socket) => {
      for (let start = 0; start < conversationIds.length; start += WATCH_BATCH_SIZE) {
        const batch = conversationIds.slice(start, start + WATCH_BATCH_SIZE);
        socket.emit('presence:unwatch', { conversationIds: batch });
      }
    });
  },

  snapshot: (): Promise<SnapshotAck | null> => ask<SnapshotAck>('presence:snapshot', {}),
};

export const resetPresenceClientForTests = (): void => {
  pending.clear();
  if (drainTimer !== null) clearTimeout(drainTimer);
  drainTimer = null;
  lastSentAt = Number.NEGATIVE_INFINITY;
};
