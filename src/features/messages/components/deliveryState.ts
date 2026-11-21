import { stripHtml } from '@/lib/stripHtml';
import type { MessageEvent } from '@/types';

/**
 * Whether an outgoing reply reached the customer, as the backend records it on the event's
 * metadata (owner 2026-11-20: an undelivered reply must stop showing "✓ Sent"):
 * - `sending`: `sendState: 'sending'` — saved, the channel has not answered yet;
 * - `failed`: `delivered: false` — the channel refused it or the send threw;
 * - `uncertain`: `delivered: false` with `sendUncertain` — the send was given up for dead while it
 *   may still have gone out (a takeover after a timeout), so the customer may have it;
 * - `sent`: anything else — every reply sent before these marks existed reads as sent.
 *
 * The backend clears all three marks when a late answer shows the reply did go out.
 */
export type DeliveryState = 'sending' | 'failed' | 'uncertain' | 'sent';

export const deliveryStateOf = (event: Pick<MessageEvent, 'metadata'>): DeliveryState => {
  const meta = event.metadata ?? {};
  if (meta.delivered === false) return meta.sendUncertain === true ? 'uncertain' : 'failed';
  if (meta.sendState === 'sending') return 'sending';
  return 'sent';
};

/** The undelivered reply the composer's next send replaces (`resendOfEventId`). */
export type ResendTarget = { eventId: number; uncertain: boolean };

/** Not delivered, or perhaps not: the states a resend is offered for. */
export const isUndelivered = (state: DeliveryState): boolean =>
  state === 'failed' || state === 'uncertain';

/**
 * A resend target checked against the thread as read (review of #999, M2): the undelivered reply
 * it names, with its current mark; or — when that reply is gone (a failed resend made a NEW
 * undelivered event that replaced it) — the newest undelivered agent reply after it; or null when
 * there is nothing left to resend (delivered after all, or nothing undelivered). The same object
 * when nothing changed.
 */
export const reconcileResendTarget = (
  target: ResendTarget,
  thread: readonly Pick<MessageEvent, 'id' | 'type' | 'metadata'>[]
): ResendTarget | null => {
  // Followed by the backend's own link (review of #999, 2nd round): a resend stores the new
  // attempt with `metadata.resendOf = <old id>` — never "some newer failed reply", which may be a
  // colleague's. Along the chain while the named reply is gone; no successor → the target ends.
  let current = target.eventId;
  for (let hops = 0; hops <= thread.length; hops += 1) {
    const named = thread.find((event) => event.id === current);
    if (named) {
      const state = deliveryStateOf(named);
      // The new attempt still in flight (a read mid-resend) is the target in waiting.
      if (state === 'sending')
        return current === target.eventId ? target : { eventId: current, uncertain: false };
      if (!isUndelivered(state)) return null;
      const uncertain = state === 'uncertain';
      return current === target.eventId && uncertain === target.uncertain
        ? target
        : { eventId: current, uncertain };
    }
    const successor = thread.find((event) => event.metadata?.resendOf === current);
    if (!successor) return null;
    current = successor.id;
  }
  return null;
};

/**
 * What the composer's "Send failed" bar may say, read from the reply it names (review of #999,
 * M3/M4): hidden once that reply shows as delivered or a resend replaced it (a successor names
 * it); kept while it is merely not read yet; worded as uncertain when the reply is marked so. Without a named reply the
 * bar says what the send was told.
 */
export const failedBarState = (
  eventId: number | null,
  thread: readonly Pick<MessageEvent, 'id' | 'metadata' | 'authorId'>[],
  /**
   * Set for a failure only the socket announced, which every agent with the thread open hears:
   * the bar shows only once the named reply is read and is this agent's. A colleague sees the
   * bubble alone.
   */
  ownerId?: number | null
): 'hidden' | 'uncertain' | 'as_told' => {
  if (eventId === null) return 'as_told';
  const named = thread.find((event) => event.id === eventId);
  if (ownerId !== undefined && named?.authorId !== ownerId) return 'hidden';
  // Gone: replaced by a resend (its successor names it) → hidden; not read yet → as told.
  if (!named)
    return thread.some((event) => event.metadata?.resendOf === eventId) ? 'hidden' : 'as_told';
  const state = deliveryStateOf(named);
  if (state === 'sent') return 'hidden';
  return state === 'uncertain' ? 'uncertain' : 'as_told';
};

/**
 * The reply a failed send of this agent made, when no `send-failed` event named it (the socket was
 * down, or the answer was a proxy's 502): the newest agent reply by `authorId` after the newest
 * event on screen when Send was pressed. Null when the thread shows none.
 */
