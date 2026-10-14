/**
 * liftLinks — review of #597: a sentinel sequence already in the source text was read back as a
 * token (the link printed twice), and a URL's last character could never be `)` or `_`.
 */
import { describe, it, expect } from 'vitest';
import { liftLinks } from '../liftLinks';
import { renderMarkdown } from '@/components/messages/messageDetailConstants';

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
