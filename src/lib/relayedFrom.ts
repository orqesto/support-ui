import type { MessageEvent } from '@/types';

/**
 * Who wrote a message whose envelope names a machine.
 *
 * A website contact form mails the shop from its own address — `mailer@shopify.com`, or
 * the mailbox itself — and puts the person only in the body. Ingestion recovers that
 * person and stamps `relayedFrom` on the EVENT (per message, because one thread can hold
 * submissions from several different people); the history repair does the same for stored
 * mail.
 *
 * ⛔ `authorEmail` is never overwritten with the customer. It is the record of who
 * transmitted the mail, and the backend reads it to decide direction, fusion and which
 * rows a repair still has to visit. So every surface shows BOTH facts: the person, and
 * what it came through.
 *
 * Lives here rather than in a component because more than one surface renders a
 * customer's identity — the ticket-detail bubble and the Q&A pair view — and the first
 * pass at this shipped with only one of them fixed. One reader, so they cannot drift.
 */

/**
 * `"Orbelli (Shopify)" <mailer@shopify.com>` → `mailer@shopify.com`.
 *
 * Comparing the bare address is the point: the stored header keeps its display name, and
 * a comparison against the raw string would never match, so the label would fire on
 * ordinary mail and render "X · via X".
 */
export const bareAddress = (value?: string | null): string =>
  (value?.match(/<([^>]+)>/)?.[1] ?? value ?? '').trim().toLowerCase();

export type RelayedFromLabel = {
  /** The recovered correspondent. */
  email: string;
  /** The form's own `Name:` field, when it carried one. */
  name: string | null;
  /** The bare envelope address the message actually arrived through. */
  via: string;
};

/**
 * The label for a message, or null when there is nothing to say.
 *
 * Null in three cases, and each matters:
 *   - nothing was stamped — ordinary mail, which must render exactly as it always did;
 *   - the stamp names the envelope sender itself. The repair stamps this key on rows it
 *     recovered from the envelope (`inbound-author-backfill`), and those are already
 *     correct — a label would read "someone · via someone";
 *   - the message has no envelope address at all, so there is no "via" to name.
 */
export const relayedFromLabel = (msg: Pick<MessageEvent, 'authorEmail' | 'metadata'>) => {
  const via = bareAddress(msg.authorEmail);
  const stamped = (
    msg.metadata as { relayedFrom?: { email?: string; name?: string | null } } | null
  )?.relayedFrom;
  const email = stamped?.email?.trim();
  if (!email || !via || email.toLowerCase() === via) return null;
  return {
    email,
    name: stamped?.name?.trim() ? stamped.name.trim() : null,
    via,
  } satisfies RelayedFromLabel;
};
