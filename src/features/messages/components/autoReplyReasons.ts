/**
 * Why an automatic reply was held, or how it ended — every reason code the backend writes on an
 * automatic reply's record (`details.reason` of `message.auto_reply_sent` / `_withheld`: the email
 * AI reply, a keyword rule, the missing-info question, the Telegram bot, the website chat), in
 * words. Each reads after "…: " or "because ". A code is never shown: one this bundle does not
 * know reads as AUTO_REPLY_REASON_UNKNOWN.
 */
export const AUTO_REPLY_REASON_UNKNOWN = 'it was held for a person';

export const WOULD_SEND = 'would_send';

/**
 * `restricted_topic`: a restricted topic, or the built-in amount rule (it records this code by
 * design). A listed phrase has its own code since 2026-11-25, so a held phrase is not named here.
 */
const RESTRICTED_OR_AMOUNT =
  'the customer asks about a restricted topic, or the reply states an amount with a unit of measure';

const REASON: Record<string, string> = {
  // Check-only mode: the reply passed every check and was kept as the draft instead of sent.
  [WOULD_SEND]: 'it passed every check and would have been sent — check-only mode',
  // The send gate (the check every automatic reply passes). One code for a restricted topic and
  // for the built-in amount rule (which keeps this code by design): the record's `why` says which.
  // A listed phrase has its own code (`hold_phrase`), so it is not named here.
  restricted_topic: RESTRICTED_OR_AMOUNT,
  // A phrase of the workspace's own "Hold automatic replies that contain…" list: its own code since
  // 2026-11-25 (older records carry `restricted_topic`). The record's `heldPhrase` names it.
  hold_phrase: 'the reply contains a phrase this workspace holds',
  reply_unchecked: 'the reply could not be checked',
  needs_lookup_or_action: 'answering needs a lookup or an action',
  no_customer_request: 'the message is not a customer request',
  promises_follow_up: 'the reply promised a follow-up',
  does_not_answer: 'the reply did not answer the question',
  unsupported_by_sources: 'the reply said more than the knowledge base does',
  not_from_knowledge: 'the reply was not written from the knowledge base',
  spam_verdict: 'the spam check has not cleared this message',
  // A thread with a team, the answer from another team's knowledge (2026-11-23).
  source_other_team: "the reply was written from another team's knowledge",
  refusal: 'the reply only declined the question',
  refusal_held: 'the reply only declined the question',
  // The website chat's hold of a reply that only declined (its review reason, as on email).
  blocked_gate: 'the reply only declined the question',
  // Before the gate.
  low_confidence: 'the AI was not sure enough of its answer',
  partial_answer: 'the AI could answer only some of the questions',
  plan_not_entitled: 'the plan does not include automatic replies',
  plan_allotment_reached: "this month's automatic replies are used up",
  sender_reply_limit:
    'this sender already got the most automatic replies allowed in an hour or a day',
  newer_message: 'the customer wrote again before the reply went out',
  send_failed: 'the reply could not be sent',
  // The settings are read again right before the send: switched off or narrowed meanwhile.
  settings_changed:
    'automatic replies were switched off or narrowed just before it would have gone out',
  plan_limit: "the plan's limit on automatic replies was reached",
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
  order_status_during_handoff: 'the customer asked about an order',
  low_relevance_hallucination: 'the answer did not match the knowledge base closely enough',
  generation_failed: 'the AI could not write a reply',
  flood: 'too many messages arrived at once',
  error: 'the bot ran into an error',
  ai_error: 'the AI ran into an error',
  escalation_confirmed_delayed: 'the customer asked for a person',
  greeting_rule_match: 'a greeting rule answered',
  // A Telegram turn whose own reason is not one of the listed ones (it is kept in `rawReason`).
  other: 'the bot left the chat for a person, for a reason that has no name here',
  // The meaning check on a keyword rule's reply (2026-11-23).
  rule_not_asked: "the customer's message does not ask what this rule answers",
};

