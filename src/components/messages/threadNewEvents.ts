import { isOutgoingEvent } from '@/lib/messageHelpers';
import type { MessageEvent } from '@/types';

/**
 * A live message on an open thread (`thread:message`) is read on its own (`afterEventId`) and
 * appended, instead of re-reading the 300-event window plus every side panel. These decide what
 * else such a message makes stale.
 */

/** How many of the newest events on screen an incremental read asks for again. */
export const CURSOR_LAG = 20;

/**
 * Where an incremental read starts (`afterEventId`; the server sends `id > afterEventId`).
 *
 * Not the newest id: ids are handed out when a save STARTS, so an event with a lower id can commit
 * after one with a higher id — reading strictly after the newest would skip it until the next full
 * read. Starting CURSOR_LAG events back re-reads those few; the ones already on screen are
 * dropped by id (unseenEvents).
 *
 * null → do a full read: nothing is on screen, or the only row is the stand-in the endpoint sends
 * for a thread with no events (it carries the CONVERSATION's id, not an event's).
 */
export const incrementalCursor = (
  events: readonly { id: number }[],
  conversationId: number
): number | null => {
  if (events.length === 0) return null;
  if (events.length === 1 && events[0]?.id === conversationId) return null;
  const ids = events.map((event) => event.id).sort((left, right) => right - left);
  return ids[Math.min(CURSOR_LAG, ids.length) - 1] ?? null;
};

/** The incoming events not already on screen (a read can overlap one in flight). */
export const unseenEvents = (
  current: readonly { id: number }[],
  incoming: readonly MessageEvent[]
): MessageEvent[] => {
  const seen = new Set(current.map((event) => event.id));
  const out: MessageEvent[] = [];
  for (const event of incoming) {
    if (seen.has(event.id)) continue;
    seen.add(event.id);
    out.push(event);
  }
  return out;
};

/**
 * Could this event have brought files (the thread's attachment list then needs a re-read)?
 *
 * The thread endpoint carries no attachment field today, so an explicit marker in the event's
 * metadata decides when present; otherwise an incoming message may carry files and our own side
 * (the bot's answer) does not — files the app sends are uploaded by a send, which re-reads fully.
 */
export const eventMayCarryAttachments = (event: MessageEvent): boolean => {
  const meta = (event.metadata ?? {}) as {
    hasAttachments?: unknown;
    attachmentCount?: unknown;
    attachments?: unknown;
  };
  if (typeof meta.hasAttachments === 'boolean') return meta.hasAttachments;
  if (typeof meta.attachmentCount === 'number') return meta.attachmentCount > 0;
  if (Array.isArray(meta.attachments)) return meta.attachments.length > 0;
  return !isOutgoingEvent(event);
};

/**
 * Does this event name someone Reply all does not know yet — its writer (`replyTarget`) or a
 * person copied on it? `to` is left out: on an incoming mail it is our own mailbox, which the
 * participant list never holds, so it would re-read on every message.
 */
export const eventAddsParticipant = (event: MessageEvent, participants: readonly string[]) => {
  if (isOutgoingEvent(event)) return false;
  const known = new Set(participants.map((address) => address.trim().toLowerCase()));
  const named = [...(event.replyTarget ?? []), ...(event.recipients?.cc ?? [])];
  return named.some((address) => !known.has(address.trim().toLowerCase()));
};
