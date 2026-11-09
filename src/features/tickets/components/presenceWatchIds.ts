import type { Message } from '@/types';

/** Used until the server's `ticketWatchCap` arrives with the first watch ack. */
export const DEFAULT_TICKET_WATCH_CAP = 50;

const activityAt = (message: Message): number =>
  Math.max(
    ...[message.updatedAt, message.lastReplyAt, message.createdAt].map((stamp) =>
      stamp ? Date.parse(stamp) || 0 : 0
    )
  );

/** The `cap` most recently active threads of a ticket (ids, newest first) and how many it has. */
export const presenceWatchIds = (
  messages: Message[],
  cap: number
): { ids: number[]; total: number } => {
  const ids = [...messages]
    .sort((left, right) => activityAt(right) - activityAt(left) || right.id - left.id)
    .slice(0, cap)
    .map((message) => message.id);
  return { ids, total: messages.length };
};
