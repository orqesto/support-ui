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
 * The confirmation clause is the same one the backend applies, so a thread a person confirmed is
 * spam here even on a payload whose flag says otherwise (a confirmed thread whose newest mail the
 * classifier called legitimate sat in Spam with no mark at all, staging 2026-10-13).
 *
 * ⚠️ An older backend sends no `isSpam`: only then the first mail's frozen
 * `metadata.spamCheck.isSpam` is read (`??`, so absent never loses every spam mark).
 */
export const isSpamThread = (message: SpamFields): boolean => {
  const finished = message.status === 'resolved' || message.status === 'closed';
  if (message.spamConfirmedAt && !finished) return true;
  return (
    message.isSpam ??
    (message.metadata?.spamCheck as { isSpam?: boolean } | undefined)?.isSpam === true
  );
};
