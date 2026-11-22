import { stripHtml } from '@/lib/stripHtml';
import type { MessageEvent } from '@/types';
import { channelInSentence } from './messageDetailConstants/labels';

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

/**
 * The transport refused this reply for good (`metadata.sendPermanent === true`, stored with
 * `delivered: false` and removed if it was delivered after all): sending it again cannot help, so
 * no Resend is offered. Read from the event, so it holds after a reload and in every agent's tab.
 * Only the exact boolean counts.
 */
export const isSendPermanent = (event: Pick<MessageEvent, 'metadata'>): boolean =>
  event.metadata?.sendPermanent === true && deliveryStateOf(event) === 'failed';

/**
 * The undelivered reply the composer's next send replaces (`resendOfEventId`). `keepStoredFiles`:
 * the agent's choice about the files stored with that reply (sent as is; absent = the backend's
 * default — they go again only when the send uploads none). See ResendNotice.
 */
export type ResendTarget = { eventId: number; uncertain: boolean; keepStoredFiles?: boolean };

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
      if (current !== target.eventId) return { eventId: current, uncertain };
      // The same reply: the agent's choice about its files stays.
      return uncertain === target.uncertain ? target : { ...target, uncertain };
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
  // (Owner-only and no reply named: nobody's bar — every agent hears the event.)
  if (eventId === null) return ownerId === undefined ? 'as_told' : 'hidden';
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
 * one of the CURRENT AGENT's own replies (`authorId`) that the thread still shows as undelivered
 * and uncertain — any of them, not only the newest (a later failed reply with another text does
 * not make the earlier one safe to repeat); the newest match is the one resent. A reply delivered
 * after all, or replaced by a resend, is not in question. A colleague's reply never counts:
 * sending their words is this agent's own reply.
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
  const matches = thread
    .filter(
      (event) =>
        authorId !== null &&
        event.authorId === authorId &&
        event.type === 'agent_reply' &&
        deliveryStateOf(event) === 'uncertain' &&
        !thread.some((later) => later.metadata?.resendOf === event.id) &&
        sameReplyText(composer, event.content)
    )
    .map((event) => event.id);
  if (matches.length > 0) return Math.max(...matches);
  return failed?.uncertain === true &&
    sameReplyText(composer, failed.text) &&
    isLatestUndelivered(failed.eventId, thread)
    ? failed.eventId
    : null;
};

/**
 * Is this text already on its way? The agent's own reply with the same text that is still being
 * sent (`sendState: 'sending'`), newest first — sending it again now would make a second reply.
 */
export const sameReplySendingId = (
  composer: string,
  thread: readonly Pick<MessageEvent, 'id' | 'type' | 'metadata' | 'content' | 'authorId'>[],
  authorId: number | null
): number | null => {
  if (authorId === null) return null;
  let found: number | null = null;
  for (const event of thread) {
    if (
      event.authorId === authorId &&
      event.type === 'agent_reply' &&
      deliveryStateOf(event) === 'sending' &&
      sameReplyText(composer, event.content) &&
      (found === null || event.id > found)
    )
      found = event.id;
  }
  return found;
};

export const STILL_SENDING = 'This reply is still being sent.';

/** A resend refused because the reply had been delivered after all (REPLY_RESEND_NOT_UNDELIVERED). */
export const ALREADY_DELIVERED =
  'This reply had already been delivered to the customer — nothing was sent again.';

/**
 * The "still being sent" notice: Send was pressed with a reply that is on its way already — the
 * thread shows it as "Sending…" (`eventId`), or the server said so (409, no reply named: then it
 * is the agent's own reply with this text after `afterId`, once the thread shows it).
 */
export type StillSending = {
  threadId: number;
  text: string;
  eventId: number | null;
  afterId: number | null;
};

/**
 * Is that notice still true? Not once the composer holds another text, nor once the reply it is
 * about is no longer being sent (sent, not delivered, or replaced). A reply the thread has not
 * shown yet counts as still on its way.
 */
export const stillSendingShown = (
  notice: StillSending | null,
  threadId: number,
  composer: string,
  thread: readonly Pick<MessageEvent, 'id' | 'type' | 'metadata' | 'content' | 'authorId'>[],
  authorId: number | null
): boolean => {
  if (notice?.threadId !== threadId) return false;
  if (!sameReplyText(composer, notice.text)) return false;
  if (notice.eventId !== null) {
    const named = thread.find((event) => event.id === notice.eventId);
    return named !== undefined && deliveryStateOf(named) === 'sending';
  }
  const own = thread.filter(
    (event) =>
      event.type === 'agent_reply' &&
      authorId !== null &&
      event.authorId === authorId &&
      (notice.afterId === null || event.id > notice.afterId) &&
      sameReplyText(notice.text, event.content)
  );
  return own.length === 0 || own.some((event) => deliveryStateOf(event) === 'sending');
};

/** " via email" / " via WhatsApp" — the channel's name as the app shows it, never its code. */
const via = (channel?: unknown): string => {
  const name = typeof channel === 'string' ? channelInSentence(channel) : '';
  return name ? ` via ${name}` : '';
};

/** The bar's words for a reply that was saved and did not go out (any channel). */
export const notDeliveredText = (channel?: unknown): string =>
  `Reply could not be delivered${via(channel)}. It was saved but not sent.`;

/**
 * The reply's 502 said `retryable: false`: the transport refused this reply for a reason that
 * sending it again cannot change (the address refused, the bot blocked) — so neither Send again
 * nor the bubble's Resend is offered for it, in this tab. Only some of these are stored on the
 * reply (`sendPermanent`, isSendPermanent); a Telegram bot not started or blocked is not, so after
 * a reload that reply offers Resend again (intended: the customer may start the bot).
 */
export const NOT_RETRYABLE =
  'Sending this reply again cannot help, so it is not offered: write a new reply once the cause is dealt with.';

/** The reply's 502 said its files were not saved with it (`warnings: ['files_not_stored']`). */
export const FILES_NOT_KEPT =
  'Its attachments were not saved with it: attach them again when you resend it.';

const UNCERTAIN_START = 'We could not confirm';
/** Is `reason` the "may have reached the customer" wording below? */
export const saysUncertain = (reason: string): boolean => reason.startsWith(UNCERTAIN_START);

/** The bar's words for a send that may have reached the customer (any channel). */
export const uncertainFailureText = (channel?: unknown): string =>
  `${UNCERTAIN_START} that the reply reached the customer${via(channel)}. Check before you send it again — they may get it twice.`;
