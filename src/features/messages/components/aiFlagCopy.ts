import type { ContradictionCheckMetadata } from '@/types/ai';

/**
 * Plain words for the AI flags the backend now explains (old-AI-features audit, 2026-10-21).
 *
 * ⛔ One place for every string, so a later i18n pass swaps a map, not a dozen JSX literals.
 *
 * ⚠️ Every code is OPTIONAL on the wire. This frontend deploys on merge and the backend ships on
 * a tag, so a response without the field — or with a code this bundle has never heard of — must
 * read exactly as it did before: the plain "Needs review", no routing line.
 */

/** `conversations.needs_review_reason` → what an agent reads. `other` keeps the plain wording. */
export const NEEDS_REVIEW_REASON_LABELS: Record<string, string> = {
  low_confidence: 'Low confidence draft',
  blocked_gate: 'Held by a send rule',
  plan_limit: 'Plan limit reached',
  escalation: 'Escalation phrase',
  ai_reply_limit: 'Customer replied after the AI',
  needs_info: 'Needs more information',
  ai_error: 'AI error',
  send_failed: 'Send failed',
  reopened: 'Reopened',
  suspicious_in_thread: 'Suspicious reply',
  lead_escalated: 'Qualified lead',
  flood: 'Too many messages at once',
  // Per-question retrieval (2026-11-16): the AI could answer only some of the questions.
  partial_answer: "AI couldn't answer every question",
  follow_up_needed: 'Follow-up needed',
  // The check on an automatic reply (an answer, a prepared reply's question, the email asking
  // for missing details) could not run, so it was held (2026-11-20).
  reply_unchecked: 'Reply not checked',
  // The send gate held an automatic reply (2026-11-20), one reason each. "Reply", not "draft": a
  // held keyword-rule or bot answer leaves no draft behind.
  restricted_topic: 'Restricted topic',
  no_customer_request: 'Not a customer request',
  needs_lookup_or_action: 'Needs a lookup or an action',
  promises_follow_up: 'Reply promised a follow-up',
  does_not_answer: 'Reply did not answer the question',
  unsupported_by_sources: 'Reply went beyond the knowledge base',
  not_from_knowledge: 'Reply not from the knowledge base',
  spam_verdict: 'Spam check not cleared',
};

/** A longer explanation where the UI has room for one (the tooltip); the label otherwise. */
export const NEEDS_REVIEW_REASON_DETAILS: Record<string, string> = {
  // Telegram flood rule (owner 2026-11-13): the chat sent more than the bot's flood limit at once.
  flood: 'Too many messages at once – saved for you, bot did not answer',
  partial_answer: 'The AI could not answer every question, so nothing was sent – see the note',
  follow_up_needed:
    'The AI answered part and told the customer a colleague will follow up – see the note',
  reply_unchecked:
    "A check on the automatic reply or on the customer's message could not run, so nothing was sent",
  restricted_topic:
    'The customer asks about a subject a person must answer (a restricted topic), so no automatic reply was sent',
  no_customer_request:
    'This does not read as a customer asking for something, so no automatic reply was sent',
  needs_lookup_or_action:
    'Answering needs someone to look something up or to do something, so no automatic reply was sent',
  promises_follow_up:
    'The automatic reply promised that someone would follow up, so it was not sent',
  does_not_answer: "The automatic reply did not answer the customer's question, so it was not sent",
  unsupported_by_sources:
    'The automatic reply said something the knowledge base does not, so it was not sent',
  not_from_knowledge:
    'The reply was not written from the knowledge base (for example, it asks the customer a question), so it was not sent without a person',
  spam_verdict: 'The spam check did not clear this email, so no automatic reply was sent',
};

/**
 * The stored draft of an automatic reply that was handed over for sending and did not arrive
 * (`suggestedAnswer.notSent`, 2026-11-21): said on the draft itself, so nobody takes it for sent.
 */
const SUGGESTION_NOT_SENT: Record<string, string> = {
  failed: 'not sent',
  uncertain: 'may not have been delivered',
};

/** The words for a draft's `notSent` mark; null without one, or for a mark this bundle does not know. */
export const suggestionNotSentNote = (mark: unknown): string | null =>
  typeof mark === 'string' && Object.prototype.hasOwnProperty.call(SUGGESTION_NOT_SENT, mark)
    ? SUGGESTION_NOT_SENT[mark]
    : null;

/** The stored draft's pill beside "AI": "87%", "87% · not sent", "not sent", or nothing. */
export const suggestionSublabel = (confidence: unknown, notSent: unknown): string | undefined =>
  [
    typeof confidence === 'number' && confidence ? `${Math.round(confidence * 100)}%` : null,
    suggestionNotSentNote(notSent),
  ]
    .filter(Boolean)
    .join(' · ') || undefined;

export const NEEDS_REVIEW_LABEL = 'Needs review';

/**
 * A flood hold names itself on the chip, not only in its tooltip (owner 2026-11-13): the plain
 * "Needs review" hid why the bot went quiet. Any other reason keeps the plain chip. An older
 * backend never sends `flood`, so it reads as before.
 */
export const FLOOD_REVIEW_REASON = 'flood';

