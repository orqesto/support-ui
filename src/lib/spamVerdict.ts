/**
 * Is this thread spam now — ONE rule, read by the header, the detail's flags, the action strip,
 * the cards (spine, SLA clock, risk mark), the badges and the triage indicator. A leaf: it imports
 * nothing, so a partial mock of another helper module never hides it from a component.
 */

/**
 * The backend's junk categories (`JUNK_CATEGORIES` in the backend's types/ai.ts): the verdicts that
 * put a thread in the Spam lane and stop its SLA clock. `transactional`, `promotional`,
 * `suspicious` and `legitimate` are NOT junk.
 */
export const JUNK_SPAM_CATEGORIES: readonly string[] = [
  'spam',
  'scam',
  'phishing',
  'security',
  'invalid',
];

export const isJunkSpamCategory = (category: string | null | undefined): boolean =>
  category !== null && category !== undefined && JUNK_SPAM_CATEGORIES.includes(category);

type SpamFields = {
  status?: string;
  isSpam?: boolean;
  spamConfirmedAt?: string | null;
  metadata?: Record<string, unknown> | null;
};

/**
 * Is this thread SPAM now (owner 2026-11-13: a confirmed thread stays spam until approved)?
 *
 * ⛔ The backend's `isSpam` decides. It is the Spam lane's own predicate (`isSpamQueue`): the
 * newest inbound mail's junk category OR a person's confirmation (`spamConfirmedAt`), on a thread
 * that is not resolved or closed. Approving clears the confirmation.
 *
 * A boolean `isSpam` is trusted as sent: the backend also excludes knowledge-base-source threads,
 * which this payload cannot tell. A confirmed thread whose newest mail the classifier called
 * legitimate (staging 2026-10-13) arrives as `isSpam: true` from it.
 *
 * ⚠️ An older backend sends no `isSpam`: only then the confirmation clause and the first mail's
 * frozen `metadata.spamCheck.isSpam` are read, so absent never loses every spam mark.
 */
export const isSpamThread = (message: SpamFields): boolean => {
  // The backend's answer is final: it also applies what this payload cannot see (a
  // knowledge-base-source thread is never in the Spam lane, confirmed or not).
  if (typeof message.isSpam === 'boolean') return message.isSpam;
  // An older backend: the confirmation the lane counts, else the first mail's frozen flag.
  const finished = message.status === 'resolved' || message.status === 'closed';
  if (message.spamConfirmedAt && !finished) return true;
  return (message.metadata?.spamCheck as { isSpam?: boolean } | undefined)?.isSpam === true;
};
