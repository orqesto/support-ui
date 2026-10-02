/**
 * The vocabulary of a bulk run, and the words an agent reads.
 *
 * ⛔ The eligibility RULES are not here. They live on the server
 * (`bulkEligibility.ts`) and reach this UI through `POST /api/messages/bulk/preview`. A second
 * copy in the browser would drift, and the drift is invisible: the button stays enabled while
 * the server refuses. What this file owns is the language — one sentence per refusal reason,
 * so "3 threads skipped" is never all an agent is told.
 */

export const BULK_ACTIONS = [
  'resolve',
  'resolve_kb',
  'spam',
  'assign',
  'create_ticket',
  'mark_read',
  'mark_unread',
] as const;
export type BulkAction = (typeof BULK_ACTIONS)[number];

export type RefusalReason =
  | 'not_a_conversation'
  | 'out_of_scope'
  | 'already_resolved'
  | 'in_spam'
  | 'needs_routing'
  | 'not_customer_work'
  | 'no_reply_to_save'
  | 'already_has_ticket'
  | 'already_confirmed_spam'
  | 'security_threat'
  | 'already_read'
  | 'already_unread'
  | 'not_triage';

export type BulkPreview = {
  action: BulkAction;
  eligible: number[];
  refused: Array<{ id: number; reason: RefusalReason }>;
  /**
   * `create_ticket`: eligible threads already on another ticket — they will be on both (a thread
   * can report several incidents, 2026-09-30). Absent from an older backend, which refused them
   * instead (`already_has_ticket`); read it as `?? []`.
   */
  alsoInTicket?: number[];
};

export type BulkResult = Omit<BulkPreview, 'eligible'> & {
  applied: number[];
  failed: Array<{ id: number; error: string }>;
  ticketId?: number;
  kbJobsQueued?: number;
};

/** What the agent sees on the button. */
export const ACTION_LABEL: Record<BulkAction, string> = {
  resolve: 'Resolve',
  resolve_kb: 'Resolve & save to KB',
  spam: 'Mark as spam',
  assign: 'Assign',
  create_ticket: 'Create one ticket',
  mark_read: 'Mark read',
  mark_unread: 'Mark unread',
};

/**
 * Why a thread was left out, in the agent's language rather than the API's.
 *
 * Each one says what is true of the thread, not what the code checked — "nobody has answered
 * it yet, so there is nothing to save" rather than "no_reply_to_save". A reason the agent
 * cannot act on is worse than no reason at all.
 */
export const REFUSAL_TEXT: Record<RefusalReason, string> = {
  // The server sends this for any id it can no longer load in this workspace (bulkRows: org +
  // not deleted). spamlog_ cards have no checkbox, so in practice it is a thread someone else
  // deleted or merged after it was selected.
  // Count-neutral like every other reason here: it is shown after a number ("3 no longer …").
  not_a_conversation: 'no longer available — deleted or merged after selection',
  out_of_scope: 'in a department you do not have access to',
  already_resolved: 'already resolved or closed',
  in_spam: 'in the spam lane',
  needs_routing: 'still waiting to be routed to a department',
  not_customer_work: 'marked as not customer work',
  no_reply_to_save: 'nobody has answered it yet, so there is nothing to save',
  already_has_ticket: 'already belongs to a ticket',
  already_confirmed_spam: 'already confirmed as spam',
  security_threat: 'flagged as a security threat — look at it yourself',
  already_read: 'already read',
  already_unread: 'already unread',
  not_triage: 'not in triage — read and unread apply to triage threads only',
};

/** For a reason the server sends before this build knows its words (BE and FE ship apart). */
const UNKNOWN_REFUSAL_TEXT = 'not eligible for this action';

/**
 * Group refusals so the confirm step reads "3 have no answer yet" rather than listing three
 * ids. Ordered by size, so the biggest reason for a short selection is the first line.
 */
export const groupRefusals = (
  refused: BulkPreview['refused']
): Array<{ reason: RefusalReason; count: number; text: string }> => {
  const counts = new Map<RefusalReason, number>();
  for (const entry of refused) counts.set(entry.reason, (counts.get(entry.reason) ?? 0) + 1);
  return [...counts.entries()]
    .map(([reason, count]) => ({
      reason,
      count,
      text: (REFUSAL_TEXT as Partial<Record<string, string>>)[reason] ?? UNKNOWN_REFUSAL_TEXT,
    }))
    .sort((left, right) => right.count - left.count);
};

/**
 * The sentence under an action in the confirm step.
 *
 * ⛔ Says how many of how many, always — "12 of 15" and "15 of 15" are different facts, and an
 * agent about to resolve fifteen threads should be able to tell them apart at a glance.
 */
export const describeScope = (eligible: number, selected: number): string =>
  eligible === selected
    ? `all ${selected} selected`
    : `${eligible} of ${selected} selected`;

/**
 * The sentence the confirm step builds: "This will <phrase> 12 of 15 selected."
 *
 * ⛔ Written out rather than lower-casing `ACTION_LABEL`, which produced "resolve & save to kb"
 * — an acronym mangled into a word. A label and a sentence are different registers and one
 * cannot be derived from the other by `.toLowerCase()`.
 */
export const ACTION_PHRASE: Record<BulkAction, string> = {
  resolve: 'resolve',
  resolve_kb: 'resolve and save to the knowledge base',
  spam: 'move to spam',
  assign: 'assign',
  create_ticket: 'put under one new ticket',
  mark_read: 'mark as read',
  mark_unread: 'mark as unread',
};

/**
 * Options an action needs before it can run. The action bar uses this to decide whether
 * pressing it opens a dialog that asks for something, or just confirms.
 */
export const NEEDS_INPUT: Record<BulkAction, 'title' | 'assignee' | null> = {
  resolve: null,
  resolve_kb: null,
  spam: null,
  assign: 'assignee',
  create_ticket: 'title',
  mark_read: null,
  mark_unread: null,
};