/** Why a matched keyword rule's reply did not go out, in plain words (BE autoReplyOutcome). */
export const WITHHELD_REASON: Record<string, string> = {
  send_failed: 'the email could not be sent',
  thread_locked: 'another reply was in progress',
  kb_error: 'the knowledge base search failed',
  kb_no_source: 'no knowledge base answer was sure enough',
  kb_below_threshold: 'no knowledge base answer was sure enough',
  kb_not_grounded: 'the knowledge base answer could not be checked',
  kb_source_other_team: "the knowledge base answer came from another team's knowledge",
  ai_drafts_off: 'AI drafts are off',
  plan_not_entitled: "the plan's auto-reply limit",
  plan_allotment_reached: "the plan's auto-reply limit",
  workspace_blocked: 'the workspace is waiting for a plan',
  kb_placeholder_in_plain_rule: 'the reply still holds {{kb_answer}}',
  // The reply check held the knowledge base answer (2026-11-20).
  kb_refusal: 'the knowledge base answer only declined the question',
  kb_reply_unchecked: 'the knowledge base answer could not be checked',
  kb_content_unchecked: 'the knowledge base answer could not be checked',
  // The send gate held the reply (2026-11-20): the knowledge base answer (`kb_…`), or a plain
  // prepared reply for what the customer asked.
  kb_restricted_topic:
    'the customer asks about a restricted topic, or the knowledge base answer states an amount with a unit of measure',
  kb_hold_phrase: 'the knowledge base answer contains a phrase this workspace holds',
  kb_no_customer_request: 'the message is not a customer request',
  kb_needs_lookup_or_action: 'answering needs a lookup or an action',
  kb_promises_follow_up: 'the knowledge base answer promised a follow-up',
  kb_does_not_answer: 'the knowledge base answer did not answer the question',
  kb_unsupported_by_sources: 'the answer said more than the knowledge base does',
  restricted_topic: RESTRICTED_OR_AMOUNT,
  // The meaning check could not run: it failed, its answer could not be read, or the workspace
  // has no AI provider set up (BE keywordSendGate PLAIN_RULE_UNCHECKED).
  question_unchecked:
    "the check on the customer's question could not run (for example, no AI provider is set up), so the reply was not sent without a person",
  // Also written for the AI's own reply (`source: 'ai_reply'`): the customer wrote again before
  // it went out (the newer message gets its own run), or the spam check has not cleared the sender.
  newer_message: 'the customer wrote again before the reply went out',
  spam_verdict: 'the spam check has not cleared this email',
};

/**
 * Why the email asking the customer for missing information was not sent (BE followUpEmailHelper:
 * `source: 'missing_info'`, `reason` = the outcome). Every outcome the backend stores; one this
 * bundle does not know reads as the backend's own sentence (`detail`), or as unknown.
 */
export const ASK_WITHHELD_REASON: Record<string, string> = {
  send_failed: WITHHELD_REASON.send_failed,
  thread_locked: WITHHELD_REASON.thread_locked,
  ai_drafts_off: WITHHELD_REASON.ai_drafts_off,
  workspace_blocked: WITHHELD_REASON.workspace_blocked,
  plan_not_entitled: 'the plan does not include automatic replies',
  plan_allotment_reached: "this month's automatic replies are used up",
  ai_reply_limit: 'the limit on automatic replies to this thread or this sender was reached',
  no_thread: 'there is no customer message to answer',
  nothing_to_ask: 'the AI had no question to ask, or could not write one',
  pre_send_timeout: 'a step before sending took too long',
  spam_verdict: 'the spam check did not clear this email',
  blocked_pre_gate: 'this thread is not one that gets an automatic reply',
  blocked_escalation_phrase: "the customer's email contains a phrase that stops automatic replies",
  blocked_degraded_analysis: 'the AI could not read this email properly',
  blocked_unsupported_language: 'the email is in a language the question is not written in',
  blocked_missing_info_guard: 'the email the AI wrote did not pass the checks on its questions',
  blocked_reply_hygiene: 'the email did not pass the checks every automatic reply passes',
};

/** `blocked_missing_info_model_check`: what the check on the email found (`checkReason`). */
export const ASK_CHECK_REASON: Record<string, string> = {
  ask_unchecked: "the email's questions could not be checked",
  'check failed': "the email's questions could not be checked",
  // A restricted topic, or a question the AI wrote states an amount (the built-in amount rule
  // keeps this code); a listed phrase is `hold_phrase`.
  restricted_topic:
    'the customer asks about a restricted topic, or a question in the email states an amount with a unit of measure, so nothing was asked automatically',
  hold_phrase:
    'a question in the email contains a phrase this workspace holds, so nothing was asked automatically',
  no_customer_request: 'the message is not a customer request',
  not_only_asking: 'a question in the email did more than ask for a detail',
};

