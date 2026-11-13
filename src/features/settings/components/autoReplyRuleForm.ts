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
};

export type RuleDraftErrors = { keywords?: string; replyText?: string; name?: string };

export const emptyDraft = (): RuleDraft => ({
  name: '',
  keywords: [],
  keywordInput: '',
  replyText: '',
});

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
  return errors;
};

export const hasErrors = (errors: RuleDraftErrors): boolean => Object.keys(errors).length > 0;

/** Server-side field names → the same inline messages, for a 400 the form did not catch. */
export const errorsFromFields = (fields: readonly string[]): RuleDraftErrors => {
  const errors: RuleDraftErrors = {};
  if (fields.includes('keywords')) errors.keywords = 'Check the keywords: at least one is needed.';
  if (fields.includes('replyText')) errors.replyText = 'Write the reply text.';
  if (fields.includes('name')) errors.name = 'The name is too long.';
  return errors;
};
