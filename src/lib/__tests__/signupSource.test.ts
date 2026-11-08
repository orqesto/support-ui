import { describe, expect, it } from 'vitest';
import { readSignupSource } from '../signupSource';

const cookie = (value: unknown) =>
  `locale=en; odly_src=${encodeURIComponent(JSON.stringify(value))}; other=1`;

describe('readSignupSource', () => {
  it('reads the first-touch cookie and keeps only the allowed keys', () => {
    const source = readSignupSource(
      cookie({
        utm_source: 'linkedin',
        gclid: 'G1',
        landing_page: '/vs/zendesk',
        email: 'x@y.z',
        first_seen: '2026-11-07T00:00:00.000Z',
      }),
      ''
    );
    expect(source).toEqual({
      utm_source: 'linkedin',
      gclid: 'G1',
      landing_page: '/vs/zendesk',
      first_seen: '2026-11-07T00:00:00.000Z',
    });
  });

  it('prefers the cookie (first touch) over campaign parameters on the URL', () => {
    expect(readSignupSource(cookie({ utm_source: 'first' }), '?utm_source=later')).toEqual({
      utm_source: 'first',
    });
  });

  it('falls back to the URL campaign parameters when there is no cookie, ignoring other params', () => {
    expect(
      readSignupSource('locale=en', '?plan=pro&utm_campaign=launch&fbclid=F&email=x@y.z')
    ).toEqual({
      utm_campaign: 'launch',
      fbclid: 'F',
    });
  });

  it('never takes landing_page / referrer from the URL — only the cookie knows the first visit', () => {
    expect(readSignupSource('', '?landing_page=/x&referrer=https://evil.example')).toBeUndefined();
  });

  it('drops a malformed cookie and still reads the URL', () => {
    expect(readSignupSource('odly_src=%7Bnot-json', '?utm_source=x')).toEqual({ utm_source: 'x' });
    expect(readSignupSource(cookie(['array']), '?utm_source=y')).toEqual({ utm_source: 'y' });
  });

  it('trims, clips to 200 characters and drops non-strings and empties', () => {
    const source = readSignupSource(
      cookie({ utm_term: ` ${'a'.repeat(300)} `, utm_source: 42, utm_medium: '  ' }),
      ''
    );
    expect(source).toEqual({ utm_term: 'a'.repeat(200) });
  });

  it('falls back to the URL when the cookie has no usable key', () => {
    expect(readSignupSource(cookie({ email: 'x@y.z' }), '?utm_source=url')).toEqual({
      utm_source: 'url',
    });
  });

  it('drops NUL / control characters and lone surrogates, and never splits an emoji at 200', () => {
    expect(readSignupSource('', '?utm_source=a%00b&utm_medium=%01')).toEqual({ utm_source: 'ab' });
    expect(readSignupSource(cookie({ utm_source: 'x\ud800y', utm_term: '\udc00' }), '')).toEqual({
      utm_source: 'xy',
    });
    const term = readSignupSource(cookie({ utm_term: `${'a'.repeat(199)}😀tail` }), '')?.utm_term;
    expect(term).toBe('a'.repeat(199));
  });

  it('returns undefined when there is nothing to send', () => {
    expect(readSignupSource('locale=en', '?plan=pro')).toBeUndefined();
  });
});
