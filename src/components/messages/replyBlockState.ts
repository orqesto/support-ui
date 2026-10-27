/**
 * What the composer should do when a thread cannot be answered from Odly at all.
 *
 * Today the only producer is a Telegram conversation imported from Zendesk: the export
 * never carried the customer's Telegram id, so no reply sent here can reach them. The
 * backend marks such threads `replyBlock` on the detail payload (same contract as
 * `whatsappWindow` — absent means "does not apply", not "unknown") and refuses the send
 * with a 409, so without this the agent writes a whole reply and only then learns it
 * cannot be delivered.
 */
import type { ComposerWindowState } from './whatsappWindowState';

export type ReplyBlock = {
  /** Machine-readable reason — checked before copy is trusted. */
  reason: string;
  /** Server-authored notice rendered above the composer. */
  message: string;
};

/**
 * Decide whether the composer is blocked by a `replyBlock` mark.
 *
 * Same note carve-out as the WhatsApp window: an internal note is never delivered to
 * the customer, so it stays writable — an agent must be able to record "answered in
 * Zendesk" on exactly the threads this block applies to.
 */
export const resolveReplyBlock = (
  replyBlock: ReplyBlock | null | undefined,
  mode: 'reply' | 'note'
): ComposerWindowState => {
  const idle: ComposerWindowState = { blocked: false, notice: null, remaining: null, tone: 'none' };

  // FE/BE skew guard: the field is optional, and a malformed payload must not block
  // a reply that could have worked — only trust a real message string.
  if (!replyBlock || typeof replyBlock.message !== 'string' || replyBlock.message === '') {
    return idle;
  }
  if (mode === 'note') return idle;

  return { blocked: true, notice: replyBlock.message, remaining: null, tone: 'blocked' };
};
