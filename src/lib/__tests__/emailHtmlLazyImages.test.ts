import { describe, expect, it } from 'vitest';
import { imageProxyBase, sanitizeEmailHtml } from '../emailHtml';

// Every email image goes through the backend's image proxy: a long thread must not ask for all
// of them the moment it opens.
describe('email images load lazily', () => {
  const context = { eventId: 5690, apiBaseUrl: 'https://api.test', organizationId: 21 };

  it('an image gets loading="lazy" and decoding="async"', () => {
    const out = sanitizeEmailHtml(
      `<p>hi</p><img src="${imageProxyBase(context)}?src=https%3A%2F%2Fsender.test%2Fa.png">`,
      context
    );
    const img = new DOMParser().parseFromString(out, 'text/html').querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('loading')).toBe('lazy');
    expect(img?.getAttribute('decoding')).toBe('async');
  });

  it('CONTROL — nothing else gets the attributes', () => {
    const out = sanitizeEmailHtml('<p>hi</p><a href="https://example.com">x</a>', context);
    expect(out).not.toContain('loading=');
  });
});
