import type { Message } from '@/types';
import { isSuspiciousThread } from '@/lib/messageHelpers';
import { getResolveMode } from '../resolveMode';
import { isSpamThread } from '../inboxCardHelpers';

/** What the thread's state allows: triage verdicts, whether it is active, how it resolves. */
export function deriveThreadFlags(message: Message) {
  const isFiltered = message.status === 'filtered';
  // The Suspicious queue's own answer (newest inbound verdict), the snapshot only as a fallback.
  const isSuspicious = isSuspiciousThread(message);
  /**
   * Carries a spam verdict WITHOUT being in one of the triage states that offer a way to undo it.
   *
   * `isSpam: true` with `status: 'open'` is reachable, and it is the worst of both: the verdict
   * hides the conversation from the work queue, the header shows a red SPAM badge, and neither
   * the action strip nor the ACTIONS menu offered anything to correct it. A real customer sat
   * behind that state for a month on a client deployment with no button to press.
   *
   * The verdict is the NEWEST inbound mail's (`isSpamThread`: the backend's `isSpam`, the first
   * mail's frozen `metadata.spamCheck` only when an older backend sends no flag) — the same one the
   * header badge and the strip's Approve read. A thread whose first mail was spam and whose newest
   * mail is clean is not flagged.
   */
  const isSpamFlaggedOutsideTriage = !isFiltered && !isSuspicious && isSpamThread(message);
  const isActive =
    !isFiltered && !isSuspicious && !isSpamFlaggedOutsideTriage && message.status !== 'closed';
  // One predicate for the decisions row AND the strip, so the decision can never show
  // in both places or in neither (resolveMode.ts). `hasLinkedTicket` matches the strip's call.
  const resolveMode = getResolveMode(message, {
    isFiltered,
    isSuspicious,
    isSpamFlaggedOutsideTriage,
    hasLinkedTicket: false,
  });
  const ghostVisible = message.status !== 'resolved';

  const autoReply = message.metadata?.autoReply as { sent?: boolean } | undefined;
  return {
    isFiltered,
    isSuspicious,
    isSpamFlaggedOutsideTriage,
    isActive,
    resolveMode,
    ghostVisible,
    autoReply,
  };
}
