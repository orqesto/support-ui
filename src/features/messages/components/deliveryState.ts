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
  const named = thread.find((event) => event.id === target.eventId);
  if (named) {
    const state = deliveryStateOf(named);
    if (!isUndelivered(state)) return null;
    const uncertain = state === 'uncertain';
    return uncertain === target.uncertain ? target : { ...target, uncertain };
  }
  let newest: Pick<MessageEvent, 'id' | 'metadata'> | null = null;
  for (const event of thread)
    if (
      event.type === 'agent_reply' &&
      event.id > target.eventId &&
      isUndelivered(deliveryStateOf(event)) &&
      (newest === null || event.id > newest.id)
    )
      newest = event;
  return newest ? { eventId: newest.id, uncertain: deliveryStateOf(newest) === 'uncertain' } : null;
};

/**
 * What the composer's "Send failed" bar may say, read from the reply it names (review of #999,
 * M3/M4): hidden once that reply shows as delivered or is gone from the thread (a colleague's
 * resend replaced it); worded as uncertain when the reply is marked so. Without a named reply the
 * bar says what the send was told.
 */
export const failedBarState = (
  eventId: number | null,
  thread: readonly Pick<MessageEvent, 'id' | 'metadata'>[]
): 'hidden' | 'uncertain' | 'as_told' => {
  if (eventId === null) return 'as_told';
  const named = thread.find((event) => event.id === eventId);
  if (!named) return 'hidden';
  const state = deliveryStateOf(named);
  if (state === 'sent') return 'hidden';
  return state === 'uncertain' ? 'uncertain' : 'as_told';
};

/** The bar's words for a send that may have reached the customer (any channel). */
export const uncertainFailureText = (channel?: unknown): string =>
  `We could not confirm that the reply reached the customer${
    typeof channel === 'string' && channel ? ` via ${channel}` : ''
  }. Check before you resend it — they may get it twice.`;