/**
 * The review reasons that name themselves on the chip and in the thread header: the flood hold,
 * the AI auto-reply's partial answers (2026-11-16), and a reply held because its check could not
 * run (2026-11-20) — the agent must see that a follow-up is
 * owed without opening a tooltip. Any other reason keeps the plain "Needs review".
 */
export const NAMED_REVIEW_REASONS = [
  'flood',
  'partial_answer',
  'follow_up_needed',
  'reply_unchecked',
  // The send gate's holds (2026-11-20): the agent sees which check stopped the reply.
  'restricted_topic',
  'no_customer_request',
  'needs_lookup_or_action',
  'promises_follow_up',
  'does_not_answer',
  'unsupported_by_sources',
  'not_from_knowledge',
  'spam_verdict',
] as const;
export type NamedReviewReason = (typeof NAMED_REVIEW_REASONS)[number];

export const namedReviewReason = (
  thread:
    | { needsHumanReview?: boolean | null; needsReviewReason?: string | null }
    | null
    | undefined
): NamedReviewReason | null =>
  thread?.needsHumanReview === true &&
  (NAMED_REVIEW_REASONS as readonly string[]).includes(thread.needsReviewReason ?? '')
    ? (thread.needsReviewReason as NamedReviewReason)
    : null;

export const isFloodReview = (
  thread:
    | { needsHumanReview?: boolean | null; needsReviewReason?: string | null }
    | null
    | undefined
): boolean => thread?.needsHumanReview === true && thread.needsReviewReason === FLOOD_REVIEW_REASON;

/** The reason in words, or null for absent / `other` / an unknown code (caller keeps its plain text). */
export const needsReviewReasonLabel = (code: string | null | undefined): string | null =>
  code && Object.prototype.hasOwnProperty.call(NEEDS_REVIEW_REASON_LABELS, code)
    ? NEEDS_REVIEW_REASON_LABELS[code]
    : null;

/** "Needs review: Low confidence draft", or the plain "Needs review" when there is no reason. */
export const needsReviewTooltip = (code: string | null | undefined): string => {
  const reason = needsReviewReasonLabel(code);
  if (!reason) return NEEDS_REVIEW_LABEL;
  const detail = code ? NEEDS_REVIEW_REASON_DETAILS[code] : undefined;
  return `${NEEDS_REVIEW_LABEL}: ${detail ?? reason}`;
};

/** Why the router picked this assignee (`autoRoutedReason` on the thread). */
export const AUTO_ROUTED_REASON_LABELS: Record<string, string> = {
  contact_manager: "Assigned automatically: contact's manager",
  client_history: 'Assigned automatically: handled this customer before',
  skill_match: 'Assigned automatically: skills match',
  load_balance: 'Assigned automatically: least busy',
};

/** Null when absent, null, or a code this bundle does not know — nothing is shown then. */
export const autoRoutedReasonLabel = (code: string | null | undefined): string | null =>
  code && Object.prototype.hasOwnProperty.call(AUTO_ROUTED_REASON_LABELS, code)
    ? AUTO_ROUTED_REASON_LABELS[code]
    : null;

type RoutedMatch = { key: string; value: string; source: string; evidence: string | null };

const isRoutedMatch = (entry: unknown): entry is RoutedMatch =>
  !!entry &&
  typeof entry === 'object' &&
  typeof (entry as RoutedMatch).key === 'string' &&
  typeof (entry as RoutedMatch).value === 'string';

const describeRoutedMatch = (match: RoutedMatch): string => {
  const notes: string[] = [];
  if (match.source === 'ai') notes.push('AI judged');
  if (match.source === 'language') notes.push('detected language');
  else if (match.source === 'pattern' && match.evidence)
    notes.push(`text pattern found “${match.evidence}”`);
  else if (match.evidence) notes.push(`mentions “${match.evidence}”`);
  return `${match.key} = ${match.value}${notes.length ? ` (${notes.join('; ')})` : ''}`;
};

/**
 * The reason label plus, for a skill match, WHICH skills matched and the customer's words that
 * did (`autoRoutedMatches`, BE spec 2026-11-02 skill routing §6.7). Tolerates an older backend
 * (no matches) and malformed entries: the plain label then.
 */
export const autoRoutedTooltip = (
  code: string | null | undefined,
  matches: unknown
): string | null => {
  const label = autoRoutedReasonLabel(code);
  if (!label || code !== 'skill_match' || !Array.isArray(matches)) return label;
  const described = matches.filter(isRoutedMatch).map(describeRoutedMatch);
  return described.length > 0 ? `${label} — ${described.join('; ')}` : label;
};

/** Shown where the analysis is, when the triage AI could not judge the message. */
export const ANALYSIS_DEGRADED_HINT =
  "AI couldn't analyse this message — read it yourself before relying on the facets.";

/**
 * A contradiction an agent dismissed is no contradiction, everywhere the frontend reads one.
 * `dismissedAt` is absent on an older backend, which then keeps today's behaviour.
 */
export const isContradictionDismissed = (
  check: Pick<ContradictionCheckMetadata, 'dismissedAt'> | null | undefined
): boolean => !!check?.dismissedAt;

/** The live flag: the check found a contradiction and nobody dismissed it. */
export const hasActiveContradiction = (
  check: ContradictionCheckMetadata | null | undefined
): boolean => !!check?.result?.hasContradiction && !isContradictionDismissed(check);
