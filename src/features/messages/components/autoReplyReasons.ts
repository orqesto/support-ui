/**
 * Why an automatic reply was held, or how it ended — every reason code the backend writes on an
 * automatic reply's record (`details.reason` of `message.auto_reply_sent` / `_withheld`: the email
 * AI reply, a keyword rule, the missing-info question, the Telegram bot, the website chat), in
 * words. Each reads after "…: " or "because ". A code is never shown: one this bundle does not
 * know reads as AUTO_REPLY_REASON_UNKNOWN.
 */
export const AUTO_REPLY_REASON_UNKNOWN = 'it was held for a person';

export const WOULD_SEND = 'would_send';

const REASON: Record<string, string> = {
  // Check-only mode: the reply passed every check and was kept as the draft instead of sent.
  [WOULD_SEND]: 'it passed every check and would have been sent — check-only mode',
  // The send gate (the check every automatic reply passes).
  restricted_topic: 'the customer asks about a subject a person must answer',
  reply_unchecked: 'the reply could not be checked',
  needs_lookup_or_action: 'answering needs a lookup or an action',
  no_customer_request: 'the message is not a customer request',
  promises_follow_up: 'the reply promised a follow-up',
  does_not_answer: 'the reply did not answer the question',
  unsupported_by_sources: 'the reply said more than the knowledge base does',
  not_from_knowledge: 'the reply was not written from the knowledge base',
  spam_verdict: 'the spam check has not cleared this message',
  refusal: 'the reply only declined the question',
  refusal_held: 'the reply only declined the question',
  blocked_gate: 'a send rule held the reply',
  // Before the gate.
  low_confidence: 'the AI was not sure enough of its answer',
  partial_answer: 'the AI could answer only some of the questions',
  plan_not_entitled: 'the plan does not include automatic replies',
  plan_allotment_reached: "this month's automatic replies are used up",
  sender_reply_limit:
    'this sender already got the most automatic replies allowed in an hour or a day',
  newer_message: 'the customer wrote again before the reply went out',
  send_failed: 'the reply could not be sent',
  thread_locked: 'another reply was in progress',
  several_rules: 'more than one keyword rule matched',
  // `gate:<outcome>`: the automatic-reply settings stopped it.
  blocked_source_link: "automatic replies are switched off for this mailbox's team",
  blocked_dept_setting: 'automatic replies are switched off for this team',
  blocked_escalation_phrase:
    "the customer's message contains a phrase that stops automatic replies",
  blocked_reply_hygiene: 'the reply did not pass the checks every automatic reply passes',
  // The Telegram bot's turn and the website chat.
  answered: 'the bot answered',
  success: 'the bot answered',
  rule_based_fallback: 'the AI was not available, so a fixed reply was used',
  no_knowledge_offered_support: 'the knowledge base had no answer, so the bot offered a person',
  low_confidence_offered_support: 'the bot was not sure enough, so it offered a person',
  out_of_scope: 'the question is outside what the bot answers',
  out_of_scope_held: 'the question is outside what the bot answers',
  no_answer: 'the bot had no answer',
  clarification_needed: 'the bot needed the customer to say more',
  escalation_requested: 'the customer asked for a person',
  escalation_confirmed: 'the customer asked for a person',
  delayed_escalation_confirmed: 'the customer asked for a person',
  handed_off: 'the chat was handed to the team',
  order_status: 'the customer asked about an order',
  flood: 'too many messages arrived at once',
  error: 'the bot ran into an error',
};

/** The codes with words of their own (the test walks the backend contract's list against it). */
export const KNOWN_AUTO_REPLY_REASONS: readonly string[] = Object.keys(REASON);

/** `plan-not-entitled`, `gate:blocked_dept_setting`, `send_gate:not_from_knowledge` → the bare code. */
const bare = (reason: string): string =>
  reason.replace(/^(send_gate|gate):/, '').replace(/-/g, '_');

/** The words for a reason code, or null when this bundle has none. */
export const autoReplyReasonWords = (reason: string | null | undefined): string | null => {
  if (typeof reason !== 'string' || reason === '') return null;
  const code = bare(reason);
  return Object.prototype.hasOwnProperty.call(REASON, code) ? REASON[code] : null;
};

/** …or AUTO_REPLY_REASON_UNKNOWN: never the code. */
export const autoReplyReasonLabel = (reason: string | null | undefined): string =>
  autoReplyReasonWords(reason) ?? AUTO_REPLY_REASON_UNKNOWN;

/** The reasons the Audit Logs filter offers, most asked-for first. */
export const AUTO_REPLY_REASON_FILTERS: ReadonlyArray<{ value: string; label: string }> = [
  { value: WOULD_SEND, label: 'Would have been sent (check-only mode)' },
  { value: 'restricted_topic', label: 'Restricted topic' },
  { value: 'reply_unchecked', label: 'Reply could not be checked' },
  { value: 'needs_lookup_or_action', label: 'Needs a lookup or an action' },
  { value: 'no_customer_request', label: 'Not a customer request' },
  { value: 'promises_follow_up', label: 'Reply promised a follow-up' },
  { value: 'does_not_answer', label: 'Reply did not answer the question' },
  { value: 'unsupported_by_sources', label: 'Reply went beyond the knowledge base' },
  { value: 'not_from_knowledge', label: 'Reply not from the knowledge base' },
  { value: 'low_confidence', label: 'AI not sure enough' },
  { value: 'partial_answer', label: 'Only some questions answered' },
  { value: 'refusal', label: 'Reply only declined the question' },
  { value: 'spam_verdict', label: 'Spam check not cleared' },
  { value: 'sender_reply_limit', label: 'Too many automatic replies to one sender' },
  { value: 'plan_not_entitled', label: 'Plan does not include automatic replies' },
  { value: 'plan_allotment_reached', label: "Month's automatic replies used up" },
  { value: 'newer_message', label: 'Customer wrote again first' },
  { value: 'send_failed', label: 'Reply could not be sent' },
];

/** Where an automatic reply went out, as the record's `channel` names it. */
export const AUTO_REPLY_CHANNEL_LABEL: Record<string, string> = {
  email: 'Email',
  telegram: 'Telegram',
  chat_widget: 'Website chat',
};

/**
 * Why a SENT reply was allowed to go (`allowedBy` on the record and on the reply's event):
 * `passed` = the check every automatic reply passes let it through (with the AI's confidence and
 * the workspace's threshold, when stored, as 0–1); `fixed_text` = a person's own text, sent as is.
 * Null when the record does not say.
 */
export const allowedByWords = (allowedBy: unknown): string | null => {
  if (!allowedBy || typeof allowedBy !== 'object') return null;
  const { gate, confidence, threshold } = allowedBy as Record<string, unknown>;
  if (gate === 'fixed_text') return 'a fixed text written by your team, sent as it is';
  if (gate !== 'passed') return null;
  const percent = (value: unknown): string | null =>
    typeof value === 'number' && Number.isFinite(value)
      ? `${Math.round(value <= 1 ? value * 100 : value)}%`
      : null;
  const sure = percent(confidence);
  const needed = percent(threshold);
  const numbers = sure ? ` (confidence ${sure}${needed ? `, needed ${needed}` : ''})` : '';
  return `it passed the check every automatic reply goes through${numbers}`;
};