/** Codes only the counts meet (an older hold's), worded for the counts card. */
const OTHER_REASON: Record<string, string> = {
  blocked_missing_info_model_check: "the email's questions did not pass their check",
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
  { value: 'restricted_topic', label: 'A restricted topic, or an amount with a unit' },
  { value: 'hold_phrase', label: 'A phrase this workspace holds' },
  { value: 'reply_unchecked', label: 'Reply could not be checked' },
  { value: 'needs_lookup_or_action', label: 'Needs a lookup or an action' },
  { value: 'no_customer_request', label: 'Not a customer request' },
  { value: 'promises_follow_up', label: 'Reply promised a follow-up' },
  { value: 'does_not_answer', label: 'Reply did not answer the question' },
  { value: 'unsupported_by_sources', label: 'Reply went beyond the knowledge base' },
  { value: 'not_from_knowledge', label: 'Reply not from the knowledge base' },
  { value: 'source_other_team', label: "Answer from another team's knowledge" },
  { value: 'rule_not_asked', label: 'Message does not ask what the rule answers' },
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
 * The words for ANY reason code an automatic reply's record can carry, whoever wrote it — for a
 * place that meets them all at once (the counts card). The Activity line asks per writer instead,
 * so a keyword rule's code is not borrowed for the AI's reply.
 */
export const anyAutoReplyReasonLabel = (reason: string | null | undefined): string => {
  const words = autoReplyReasonWords(reason);
  if (words) return words;
  const code = typeof reason === 'string' ? bare(reason) : '';
  for (const map of [WITHHELD_REASON, ASK_WITHHELD_REASON, ASK_CHECK_REASON, OTHER_REASON]) {
    if (Object.prototype.hasOwnProperty.call(map, code)) return map[code];
  }
  return AUTO_REPLY_REASON_UNKNOWN;
};

/**
 * One reason is stored under several spellings, by writer (the email AI, a keyword rule's `kb_…`,
 * the send gate's `send_gate:…`, the Telegram bot's hyphens, the website chat). The filter asks
 * the backend for all of them at once (`reason` takes a comma-separated list), or it would show
 * only one writer's holds.
 */
const REASON_SPELLINGS: Record<string, readonly string[]> = {
  restricted_topic: ['restricted_topic', 'kb_restricted_topic'],
  hold_phrase: ['hold_phrase', 'kb_hold_phrase'],
  reply_unchecked: [
    'reply_unchecked',
    'kb_reply_unchecked',
    'question_unchecked',
    'kb_content_unchecked',
  ],
  needs_lookup_or_action: ['needs_lookup_or_action', 'kb_needs_lookup_or_action'],
  no_customer_request: ['no_customer_request', 'kb_no_customer_request'],
  promises_follow_up: ['promises_follow_up', 'kb_promises_follow_up'],
  does_not_answer: ['does_not_answer', 'kb_does_not_answer'],
  unsupported_by_sources: ['unsupported_by_sources', 'kb_unsupported_by_sources'],
  not_from_knowledge: ['not_from_knowledge', 'send_gate:not_from_knowledge'],
  source_other_team: ['source_other_team', 'send_gate:source_other_team', 'kb_source_other_team'],
  refusal: ['refusal', 'refusal_held', 'kb_refusal', 'blocked_gate'],
  plan_not_entitled: ['plan_not_entitled', 'plan-not-entitled'],
  plan_allotment_reached: ['plan_allotment_reached', 'plan-allotment-reached'],
  low_confidence: ['low_confidence', 'low_confidence_offered_support'],
};

/** Every spelling of a filter's reason, comma-separated, as the backend's `reason` takes them. */
export const reasonFilterQuery = (reason: string | undefined): string | undefined =>
  reason ? (REASON_SPELLINGS[reason] ?? [reason]).join(',') : undefined;

/**
 * Why a SENT reply was allowed to go (`allowedBy` on the record and on the reply's event):
 * `passed` = the check every automatic reply passes let it through, with the confidence and the
 * threshold when stored (both 0–1); `fixed_text` = nobody's model wrote it — a keyword rule's or a
 * receipt confirmation's text is the team's own (`byTeam`), a bot's fixed line is just fixed.
 * Null when the record does not say.
 */
export const allowedByWords = (allowedBy: unknown, byTeam = false): string | null => {
  if (!allowedBy || typeof allowedBy !== 'object') return null;
  const { gate, confidence, threshold } = allowedBy as Record<string, unknown>;
  if (gate === 'fixed_text')
    return byTeam
      ? 'a fixed text written by your team, sent as it is'
      : 'a fixed text, not written by the AI';
  if (gate !== 'passed') return null;
  const percent = (value: unknown): string | null =>
    typeof value === 'number' && value >= 0 && value <= 1 ? `${Math.round(value * 100)}%` : null;
  const sure = percent(confidence);
  const needed = percent(threshold);
  const numbers = sure ? ` (confidence ${sure}${needed ? `, needed ${needed}` : ''})` : '';
  return `it passed the check every automatic reply goes through${numbers}`;
};
