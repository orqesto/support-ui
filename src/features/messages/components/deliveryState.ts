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
  thread: readonly Pick<MessageEvent, 'id' | 'metadata'>[]
): 'hidden' | 'uncertain' | 'as_told' => {
  if (eventId === null) return 'as_told';
  const named = thread.find((event) => event.id === eventId);
  // Gone: replaced by a resend (its successor names it) → hidden; not read yet → as told.
  if (!named)
    return thread.some((event) => event.metadata?.resendOf === eventId) ? 'hidden' : 'as_told';
  const state = deliveryStateOf(named);
  if (state === 'sent') return 'hidden';
  return state === 'uncertain' ? 'uncertain' : 'as_told';
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
