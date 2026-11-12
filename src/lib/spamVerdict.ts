/**
 * Is this thread spam now — the one rule (owner 2026-11-13). A leaf: it imports nothing, so a
 * partial mock of `@/lib/messageHelpers` (which re-exports it) never hides it from a component.
 */

/**
 * The NEWEST inbound mail's spam verdict: the backend's `isSpam` (the Spam lane's own predicate),
 * the first mail's frozen `metadata.spamCheck.isSpam` only when an older backend sends no flag.
 * An agent's earlier confirmation (`spamConfirmedAt`) does not override a newer clean mail.
 */
export const newestSpamVerdict = (message: {
  isSpam?: boolean;
  metadata?: Record<string, unknown> | null;
}): boolean =>
  message.isSpam ??
  (message.metadata?.spamCheck as { isSpam?: boolean } | undefined)?.isSpam === true;

/**
 * Is this thread SPAM now? The one rule the header, the detail's flags, the cards (spine, SLA
 * clock, risk mark) and the badges all read (owner 2026-11-13).
 *
 * ⛔ The NEWEST inbound mail's verdict (`newestSpamVerdict`): the backend's `isSpam`, resolved
 * from the newest inbound event like the Spam lane, the frozen first-mail copy only when an older
 * backend sends no flag. ⚠️ `??`, so absent keeps the old behaviour instead of losing every mark.
 *
 * ⛔ A PERSON's confirmation counts while the thread is still in the Spam lane (`filtered`):
 * "Resolve as spam" on a thread the AI read as legitimate leaves `isSpam` false, and the confirmed
 * thread sat in Spam with no mark at all (staging, 2026-10-13). Once the thread is back in work
 * (a newer clean mail, or moved to Open), the old confirmation no longer outweighs the newest mail.
 */
export const isSpamThread = (message: {
  status?: string;
  isSpam?: boolean;
  spamConfirmedAt?: string | null;
  metadata?: Record<string, unknown> | null;
}): boolean =>
  newestSpamVerdict(message) || (!!message.spamConfirmedAt && message.status === 'filtered');
