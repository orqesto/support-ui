/**
 * liftLinks — review of #597: a sentinel sequence already in the source text was read back as a
 * token (the link printed twice), and a URL's last character could never be `)` or `_`.
 */
import { describe, it, expect } from 'vitest';
import { liftLinks } from '../liftLinks';
import {
  renderMarkdown,
  suggestedAnswerToHtml,
} from '@/components/messages/messageDetailConstants';

const SENTINEL = '';
const linked = (raw: string, options?: { markdown?: boolean }): string => {
  const links = liftLinks(raw, options);
  return links.restore(links.text);
};

describe('liftLinks — sentinels already in the source', () => {
  it('🔴 a typed "\\uE000 0 \\uE000" is text, not link 0 printed again', () => {
    const html = renderMarkdown(`a ${SENTINEL}0${SENTINEL} b https://x.example/`);
    expect(html.match(/<a /g)).toHaveLength(1);
    expect(html).toBe(
      `a ${SENTINEL}0${SENTINEL} b <a href="https://x.example/" target="_blank" rel="noopener noreferrer">https://x.example/</a>`
    );
  });

  it('🔴 lone and adjacent sentinels and digits come back unchanged', () => {
    for (const raw of [
      SENTINEL,
      `${SENTINEL}5`,
      `${SENTINEL}${SENTINEL}`,
      `x${SENTINEL}1${SENTINEL}${SENTINEL}0${SENTINEL}y`,
    ]) {
      expect(linked(raw)).toBe(raw);
    }
    expect(linked(`[a${SENTINEL}](https://z.example/)`, { markdown: true })).toBe(
      `<a href="https://z.example/">a${SENTINEL}</a>`
    );
    expect(
      linked(`${SENTINEL}1${SENTINEL} https://x.example/ ${SENTINEL}0${SENTINEL}`, {
        markdown: true,
      })
    ).toBe(
      `${SENTINEL}1${SENTINEL} <a href="https://x.example/">https://x.example/</a> ${SENTINEL}0${SENTINEL}`
    );
  });
});

describe('liftLinks — where a URL ends', () => {
  it('🔴 balanced parentheses and a trailing underscore stay in the URL', () => {
    expect(linked('See https://wiki.example/wiki/Foo_(bar) now')).toBe(
      'See <a href="https://wiki.example/wiki/Foo_(bar)">https://wiki.example/wiki/Foo_(bar)</a> now'
    );
    expect(linked('(https://wiki.example/wiki/Foo_(bar)).')).toBe(
      '(<a href="https://wiki.example/wiki/Foo_(bar)">https://wiki.example/wiki/Foo_(bar)</a>).'
    );
    expect(linked('Token: https://x.example/reset_ ok')).toBe(
      'Token: <a href="https://x.example/reset_">https://x.example/reset_</a> ok'
    );
  });

  it('CONTROL: prose parentheses and sentence punctuation are not part of the URL', () => {
    expect(linked('(see https://x.example/a).')).toBe(
      '(see <a href="https://x.example/a">https://x.example/a</a>).'
    );
    expect(linked('Go to https://x.example/a?b=1, then https://y.example/!')).toBe(
      'Go to <a href="https://x.example/a?b=1">https://x.example/a?b=1</a>, then <a href="https://y.example/">https://y.example/</a>!'
    );
    expect(linked('just https:// and https://.')).toBe('just https:// and https://.');
  });

  it('a long run of closing parentheses is trimmed in linear time', () => {
    const raw = `https://x.example/${'('.repeat(1)}${')'.repeat(200_000)}`;
    const started = performance.now();
    const out = linked(raw);
    expect(performance.now() - started).toBeLessThan(2000);
    expect(out.startsWith('<a href="https://x.example/()">')).toBe(true);
  });
});

describe('liftLinks — a trailing `_` that closes emphasis (review of #597 follow-up)', () => {
  const linkTo = (href: string) =>
    `<a href="${href}" target="_blank" rel="noopener noreferrer">${href}</a>`;

  it('🔴 `_see https://…/a_` italicises, and the href ends at `a`', () => {
    expect(renderMarkdown('Please _see https://x.example/a_ now')).toBe(
      `Please <em>see ${linkTo('https://x.example/a')}</em> now`
    );
    expect(suggestedAnswerToHtml('Please _see https://x.example/a_ now')).toBe(
      '<p>Please <em>see <a href="https://x.example/a">https://x.example/a</a></em> now</p>'
    );
  });

  it('🔴 `_(https://…/a)_` — `_` and `)` trimmed in either order', () => {
    expect(renderMarkdown('Note: _(https://x.example/a)_ end')).toBe(
      `Note: <em>(${linkTo('https://x.example/a')})</em> end`
    );
    expect(suggestedAnswerToHtml('Note: _(https://x.example/a)_ end')).toBe(
      '<p>Note: <em>(<a href="https://x.example/a">https://x.example/a</a>)</em> end</p>'
    );
    expect(linked('_x https://x.example/a_).')).toBe(
      '_x <a href="https://x.example/a">https://x.example/a</a>_).'
    );
  });

  it('CONTROL: with no open emphasis, or one closed earlier, a trailing `_` stays in the URL', () => {
    expect(renderMarkdown('Token: https://x.example/reset_ ok')).toBe(
      `Token: ${linkTo('https://x.example/reset_')} ok`
    );
    expect(linked('_done_ then https://x.example/reset_ ok')).toBe(
      '_done_ then <a href="https://x.example/reset_">https://x.example/reset_</a> ok'
    );
    // An `_` on an earlier line does not open anything on this one.
    expect(linked('a _b\nhttps://x.example/reset_ ok')).toBe(
      'a _b\n<a href="https://x.example/reset_">https://x.example/reset_</a> ok'
    );
    // Underscores inside an earlier URL are not emphasis.
    expect(linked('https://x.example/a_b and https://x.example/reset_ ok')).toBe(
      '<a href="https://x.example/a_b">https://x.example/a_b</a> and <a href="https://x.example/reset_">https://x.example/reset_</a> ok'
    );
  });
});

describe('liftLinks — balanced parens inside a markdown link URL (review of #597 follow-up)', () => {
  it('🔴 `[t](https://…/a_(b))` keeps the `(b)` and leaves no stray `)`', () => {
    expect(linked('[t](https://x.example/a_(b)) after', { markdown: true })).toBe(
      '<a href="https://x.example/a_(b)">t</a> after'
    );
    expect(suggestedAnswerToHtml('[t](https://x.example/a_(b)) after')).toBe(
      '<p><a href="https://x.example/a_(b)">t</a> after</p>'
    );
  });

  it('CONTROL: a plain markdown link and prose parens around one are unchanged', () => {
    expect(linked('([t](https://x.example/a)) after', { markdown: true })).toBe(
      '(<a href="https://x.example/a">t</a>) after'
    );
  });

  it('unclosed parens in a long markdown-link URL are rejected in linear time', () => {
    const raw = `[t](https://x.example/${'(a'.repeat(100_000)}`;
    const started = performance.now();
    linked(raw, { markdown: true });
    expect(performance.now() - started).toBeLessThan(2000);
  });
});
