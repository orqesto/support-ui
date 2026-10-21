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
  return reason ? `${NEEDS_REVIEW_LABEL}: ${reason}` : NEEDS_REVIEW_LABEL;
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
