/**
 * Keyword auto-reply rule form — the pure half: adding keywords from what was typed, and the inline
 * validation the backend repeats (a rule needs at least one keyword and a reply text).
 */

export const KEYWORDS_PER_RULE_MAX = 50;
export const KEYWORD_MAX_LENGTH = 100;

export type RuleDraft = {
  name: string;
  keywords: string[];
  keywordInput: string;
  replyText: string;
  /** Template + knowledge base: an answer from the KB goes in at {{kb_answer}}. */
  useKnowledgeBase: boolean;
  /** Template + KB: the knowledge base match, in whole percent as typed (80–99). */
  kbMatchPercent: string;
};

export type RuleDraftErrors = {
  keywords?: string;
  replyText?: string;
  name?: string;
  kbMinSimilarity?: string;
};

export const KB_MATCH_PERCENT_MIN = 80;
export const KB_MATCH_PERCENT_MAX = 99;
export const KB_MATCH_PERCENT_DEFAULT = 87;
const KB_MATCH_RANGE_MESSAGE = `Enter a whole number from ${KB_MATCH_PERCENT_MIN} to ${KB_MATCH_PERCENT_MAX}.`;

/** The typed percent as the fraction the backend stores, or null when it is not a valid one. */
export const kbMatchFraction = (typed: string): number | null => {
  const value = Number(typed.trim());
  if (!Number.isInteger(value) || value < KB_MATCH_PERCENT_MIN || value > KB_MATCH_PERCENT_MAX)
    return null;
  return value / 100;
};

export const emptyDraft = (): RuleDraft => ({
  name: '',
  keywords: [],
  keywordInput: '',
  replyText: '',
  useKnowledgeBase: false,
  kbMatchPercent: String(KB_MATCH_PERCENT_DEFAULT),
});

/** Where a template rule puts the knowledge base answer (the backend's placeholder). */
export const KB_ANSWER_PLACEHOLDER = '{{kb_answer}}';

/** The template with the placeholder added on its own paragraph at the end. */
export const insertKbPlaceholder = (text: string): string =>
  text.trim() ? `${text.trimEnd()}\n\n${KB_ANSWER_PLACEHOLDER}` : KB_ANSWER_PLACEHOLDER;

/**
 * Keywords from the input added to the list: split on commas and line breaks (a pasted list adds
 * them all), trimmed, inner spaces collapsed, case-insensitive duplicates dropped.
 */
export const addKeywords = (existing: readonly string[], typed: string): string[] => {
  const seen = new Set(existing.map((kw) => kw.toLocaleLowerCase()));
  const next = [...existing];
  for (const part of typed.split(/[,\n]/)) {
    const keyword = part.replace(/\s+/g, ' ').trim();
    if (!keyword) continue;
    const key = keyword.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    next.push(keyword);
  }
  return next;
};

/** The keywords the rule would be saved with: the list plus anything still in the input. */
export const draftKeywords = (draft: RuleDraft): string[] =>
  addKeywords(draft.keywords, draft.keywordInput);

export const validateDraft = (draft: RuleDraft): RuleDraftErrors => {
  const errors: RuleDraftErrors = {};
  const keywords = draftKeywords(draft);
  if (keywords.length === 0) errors.keywords = 'Add at least one keyword.';
  else if (keywords.length > KEYWORDS_PER_RULE_MAX)
    errors.keywords = `A rule can have at most ${KEYWORDS_PER_RULE_MAX} keywords.`;
  else if (keywords.some((kw) => kw.length > KEYWORD_MAX_LENGTH))
    errors.keywords = `A keyword can be at most ${KEYWORD_MAX_LENGTH} characters.`;
  if (!draft.replyText.trim()) errors.replyText = 'Write the reply text.';
  // Filled only by a knowledge-base rule; in a plain rule the customer would read it word for word
  // (the backend refuses it too, 400 on replyText).
  else if (!draft.useKnowledgeBase && /\{\{\s*kb_answer\s*\}\}/i.test(draft.replyText))
    errors.replyText = `${KB_ANSWER_PLACEHOLDER} is filled only when "Add an answer from the knowledge base" is on. Turn it on, or remove ${KB_ANSWER_PLACEHOLDER} from the reply.`;
  if (draft.useKnowledgeBase && kbMatchFraction(draft.kbMatchPercent) === null)
    errors.kbMinSimilarity = KB_MATCH_RANGE_MESSAGE;
  return errors;
};

export const hasErrors = (errors: RuleDraftErrors): boolean => Object.keys(errors).length > 0;

const FORM_FIELDS = ['keywords', 'replyText', 'name', 'kbMinSimilarity'] as const;

/**
 * Server-side field names → inline messages, for a 400 the form did not catch. When the 400 names
 * exactly ONE field and carries its own message (a keyword another rule already has, say), that
 * message goes under the field; otherwise each field gets its default text.
 */
export const errorsFromFields = (
  fields: readonly string[],
  serverMessage?: string
): RuleDraftErrors => {
  const errors: RuleDraftErrors = {};
  const named = FORM_FIELDS.filter((field) => fields.includes(field));
  const message = serverMessage?.trim();
  if (named.length === 1 && fields.length === 1 && message) {
    errors[named[0]] = message;
    return errors;
  }
  if (fields.includes('keywords')) errors.keywords = 'Check the keywords: at least one is needed.';
  if (fields.includes('replyText')) errors.replyText = 'Write the reply text.';
  if (fields.includes('name')) errors.name = 'The name is too long.';
  if (fields.includes('kbMinSimilarity')) errors.kbMinSimilarity = KB_MATCH_RANGE_MESSAGE;
  return errors;
};
