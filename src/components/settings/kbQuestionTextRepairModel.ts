import type { KbQuestionTextAction, KbQuestionTextTotals } from '@/services/system.service';

/**
 * The pure half of KbQuestionTextRepair: labels, counts and the confirm's words. Kept apart so the
 * component stays readable (and under the file-length limit) and these stay unit-testable.
 */

export const PAGE_SIZE = 50;
export const ALL = 'all';
export type Filter = KbQuestionTextAction | typeof ALL;
export type Scope = string; // ALL or a workspace id

export const ACTION_LABEL: Record<KbQuestionTextAction, string> = {
  reject: 'Will reject',
  uncertain: 'Uncertain — kept as is',
  clean: 'Will clean',
  unchanged: 'Unchanged',
};
export const ACTION_VARIANT: Record<
  KbQuestionTextAction,
  'danger' | 'warning' | 'success' | 'secondary'
> = {
  reject: 'danger',
  uncertain: 'warning',
  clean: 'success',
  unchanged: 'secondary',
};
export const FILTER_LABEL: Record<KbQuestionTextAction, string> = {
  reject: 'Will reject',
  uncertain: 'Uncertain',
  clean: 'Will clean',
  unchanged: 'Unchanged',
};

export const REASON_TEXT: Record<string, string> = {
  quoted_reply: 'quoted reply',
  html: 'HTML',
  entities: 'HTML entities',
  greeting: 'greeting',
  signature: 'signature',
  contact_form: 'contact form',
  too_short_after_clean: 'too short after cleaning',
  lost_too_much: 'cleaning would remove too much',
  thanks_only: 'only a thank-you',
  empty_form: 'empty form',
  empty: 'empty',
  truncated: 'shortened to the length limit',
  subject_only: 'question taken from the subject',
  // Why an entry is left for a person: the backend keeps the original text for each of these.
  form_value_or_message: 'a form value may be the message',
  form_intro: 'text above the form may be the request',
  form_chrome: 'form plugin details in the text',
  greeting_or_message: 'the greeting may be the message',
  thanks_signed: 'a thank-you with words after it',
  thanks_or_text: 'a thank-you with words after it',
  short_no_question: 'short, asks nothing',
  no_question: 'only names or addresses',
  only_link: 'only a link',
  forwarded: 'a forwarded mail',
  header_at_top: 'starts with a mail header',
  header_kept: 'mail header lines in the text',
  inline_reply: 'answers written inside the quote',
  unmarked_quote: 'quote without ">" marks',
  attribution_no_address: '"… wrote:" line without an address',
  attribution_kept: 'a "… wrote:" line left in the text',
  quote_marks_kept: 'quoted lines mixed into the reply',
  after_signature_marker: 'only text after "--"',
  disclaimer: 'a legal disclaimer',
  // The repair's own.
  already_cleaned: 'already cleaned',
  edited_since_capture: 'edited by a person — kept',
  no_original: 'no original text stored',
  thread_transcript: 'a whole-thread transcript',
  approved_kept: 'approved — kept as is',
};
export const reasonText = (reason: string): string =>
  REASON_TEXT[reason] ?? reason.replace(/_/g, ' ');

export const fmt = (count: number): string => count.toLocaleString();
export const entries = (count: number): string =>
  `${fmt(count)} ${count === 1 ? 'entry' : 'entries'}`;

export const sumTotals = (totals: KbQuestionTextTotals[]) =>
  totals.reduce(
    (acc, row) => ({
      checked: acc.checked + row.checked,
      cleaned: acc.cleaned + row.cleaned,
      unchanged: acc.unchanged + row.unchanged,
      uncertain: acc.uncertain + row.uncertain,
      rejected: acc.rejected + row.rejected,
      aiRewritten: acc.aiRewritten + row.aiRewritten,
      rawEmailBefore: acc.rawEmailBefore + row.rawEmailBefore,
      rawEmailAfter: acc.rawEmailAfter + row.rawEmailAfter,
      failed: acc.failed + row.failed,
      keptAsEdited: acc.keptAsEdited + row.keptAsEdited,
    }),
    {
      checked: 0,
      cleaned: 0,
      unchanged: 0,
      uncertain: 0,
      rejected: 0,
      aiRewritten: 0,
      rawEmailBefore: 0,
      rawEmailAfter: 0,
      failed: 0,
      keptAsEdited: 0,
    }
  );

/** Apply runs in several calls (the server stops at its time budget): add them up per workspace. */
export const mergeTotals = (
  into: KbQuestionTextTotals[],
  add: KbQuestionTextTotals[]
): KbQuestionTextTotals[] => {
  const out = into.map((row) => ({ ...row }));
  for (const row of add) {
    const same = out.find((entry) => entry.organizationId === row.organizationId);
    if (!same) {
      out.push({ ...row });
      continue;
    }
    same.checked += row.checked;
    same.cleaned += row.cleaned;
    same.unchanged += row.unchanged;
    same.uncertain += row.uncertain;
    same.rejected += row.rejected;
    same.aiRewritten += row.aiRewritten;
    same.rawEmailBefore += row.rawEmailBefore;
    same.rawEmailAfter += row.rawEmailAfter;
    same.failed += row.failed;
    same.keptAsEdited += row.keptAsEdited;
  }
  return out;
};

/**
 * Safety stop for the apply loop. With AI on, a call does only a few rows (each AI row needs ~40 s
 * of headroom inside the 60 s proxy limit), so this allows ~10,000 entries; hitting it says so.
 */
export const MAX_APPLY_CALLS = 2500;

export const countFor = (
  sum: ReturnType<typeof sumTotals>,
  action: KbQuestionTextAction
): number =>
  action === 'reject'
    ? sum.rejected
    : action === 'uncertain'
      ? sum.uncertain
      : action === 'clean'
        ? sum.cleaned
        : sum.unchanged;

/**
 * Which list to open after a Check. Rejects first: they are the only entries Apply hides, so they
 * are what must be read before applying. Then the uncertain ones (kept as they are, left for a
 * human). Then everything.
 */
export const defaultFilter = (totals: KbQuestionTextTotals[]): Filter => {
  const sum = sumTotals(totals);
  if (sum.rejected > 0) return 'reject';
  if (sum.uncertain > 0) return 'uncertain';
  return ALL;
};

/** The confirm's words — every count from the check that is about to be applied. */
export const applyConfirmText = (totals: KbQuestionTextTotals[], aiAvailable: boolean): string => {
  const sum = sumTotals(totals);
  // Apply writes an AI question on EVERY unapproved entry it cleans — the check only sampled a
  // few. Say so before the click (audit M5).
  const ai = aiAvailable
    ? 'Unapproved entries get an AI-written question — not only the sampled ones; it is kept only ' +
      'when it keeps every order number, amount and name, otherwise the rule-cleaned text is used. '
    : '';
  return (
    `${fmt(sum.cleaned)} cleaned, ${fmt(sum.rejected)} rejected (restorable for 90 days), ` +
    `${fmt(sum.uncertain)} left for review. ${ai}Approved entries are cleaned without AI and are ` +
    'never approved or unapproved; nothing is approved. The originals are kept beside the cleaned ' +
    'text. The repair checks again when it runs, so if entries changed since this check the ' +
    'numbers can differ — the result says what it actually did.'
  );
};
