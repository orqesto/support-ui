import { isOutgoingEvent } from '@/lib/messageHelpers';
import type { MessageEvent } from '@/types';

/**
 * A live message on an open thread (`thread:message`) is read on its own (`afterEventId`) and
 * appended, instead of re-reading the 300-event window plus every side panel. These decide what
 * else such a message makes stale.
 */

/** The newest event id on screen — where an incremental read starts. */
export const maxEventId = (events: readonly { id: number }[]): number | null => {
  let max: number | null = null;
  for (const event of events) if (max === null || event.id > max) max = event.id;
  return max;
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