export const ownReplyAfter = (
  thread: readonly Pick<MessageEvent, 'id' | 'type' | 'authorId'>[],
  after: { afterId: number; authorId: number } | null
): number | null => {
  if (after === null) return null;
  let found: number | null = null;
  for (const event of thread) {
    if (
      event.type === 'agent_reply' &&
      event.authorId === after.authorId &&
      event.id > after.afterId &&
      (found === null || event.id > found)
    )
      found = event.id;
  }
  return found;
};

/**
 * The saved, undelivered reply a failed send named — in the send's own 502 answer, in the
 * `send-failed` socket event, or both (merged by event id; `uncertain` once said stays said).
 * `text` is the composer text that send carried: known only from the send itself, so null when
 * only the socket event spoke.
 */
export type FailedSend = {
  threadId: number;
  eventId: number;
  uncertain: boolean;
  text: string | null;
};

/** One more report about a failed send, merged into what is known: the richer state wins. */
export const mergeFailedSend = (known: FailedSend | null, told: FailedSend): FailedSend =>
  known?.threadId === told.threadId && known.eventId === told.eventId
    ? {
        ...known,
        uncertain: known.uncertain || told.uncertain,
        text: told.text ?? known.text,
      }
    : told;

/**
 * Is `eventId` still the thread's latest undelivered agent reply? Not once it shows as delivered,
 * a resend replaced it, or a newer agent reply went undelivered after it. A reply the thread has
 * not read yet counts as still outstanding.
 */
export const isLatestUndelivered = (
  eventId: number,
  thread: readonly Pick<MessageEvent, 'id' | 'type' | 'metadata'>[]
): boolean =>
  failedBarState(eventId, thread) !== 'hidden' &&
  !thread.some(
    (event) =>
      event.id > eventId && event.type === 'agent_reply' && isUndelivered(deliveryStateOf(event))
  );

/**
 * Do two reply texts say the same? Compared as plain text (tags, entities and spacing aside): the
 * composer holds the editor's HTML, a stored reply may be that HTML or plain text. Blank is never
 * "the same".
 */
export const sameReplyText = (
  left: string | null | undefined,
  right: string | null | undefined
): boolean => {
  const text = stripHtml(left ?? '');
  return text !== '' && text === stripHtml(right ?? '');
};

/**
 * The reply a Send of `composer` would send AGAIN although the customer may already have it, or
 * null. The rule that tells a repeat from a new reply: the text is the same (sameReplyText) as
 * the CURRENT AGENT's own latest undelivered reply (`authorId`), and that reply is marked
 * uncertain. A colleague's reply never counts: sending their words is this agent's own reply.
 * Read from the THREAD, so it holds after a reload, on a backend that names no event in its
 * answer, and when only the socket event reported the failure. Before the thread shows the reply
 * (the answer came first), the failed send's own report (`failed`) stands in for it.
 */
export const sendAgainTarget = (
  composer: string,
  thread: readonly Pick<MessageEvent, 'id' | 'type' | 'metadata' | 'content' | 'authorId'>[],
  failed: FailedSend | null,
  authorId: number | null
): number | null => {
  const latest = thread
    .filter(
      (event) =>
        authorId !== null &&
        event.authorId === authorId &&
        event.type === 'agent_reply' &&
        isUndelivered(deliveryStateOf(event))
    )
    .reduce<
      (typeof thread)[number] | null
    >((newest, event) => (newest === null || event.id > newest.id ? event : newest), null);
  if (
    latest &&
    deliveryStateOf(latest) === 'uncertain' &&
    sameReplyText(composer, latest.content)
  ) {
    return latest.id;
  }
  return failed?.uncertain === true &&
    sameReplyText(composer, failed.text) &&
    isLatestUndelivered(failed.eventId, thread)
    ? failed.eventId
    : null;
};

/** The bar's words for a reply that was saved and did not go out (any channel). */
export const notDeliveredText = (channel?: unknown): string =>
  `Reply could not be delivered${
    typeof channel === 'string' && channel ? ` via ${channel}` : ''
  }. The message was saved but not sent — please try again.`;

const UNCERTAIN_START = 'We could not confirm';
/** Is `reason` the "may have reached the customer" wording below? */
export const saysUncertain = (reason: string): boolean => reason.startsWith(UNCERTAIN_START);

/** The bar's words for a send that may have reached the customer (any channel). */
export const uncertainFailureText = (channel?: unknown): string =>
  `${UNCERTAIN_START} that the reply reached the customer${
    typeof channel === 'string' && channel ? ` via ${channel}` : ''
  }. Check before you resend it — they may get it twice.`;
