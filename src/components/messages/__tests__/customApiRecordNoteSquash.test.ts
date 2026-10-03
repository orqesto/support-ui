/**
 * Mutation batch (message detail v4), chunk 6: a record's sentence is written into the reply with
 * its whitespace squashed — runs of spaces and line breaks become one space — and recognised the
 * same way. `/\s/g` (one char at a time) survived: it leaves double spaces.
 */
import { describe, it, expect } from 'vitest';
import { appendReplyParagraph, replyHasSentence } from '../customApiRecordNote';

describe('the record sentence in the reply', () => {
  it('runs of whitespace become one space, the ends trimmed', () => {
    expect(appendReplyParagraph('', '  Order 12  \n\n shipped on\t2026-09-16 ')).toBe(
      '<p>Order 12 shipped on 2026-09-16</p>'
    );
  });

  it('a sentence already in the reply is recognised whatever its whitespace', () => {
    const reply = '<p>Hi</p><p>Order 12 shipped on 2026-09-16</p>';
    expect(replyHasSentence(reply, 'Order   12 shipped\non 2026-09-16')).toBe(true);
    expect(replyHasSentence(reply, 'Order 13 shipped on 2026-09-16')).toBe(false);
  });
});
