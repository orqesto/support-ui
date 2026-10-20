/**
 * A sender's `<ol type="a">` showed as 1, 2, 3 in the thread: `.email-body ol` sets decimal and a
 * `type` attribute loses to any stylesheet rule, and CSS cannot tell `a` from `A` in Chrome. The
 * sanitizer carries it as an inline style instead (staging 2026-10-20, real stylesheet).
 */
import { describe, expect, it } from 'vitest';
import { sanitizeEmailHtml } from '../emailHtml';

const CONTEXT = { eventId: 7, apiBaseUrl: 'https://api.test', organizationId: 3 };
const listStyleOf = (html: string) => {
  const host = document.createElement('div');
  host.innerHTML = sanitizeEmailHtml(html, CONTEXT);
  return host.querySelector('ol')?.style.listStyleType ?? null;
};

describe('a sender’s <ol type> survives the thread stylesheet', () => {
  it.each([
    ['a', 'lower-alpha'],
    ['A', 'upper-alpha'],
    ['i', 'lower-roman'],
    ['I', 'upper-roman'],
    ['1', 'decimal'],
  ])('type="%s" → list-style-type %s, inline', (type, style) => {
    expect(listStyleOf(`<ol type="${type}"><li>x</li></ol>`)).toBe(style);
  });

  it('a list style the sender set is kept, not overwritten', () => {
    expect(listStyleOf('<ol type="a" style="list-style-type: upper-roman"><li>x</li></ol>')).toBe(
      'upper-roman'
    );
  });

  it('CONTROL: no type, or one HTML does not define, adds nothing', () => {
    expect(listStyleOf('<ol><li>x</li></ol>')).toBe('');
    expect(listStyleOf('<ol type="disc"><li>x</li></ol>')).toBe('');
  });
});
