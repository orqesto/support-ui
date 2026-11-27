import { describe, expect, it } from 'vitest';
import {
  addKeywords,
  draftKeywords,
  emptyDraft,
  errorsFromFields,
  hasErrors,
  hasNamePlaceholder,
  insertNamePlaceholder,
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

describe('insertNamePlaceholder', () => {
  const NAME = '{{customer_name}}';
  const words = (text: string): string[] => text.match(/[\p{L}\p{N}'-]+/gu) ?? [];

  it.each([
    ['Dear customer,\n\nThanks.', `Dear ${NAME},\n\nThanks.`],
    ['Hi there!\n\nThanks.', `Hi ${NAME}!\n\nThanks.`],
    ['Dear Sir or Madam,\n\nThanks.', `Dear ${NAME},\n\nThanks.`],
    ['Dear sir/madam,\n\nThanks.', `Dear ${NAME},\n\nThanks.`],
    ['Hello friend,\n\nThanks.', `Hello ${NAME},\n\nThanks.`],
    ['Hello dear customers!\nThanks.', `Hello ${NAME}!\nThanks.`],
    ['Dear valued customer;\nThanks.', `Dear ${NAME};\nThanks.`],
    ['Good morning team.\nThanks.', `Good morning ${NAME}.\nThanks.`],
    ['Dear customer: we got your mail.', `Dear ${NAME}: we got your mail.`],
    ['Hi everyone\nThanks.', `Hi ${NAME}\nThanks.`],
    ['Dear customer,\r\n\r\nThanks.', `Dear ${NAME},\r\n\r\nThanks.`],
    ['Hi there\r\nThanks.', `Hi ${NAME}\r\nThanks.`],
  ])('replaces only a generic addressee: %j', (before, after) => {
    expect(insertNamePlaceholder(before)).toBe(after);
  });

  it.each([
    ['Hello,\n\nThanks.', `Hello ${NAME},\n\nThanks.`],
    ['Hello\nThanks.', `Hello ${NAME}\nThanks.`],
    ['Hello\r\nThanks.', `Hello ${NAME}\r\nThanks.`],
    ['Hey!', `Hey ${NAME}!`],
    [
      'Hello and thank you for contacting us about your refund request\nWe reply soon.',
      `Hello ${NAME} and thank you for contacting us about your refund request\nWe reply soon.`,
    ],
    [
      'Hi there and thanks for writing; we will reply.',
      `Hi ${NAME} there and thanks for writing; we will reply.`,
    ],
    ['Hello how are you? We received it.', `Hello ${NAME} how are you? We received it.`],
    [
      'Greetings from the Acme team. We got your email.',
      `Greetings ${NAME} from the Acme team. We got your email.`,
    ],
    ['Dear customers and partners,\nThanks.', `Dear ${NAME} customers and partners,\nThanks.`],
    ['\n\nHello,\nThanks.', `\n\nHello ${NAME},\nThanks.`],
  ])('inserts after the greeting word and keeps every word: %j', (before, after) => {
    expect(insertNamePlaceholder(before)).toBe(after);
  });

  it.each(['Dear Mr. Smith,\nThanks.', 'Hi John and welcome to our shop! More text.'])(
    'puts a line on top when the greeting already names someone: %j',
    (before) => {
      expect(insertNamePlaceholder(before)).toBe(`Dear ${NAME},\n\n${before}`);
    }
  );

  it.each([
    ['  Thanks for writing.', `Dear ${NAME},\n\n  Thanks for writing.`],
    ['Hi-five to you, friend', `Dear ${NAME},\n\nHi-five to you, friend`],
    ['Highlights: friend', `Dear ${NAME},\n\nHighlights: friend`],
    ['', `Dear ${NAME},\n\n`],
    ['Thanks.\r\nDear customer,', `Dear ${NAME},\n\nThanks.\r\nDear customer,`],
  ])('puts a "Dear {{customer_name}}," line on top without a greeting: %j', (before, after) => {
    expect(insertNamePlaceholder(before)).toBe(after);
  });

  it.each([
    'Hello and thank you for contacting us about your refund request\nWe reply…',
    'Hi there and thanks for writing; we will…',
    'Hello how are you? We received…',
    'Greetings from the Acme team. We got your email.',
    'Hi John and welcome to our shop! More text.',
    'Dear customer: we got your mail.',
    'Dear Mr. Smith,',
    'Hi, John',
    'Hi-five to you, friend',
  ])('deletes none of the words of %j (reviewer cases)', (before) => {
    const kept = words(insertNamePlaceholder(before));
    for (const word of words(before)) {
      if (before.startsWith(`Dear ${word}:`)) continue; // "customer" is the replaced addressee
      expect(kept, word).toContain(word);
    }
    // Same order: the original words are a subsequence of the result's words.
    const expected = words(before).filter((word) => !before.startsWith(`Dear ${word}:`));
    let matched = 0;
    for (const word of kept) if (word === expected[matched]) matched += 1;
    expect(matched).toBe(expected.length);
  });

  it.each([
    ['   Thanks for writing\nBye', `Dear ${NAME},\n\n   Thanks for writing\nBye`],
    ['\r\nLine two\r\n', `Dear ${NAME},\n\n\r\nLine two\r\n`],
    ['\n\n  Thanks.', `Dear ${NAME},\n\n\n\n  Thanks.`],
    ['\u00a0Dear Mr Smith,\nThanks.', `Dear ${NAME},\n\n\u00a0Dear Mr Smith,\nThanks.`],
  ])('keeps leading spaces and blank lines when it puts a line on top: %j', (before, after) => {
    expect(insertNamePlaceholder(before)).toBe(after);
  });

  it.each([
    ['Dear\u00a0customer,\nThanks.', `Dear\u00a0${NAME},\nThanks.`],
    ['Hi\u202fthere!', `Hi\u202f${NAME}!`],
    ['Dear\u3000Sir\u00a0or\u2009Madam,', `Dear\u3000${NAME},`],
    ['Good\u00a0morning\u2002team.', `Good\u00a0morning\u2002${NAME}.`],
    ['Dear valued\u00a0customer,', `Dear ${NAME},`],
    ['Hi there\u00a0\nThanks.', `Hi ${NAME}\u00a0\nThanks.`],
  ])('treats no-break and other Unicode spaces as spaces: %j', (before, after) => {
    expect(insertNamePlaceholder(before)).toBe(after);
  });

  it.each(['Dear\u00a0Mr Smith,\nThanks.', 'Hi\u2003John and welcome!'])(
    'sees a name after a no-break or Unicode space: %j',
    (before) => {
      expect(insertNamePlaceholder(before)).toBe(`Dear ${NAME},\n\n${before}`);
    }
  );

  it('changes only the first line', () => {
    const before = 'Hi there, and welcome!\nDear customer, we are here.\nHello, again.';
    expect(insertNamePlaceholder(before)).toBe(
      `Hi ${NAME}, and welcome!\nDear customer, we are here.\nHello, again.`
    );
  });

  it.each([
    ['Hi there ,\nThanks.', `Hi ${NAME} ,\nThanks.`],
    ['Dear customer\u00A0!\nThanks.', `Dear ${NAME}\u00A0!\nThanks.`],
  ])('replaces a generic addressee followed by a space before the punctuation: %j', (text, out) => {
    expect(insertNamePlaceholder(text)).toBe(out);
  });

  it.each(['Hello, John\nThanks.', 'Hi ,\u00A0Mr. Smith!\nThanks.'])(
    'sees a name after a comma and puts the line on top: %j',
    (text) => {
      expect(insertNamePlaceholder(text)).toBe(`Dear ${NAME},\n\n${text}`);
    }
  );

  it('a comma followed by a line break is not a name (control)', () => {
    expect(insertNamePlaceholder('Hello,\nJohn here.')).toBe(`Hello ${NAME},\nJohn here.`);
  });

  it.each([
    'Hi {first_name},\n\nThanks.',
    'Hi {{first_name|there}},\n\nThanks.',
    'Dear {{customer_name}},\n\nThanks.',
    'Dear {customer_name|customer},\n\nThanks.',
  ])('leaves a first line that already names the customer: %j', (text) => {
    expect(insertNamePlaceholder(text)).toBe(text);
  });
});

describe('hasNamePlaceholder', () => {
  it.each([
    '{{customer_name}}',
    '{{customer_name|there}}',
    '{customer_name}',
    '{customer_name|x}',
    '{first_name}',
    '{first_name|there}',
    '{{first_name}}',
  ])('sees %s', (placeholder) => {
    expect(hasNamePlaceholder(`Hi ${placeholder},\n\nThanks.`)).toBe(true);
  });

  it('does not see a plain greeting or a look-alike', () => {
    expect(hasNamePlaceholder('Dear customer,\n\nThanks.')).toBe(false);
    expect(hasNamePlaceholder('Hi {first_names},')).toBe(false);
  });
});
