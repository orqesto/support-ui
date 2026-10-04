/**
 * KB quality review — how a verdict and its reasons read on screen.
 *
 * The reason codes are the backend's (`consolidation/entryQuality.ts`: REMOVE_REASONS,
 * IMPROVE_REASONS). An unknown code is shown as it is, never dropped: a reason the moderator
 * cannot see is a verdict they cannot check.
 */

export const KB_QUALITY_REASON_LABELS: Readonly<Record<string, string>> = {
  // remove
  customer_specific: 'only fits one customer',
  no_answer: 'no real answer',
  inverted_roles: 'question and answer swapped',
  not_support: 'not a support question',
  outdated: 'out of date',
  // improve
  raw_email: 'question is a whole email',
  unclear_question: 'unclear question',
  incomplete_answer: 'incomplete answer',
  poor_wording: 'poor wording',
  personal_data: 'contains personal details',
};

export const qualityReasonLabel = (code: string): string =>
  KB_QUALITY_REASON_LABELS[code] ?? code.replace(/_/g, ' ');

/** "Remove #KB-12 — only fits one customer: Can you change the address on…" */
export const summarizeKbQuality = (payload: Record<string, unknown>): string => {
  const verdict = payload.verdict === 'improve' ? 'Rewrite' : 'Remove';
  const reasons = Array.isArray(payload.reasons)
    ? payload.reasons.filter((reason): reason is string => typeof reason === 'string')
    : [];
  const ref =
    typeof payload.publicId === 'string' && payload.publicId
      ? ` #${payload.publicId}`
      : typeof payload.entryId === 'number'
        ? ` #${payload.entryId}`
        : '';
  const why = reasons.length > 0 ? ` — ${reasons.map(qualityReasonLabel).join(', ')}` : '';
  const preview =
    typeof payload.questionPreview === 'string' && payload.questionPreview
      ? `: ${payload.questionPreview}`
      : '';
  return `${verdict}${ref}${why}${preview}`;
};
