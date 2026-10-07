import type { SpamRule } from '@/services/settings.service';

/**
 * Which text a spam rule's pattern is tested against. Separate from the category, which says what
 * a match MEANS. The editor used to offer these three as the "Category", so every rule an admin
 * wrote was saved as a body rule whatever they picked.
 */
export const SPAM_RULE_MATCH_FIELDS = ['sender', 'subject', 'content'] as const;
export type SpamRuleMatchField = (typeof SPAM_RULE_MATCH_FIELDS)[number];

const isMatchField = (value: string | null | undefined): value is SpamRuleMatchField =>
  (SPAM_RULE_MATCH_FIELDS as readonly string[]).includes(value ?? '');

export const MATCH_FIELD_OPTIONS: { value: SpamRuleMatchField; label: string }[] = [
  { value: 'sender', label: 'Sender address' },
  { value: 'subject', label: 'Subject' },
  { value: 'content', label: 'Message text' },
];

/**
 * What a match means. `security` is left out: those rules are system-protected, and only appear
 * when the rule being edited already is one.
 */
const CATEGORY_OPTIONS: { value: string; label: string }[] = [
  { value: 'spam', label: 'Spam' },
  { value: 'promotional', label: 'Promotional / newsletter' },
  { value: 'unsubscribe', label: 'Unsubscribe / mailing list' },
  { value: 'scam', label: 'Scam' },
  { value: 'phishing', label: 'Phishing' },
  { value: 'competitive', label: 'Sales outreach (review)' },
  { value: 'out_of_office', label: 'Out of office' },
  { value: 'transactional', label: 'Order / system notice' },
];

/** Categories the editor does not offer but the list still shows (protected / learned rules). */
const OTHER_CATEGORY_LABELS: Record<string, string> = {
  security: 'Security',
  marketing: 'Marketing',
};

/** The words the list shows — the same ones the editor offers. */
export const categoryLabel = (value: string): string =>
  CATEGORY_OPTIONS.find((option) => option.value === value)?.label ??
  OTHER_CATEGORY_LABELS[value] ??
  value;

export const matchFieldLabel = (rule: Pick<SpamRule, 'matchField' | 'category'>): string => {
  const field = isMatchField(rule.matchField)
    ? rule.matchField
    : isMatchField(rule.category)
      ? rule.category
      : 'content';
  return MATCH_FIELD_OPTIONS.find((option) => option.value === field)?.label ?? field;
};

/**
 * The category list for a rule, keeping the rule's own value selectable when it is not one of
 * ours (a learned rule, a protected rule, or an old save that put the match field here) — so
 * opening and saving a rule never changes its category behind the admin's back.
 */
export const categoryOptionsFor = (current: string): { value: string; label: string }[] =>
  !current || CATEGORY_OPTIONS.some((option) => option.value === current)
    ? CATEGORY_OPTIONS
    : [...CATEGORY_OPTIONS, { value: current, label: current }];

export type SpamRuleFormData = {
  name: string;
  description: string;
  pattern: string;
  exampleText: string;
  category: string;
  matchField: SpamRuleMatchField;
  severity: number;
  active: boolean;
  /**
   * The rule is (or will be) one an admin added — the only kind the backend files as a notice.
   * Display only; the backend ignores it on save.
   */
  adminRule: boolean;
};

export const initialSpamRuleForm = (): SpamRuleFormData => ({
  name: '',
  description: '',
  pattern: '',
  exampleText: '',
  category: 'spam',
  matchField: 'content',
  severity: 10,
  active: true,
  adminRule: true,
});

export const spamRuleFormFromRule = (rule: SpamRule): SpamRuleFormData => ({
  name: rule.name,
  description: rule.description,
  pattern: rule.pattern ?? '',
  exampleText: rule.exampleText ?? '',
  category: rule.category,
  // A backend without `matchField` in its list ⇒ read an old save's field out of the category.
  matchField: isMatchField(rule.matchField)
    ? rule.matchField
    : isMatchField(rule.category)
      ? rule.category
      : 'content',
  severity: rule.severity,
  active: rule.active,
  adminRule: rule.provenance === 'admin_added',
});

/**
 * True when this rule files matching mail as a system notice with no AI — the backend's rule
 * (`patternSpamCheck`): an order / system notice matched on the sender or subject, on a rule an
 * admin added. Built-in and learned rules keep their own scoring, where severity still counts.
 * Only the PATTERN decides it — a rule with example text alone matches by similarity, which
 * never files mail on its own.
 */
export const filesAsNotice = (
  form: Pick<SpamRuleFormData, 'category' | 'matchField' | 'adminRule' | 'pattern'>
): boolean =>
  form.adminRule &&
  form.category === 'transactional' &&
  form.matchField !== 'content' &&
  form.pattern.trim() !== '';
