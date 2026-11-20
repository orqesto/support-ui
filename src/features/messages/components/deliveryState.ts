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
 * Whether the reply an async failure named is shown as delivered after all (the backend cleared
 * its marks on a late answer): the composer's "Send failed" bar would then contradict the bubble.
 */
export const failedReplyDelivered = (
  eventId: number | null,
  thread: readonly Pick<MessageEvent, 'id' | 'metadata'>[]
): boolean =>
  eventId !== null &&
  thread.some((event) => event.id === eventId && deliveryStateOf(event) === 'sent');
