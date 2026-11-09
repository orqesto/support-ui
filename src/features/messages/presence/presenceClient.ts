/**
 * The presence socket calls (BE contract: fe-context / spec §6). A call that gets no answer it can
 * use resolves to a `PresenceRefusal`: a timeout (`reason: 'timeout'`) or the server's `{ok:false}`
 * (presence off, the socket not yet in its workspace, `reason: 'watch_cap'`). The caller then
 * renders nothing. Nothing here throws.
 */
import { getSocket, releaseSocket } from '@/lib/socketManager';
import type { PresenceRefusal, PresenceState, SnapshotAck, WatchAck } from './presence.types';

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

/** A fire-and-forget emit: a socket that cannot send must never break the thread view. */
const emitQuietly = (use: (socket: ReturnType<typeof getSocket>) => void): void => {
  try {
    withSocket(use);
  } catch {
    // presence is best-effort; the next heartbeat or reconnect sends again
  }
};

const ask = async <T extends { ok: true }>(
  event: string,
  payload: unknown
): Promise<T | PresenceRefusal> => {
  try {
    const answer: unknown = await withSocket((socket) =>
      socket.timeout(PRESENCE_ACK_TIMEOUT_MS).emitWithAck(event, payload)
    );
    const body = answer as { ok?: unknown; reason?: unknown; retryAfterMs?: unknown } | null;
    if (body?.ok === true) return answer as T;
    const refusal: PresenceRefusal = {
      ok: false,
      reason: typeof body?.reason === 'string' ? body.reason : null,
    };
    if (typeof body?.retryAfterMs === 'number') refusal.retryAfterMs = body.retryAfterMs;
    return refusal;
  } catch {
    return { ok: false, reason: 'timeout' }; // the ack timed out
  }
};

/** Spread over this window, so tabs refused together do not all ask again at the same moment. */
export const RATE_RETRY_JITTER_MS = 1_000;
/** Used when a rate refusal names no (or a nonsensical) wait; also the longest wait honoured. */
const RATE_RETRY_FALLBACK_MS = 10_000;
const RATE_RETRY_MAX_MS = 120_000;

/**
 * The wait before asking again after a rate refusal (`{ok:false, reason:'rate', retryAfterMs}`),
 * or null when the refusal is not about the rate. A rate refusal says nothing about whether the
 * ask can succeed, so callers do not count it against their retry budget.
 */
export const rateRetryDelay = (answer: {
  ok: boolean;
  reason?: string | null;
  retryAfterMs?: number;
}): number | null => {
  if (answer.ok || answer.reason !== 'rate') return null;
  const wait = answer.retryAfterMs;
  const base =
    typeof wait === 'number' && Number.isFinite(wait) && wait >= 0
      ? Math.min(wait, RATE_RETRY_MAX_MS)
      : RATE_RETRY_FALLBACK_MS;
  return base + Math.random() * RATE_RETRY_JITTER_MS;
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
  emitQuietly((socket) => socket.emit('presence:state', { conversationId, state }));
  if (pending.size > 0) drainTimer = setTimeout(drain, STATE_SEND_GAP_MS);
};

export const presenceClient = {
  /** One batch of ≤ 20 ids (the hook splits). */
  watch: (conversationIds: number[]): Promise<WatchAck | PresenceRefusal> =>
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
    emitQuietly((socket) => {
      for (let start = 0; start < conversationIds.length; start += WATCH_BATCH_SIZE) {
        const batch = conversationIds.slice(start, start + WATCH_BATCH_SIZE);
        socket.emit('presence:unwatch', { conversationIds: batch });
      }
    });
  },

  snapshot: (): Promise<SnapshotAck | PresenceRefusal> => ask<SnapshotAck>('presence:snapshot', {}),
};

export const resetPresenceClientForTests = (): void => {
  pending.clear();
  if (drainTimer !== null) clearTimeout(drainTimer);
  drainTimer = null;
  lastSentAt = Number.NEGATIVE_INFINITY;
};
