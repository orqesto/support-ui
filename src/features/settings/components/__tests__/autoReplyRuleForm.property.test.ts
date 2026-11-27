import { describe, expect, it } from 'vitest';
import { insertNamePlaceholder } from '../autoReplyRuleForm';

/**
 * Property check of insertNamePlaceholder over many first lines × tails: every word of the admin
 * stays, in order (one generic addressee may be replaced), the placeholder count goes up by one
 * unless line 1 already names the customer, and nothing after line 1 changes.
 */
const NAME = '{{customer_name}}';
const GENERIC =
  /^(?:(?:dear|valued)\s+)?(?:customers?|clients?|there|friends?|all|everyone|team|sir\s+or\s+madam|sir\/madam|sir|madam|colleagues?|users?)$/i;
const NAME_IN_TEXT = /\{(?:customer_name|first_name)[|}]/;

/** Words, with every placeholder dropped on both sides so an existing one is never miscounted. */
const words = (text: string): string[] =>
  text
    .split(NAME)
    .join(' ')
    .split(/[\s,!.:;]+/u)
    .filter(Boolean);

const countNames = (text: string): number => text.split(NAME).length - 1;

const FIRST_LINES = [
  'Dear Mr. Smith,',
  'Hello and thank you for writing',
  'Hi there and thanks for the order',
  'Dear customers and partners,',
  'Good evening, team!',
  'Hey there,',
  'Greetings!',
  'Dear team: we got it',
  "Hello Ms O'Neil,",
  'Hi\tthere,',
  'Здравствуйте,',
  'Bonjour,',
  '   Hi there,',
  '\n\n  Dear customer,',
  'Hi there,\r',
  '',
  'Dear',
  'Dear ,',
  'Hi hi hello,',
  'Hello Hello there,',
  'Dear valued customer,',
  'Dear Sir or Madam,',
  'Dear sir/madam;',
  'Hi all',
  'Hi everyone.',
  'hi john,',
  'Hi-five team',
  'Hello, there',
  'Dear Customer',
  'Hi there   ,',
  'Good  morning customer!',
  'Goodmorning,',
  'Hey,',
  `Dear ${NAME},`,
  'Hi {{ customer_name }},',
  'Thanks for writing',
  '   Thanks for writing',
  'Dear customer’s family,',
  'HELLO THERE!',
  'Hi there!!!',
  'Hello there,',
  'Dear customer,',
  'Dear Mr Smith,',
  'Dear customer,',
  'Dear Mr Smith,',
  'Hi there!',
  'Dear　Sir or Madam,',
  'Good morning team.',
  ' Thanks for writing',
  'Hi 123,',
  'Hi 😀,',
  'Dear valued',
  'Dear dear customer,',
  `Hi there,${'x'.repeat(5000)}`,
  `Hello${' '.repeat(3000)}world`,
];
const TAILS = ['', '\nThanks,\nBob', '\r\nLine two\r\n', '\n\nBody {{first_name}} here'];

/** The input's words equal the output's, allowing one generic run replaced or one "Dear" on top. */
const keepsWords = (input: string, output: string): boolean => {
  const before = words(input);
  const after = words(output).join('\u0001');
  const candidates: string[][] = [before];
  for (let start = 0; start < before.length; start += 1) {
    for (let size = 1; size <= 3 && start + size <= before.length; size += 1) {
      if (GENERIC.test(before.slice(start, start + size).join(' '))) {
        candidates.push([...before.slice(0, start), ...before.slice(start + size)]);
      }
    }
  }
  return candidates.some(
    (candidate) =>
      candidate.join('\u0001') === after || ['Dear', ...candidate].join('\u0001') === after
  );
};

describe('insertNamePlaceholder properties', () => {
  it('keeps every word in order, adds one placeholder and leaves lines after line 1 as written', () => {
    const violations: string[] = [];
    for (const first of FIRST_LINES) {
      for (const tail of TAILS) {
        const input = first + tail;
        const output = insertNamePlaceholder(input);
        const body = input.trimStart();
        const named = NAME_IN_TEXT.test(body.split('\n', 1)[0] ?? '');
        const newline = body.indexOf('\n');
        const rest = newline < 0 ? '' : body.slice(newline);
        const lead = input.slice(0, input.length - body.length);
        const problems = [
          keepsWords(input, output) ? '' : 'words',
          countNames(output) === countNames(input) + (named ? 0 : 1) ? '' : 'count',
          output.endsWith(rest) ? '' : 'tail',
          output.startsWith(lead) || output.endsWith(input) ? '' : 'lead',
        ].filter(Boolean);
        if (problems.length > 0) violations.push(`${problems.join('+')}: ${JSON.stringify(input)}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it('stays linear on long runs of spaces (no ReDoS)', () => {
    const inputs = [
      ' '.repeat(50000),
      `Dear${' '.repeat(50000)}!`,
      `Dear dear${' '.repeat(50000)}x`,
      `Hi ${'a'.repeat(50000)}`,
      `Hi sir${' \t '.repeat(20000)}or`,
      `Hi${' '.repeat(50000)}valued${' '.repeat(50000)}x`,
      '{'.repeat(50000),
      `Hi there${' '.repeat(50000)}x`,
    ];
    const started = performance.now();
    for (const input of inputs) insertNamePlaceholder(input + input);
    expect(performance.now() - started).toBeLessThan(500);
  });
});
