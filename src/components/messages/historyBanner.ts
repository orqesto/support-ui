import type { MessageEvent } from '@/types';

/**
 * Should the thread view warn "this thread starts with an outbound message — older history may
 * be missing"?
 *
 * ⛔ Only when WE did not write the first message here. An agent can start a thread from
 * **Compose new** — a direct message to a customer, not a reply — and for that thread there is no
 * older history to be missing: the product created it. Warning about it tells an agent their own
 * outreach may be incomplete and sends them hunting in a mailbox for a message that never existed.
 *
 * 🔑 The signal is the one the BACKEND already uses for exactly this distinction, not a new one.
 * `composeNewService` stamps `authorId: userId` on the event it creates, and
 * `reconcileOrphanOutgoing` marks a thread one-sided only when the outbound has **no** `author_id`
 * and **no** `metadata.repliedBy` — i.e. it was imported from the mailbox rather than sent through
 * the app. `oneSidedOutbound.ts` exists because "a fourth private definition is how this broke",
 * and this banner was one of those definitions: a bare `type !== 'inbound'` that knew nothing about
 * authorship.
 *
 * ⚠️ An imported outbound-first thread still gets the banner — that is the case it was built for,
 * and there the warning is right. Measured on staging 2026-09-21: **914** outbound-first threads,
 * not one of them carrying an author, so this change removes the banner from none of them. It bites
 * where agents compose, which staging has never done (0 compose events) and prod is unmeasured.
 *
 * ⚠️ A thread opened by an AUTOMATED outbound (`bot_reply`, no author) still gets the banner. No
 * such thread exists on staging — every one of the 914 is an `agent_reply` — so the shape has never
 * been observed, and inventing a predicate for it would be a fifth private definition.
 */
export const shouldShowHistoryBanner = (sortedThread: MessageEvent[]): boolean => {
  const firstEvent = sortedThread[0];
  if (!firstEvent) return false;
  if (firstEvent.type === 'inbound') return false;
  const metadata = (firstEvent.metadata ?? null) as { repliedBy?: unknown } | null;
  // `typeof === 'number'` rather than a null check: the id arrives from JSON, and a value that is
  // neither a number nor absent is not evidence that a teammate sent this.
  const hasAuthor = typeof firstEvent.authorId === 'number';
  const repliedBy = metadata?.repliedBy;
  const hasRepliedBy = repliedBy !== null && repliedBy !== undefined;
  return !(hasAuthor || hasRepliedBy);
};
