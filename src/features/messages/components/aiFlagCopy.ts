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
};

/** A longer explanation where the UI has room for one (the tooltip); the label otherwise. */
export const NEEDS_REVIEW_REASON_DETAILS: Record<string, string> = {
  // Telegram flood rule (owner 2026-11-13): the chat sent more than the bot's flood limit at once.
  flood: 'Too many messages at once – saved for you, bot did not answer',
};

export const NEEDS_REVIEW_LABEL = 'Needs review';

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
