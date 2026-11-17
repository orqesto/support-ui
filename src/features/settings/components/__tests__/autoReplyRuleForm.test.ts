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
  kbMatchFraction,
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
  it('{{kb_answer}} with the knowledge base off → an error under the reply text', () => {
    const draft = {
      ...emptyDraft(),
      keywords: ['refund'],
      replyText: `Hello ${KB_ANSWER_PLACEHOLDER}`,
    };
    expect(validateDraft(draft).replyText).toMatch(/knowledge base/);
    // CONTROL — the same text with the knowledge base on is fine.
    expect(validateDraft({ ...draft, useKnowledgeBase: true })).toEqual({});
    // Any spelling the backend refuses: {{ KB_ANSWER }}.
    expect(validateDraft({ ...draft, replyText: 'Hi {{ KB_ANSWER }}' }).replyText).toMatch(
      /knowledge base/
    );
  });

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

  it("puts the server's message under the one field it names (a keyword another rule has)", () => {
    const clash =
      '"refund" is already a keyword of the rule "Refunds". An email with it would match both rules and get no auto-reply — keep it in one rule only.';
    expect(errorsFromFields(['keywords'], clash)).toEqual({ keywords: clash });
  });

  it('keeps the defaults when several fields are named or no message came', () => {
    expect(errorsFromFields(['keywords', 'replyText'], 'Two problems.')).toEqual({
      keywords: 'Check the keywords: at least one is needed.',
      replyText: 'Write the reply text.',
    });
    expect(errorsFromFields(['keywords'])).toEqual({
      keywords: 'Check the keywords: at least one is needed.',
    });
    expect(errorsFromFields(['keywords'], '   ')).toEqual({
      keywords: 'Check the keywords: at least one is needed.',
    });
  });
});

describe('insertKbPlaceholder', () => {
  it('adds {{kb_answer}} as its own paragraph after the text', () => {
    expect(insertKbPlaceholder('Hello,  ')).toBe(`Hello,\n\n${KB_ANSWER_PLACEHOLDER}`);
    expect(insertKbPlaceholder('   ')).toBe(KB_ANSWER_PLACEHOLDER);
  });
});

describe('knowledge base match (audit M5)', () => {
  it('a whole percent 80–99 becomes the fraction the backend stores; anything else is null', () => {
    expect(kbMatchFraction('87')).toBe(0.87);
    expect(kbMatchFraction(' 80 ')).toBe(0.8);
    for (const bad of ['79', '100', '85.5', '', 'abc']) expect(kbMatchFraction(bad)).toBeNull();
  });

  it('checked only for a Template + KB rule', () => {
    const base = { ...emptyDraft(), keywords: ['refund'], replyText: 'Hi', kbMatchPercent: '50' };
    expect(validateDraft(base).kbMinSimilarity).toBeUndefined();
    expect(
      validateDraft({ ...base, useKnowledgeBase: true, replyText: 'Hi {{kb_answer}}' })
        .kbMinSimilarity
    ).toMatch(/80 to 99/);
  });
});

describe('validateDraft — keyword minimum length (deep review 2026-11-16)', () => {
  it('refuses keywords under 3 characters and names them; 3+ characters pass (control)', () => {
    const draft = { ...emptyDraft(), replyText: 'Text', keywords: ['hi', 'ok', 'refund'] };
    expect(validateDraft(draft).keywords).toBe(
      'A keyword needs at least 3 characters: "hi", "ok".'
    );
    expect(validateDraft({ ...draft, keywords: ['refund', 'iban'] })).toEqual({});
  });
});

describe('validateDraft — two-letter acronyms in capitals (owner 2026-11-17)', () => {
  it('lets TV and EU through; tv and c# stay too short (control)', () => {
    const draft = { ...emptyDraft(), replyText: 'Text', keywords: ['TV', 'EU'] };
    expect(validateDraft(draft)).toEqual({});
    expect(validateDraft({ ...draft, keywords: ['tv', 'c#'] }).keywords).toBe(
      'A keyword needs at least 3 characters: "tv", "c#".'
    );
  });
});
