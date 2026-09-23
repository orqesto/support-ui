import type { Message } from '@/types';

/**
 * Which resolve decision this conversation offers, if any.
 *
 * ONE predicate, read by both the decisions row under the reply (ResolveDecisions) and
 * MessageActionStrip. They used to be the same thing (the strip's footer WAS the resolve
 * control); now the row owns the decision and the strip keeps only the state banners, so if the two read
 * separate conditions a status change could show the button in both places or in neither.
 *
 * The order is the strip's own: a filtered, spam-flagged or suspicious conversation is
 * answered by its banner (Approve / Move to spam / Confirm), never by Resolve.
 *
 * - 'unreviewed' — status 'open' and the customer has not replied: resolving means
 *   dismissing it without a reply (the reject dialog). No KB option — there is no answer
 *   to capture.
 * - 'active' — a conversation in progress: resolve with or without KB capture.
 */
export type ResolveMode = 'unreviewed' | 'active' | null;

export type ResolveModeFlags = {
  isFiltered: boolean;
  isSuspicious: boolean;
  isSpamFlaggedOutsideTriage?: boolean;
  hasLinkedTicket?: boolean;
};

export const getResolveMode = (
  message: Pick<Message, 'status' | 'lastReplyFromClient'>,
  flags: ResolveModeFlags
): ResolveMode => {
  if (flags.isFiltered || flags.isSpamFlaggedOutsideTriage || flags.isSuspicious) return null;

  // A customer reply makes this ACTIVE even while the status is still 'open' — the
  // status→client_replied transition does not fire on every ingest path.
  const clientReplied = message.lastReplyFromClient === true;

  if (message.status === 'open' && !clientReplied) return 'unreviewed';

  if (message.status !== 'resolved' && message.status !== 'closed' && !flags.hasLinkedTicket) {
    return 'active';
  }
  return null;
};

/**
 * Which confirm dialog the one-press Resolve opens. The SAME dialogs the old footer's
 * "Resolve (no KB)" opened, so moving the control to the header adds no path to the backend:
 * an unreviewed thread is dismissed through the reject dialog, an active one closes.
 */
export const noKbResolveDialog = (mode: Exclude<ResolveMode, null>): 'reject' | 'closeConfirm' =>
  mode === 'unreviewed' ? 'reject' : 'closeConfirm';
