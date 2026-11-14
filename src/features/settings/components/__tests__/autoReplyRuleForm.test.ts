import { describe, expect, it } from 'vitest';
import {
  addKeywords,
  draftKeywords,
  emptyDraft,
  errorsFromFields,
  hasErrors,
  insertKbPlaceholder,
  KB_ANSWER_PLACEHOLDER,
  KEYWORD_MAX_LENGTH,
  KEYWORDS_PER_RULE_MAX,
  validateDraft,
} from '../autoReplyRuleForm';

/** Keyword auto-reply rule form, the pure half. Invented data. */
describe('addKeywords', () => {
  it('splits a pasted list on commas and line breaks, trims and collapses spaces', () => {
    expect(addKeywords([], ' refund , return  policy\ninvoice ')).toEqual([
      'refund',
      'return policy',
      'invoice',
    ]);
  });

  it('drops case-insensitive duplicates, keeping the first spelling', () => {
    expect(addKeywords(['Refund'], 'refund, REFUND, Invoice, invoice')).toEqual([
      'Refund',
      'Invoice',
    ]);
  });

  it('CONTROL — empty parts add nothing', () => {
    expect(addKeywords(['refund'], ' , \n ,')).toEqual(['refund']);
  });
});

describe('validateDraft', () => {
  it('a rule without a keyword and without reply text names both', () => {
    const errors = validateDraft(emptyDraft());
    expect(errors.keywords).toBe('Add at least one keyword.');
    expect(errors.replyText).toBe('Write the reply text.');
    expect(hasErrors(errors)).toBe(true);
  });

  it('whitespace-only reply text is no reply text', () => {
    const errors = validateDraft({ ...emptyDraft(), keywords: ['refund'], replyText: '   \n ' });
    expect(errors).toEqual({ replyText: 'Write the reply text.' });
  });

  it('a keyword still in the input counts (typed but not yet added)', () => {
    const draft = { ...emptyDraft(), keywordInput: 'refund', replyText: 'See our policy.' };
    expect(draftKeywords(draft)).toEqual(['refund']);
    expect(hasErrors(validateDraft(draft))).toBe(false);
  });

  it('limits: keyword count and keyword length', () => {
    const many = Array.from({ length: KEYWORDS_PER_RULE_MAX + 1 }, (_, idx) => `kw${idx}`);
    expect(validateDraft({ ...emptyDraft(), keywords: many, replyText: 'x' }).keywords).toMatch(
      /at most/
    );
    const long = 'k'.repeat(KEYWORD_MAX_LENGTH + 1);
    expect(validateDraft({ ...emptyDraft(), keywords: [long], replyText: 'x' }).keywords).toMatch(
      /characters/
    );
  });
});

describe('errorsFromFields', () => {
  it('maps the fields a 400 named to inline messages', () => {
    expect(errorsFromFields(['keywords', 'replyText'])).toEqual({
      keywords: 'Check the keywords: at least one is needed.',
      replyText: 'Write the reply text.',
    });
    expect(errorsFromFields([])).toEqual({});
  });
});

describe('insertKbPlaceholder', () => {
  it('adds {{kb_answer}} as its own paragraph after the text', () => {
    expect(insertKbPlaceholder('Hello,  ')).toBe(`Hello,\n\n${KB_ANSWER_PLACEHOLDER}`);
    expect(insertKbPlaceholder('   ')).toBe(KB_ANSWER_PLACEHOLDER);
  });
});
