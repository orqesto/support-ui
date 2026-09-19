import { describe, it, expect } from 'vitest';
import { sanitizeEmailHtml, imageProxyBase } from '@/lib/emailHtml';

const CTX = { eventId: 5, apiBaseUrl: 'https://api.test', organizationId: 7 };
const render = (html: string) => sanitizeEmailHtml(html, CTX);

/**
 * Written as audit pass 7 and kept, because the cheapest place to catch the next regression in
 * this filter is a list of inputs that already tried to get past it. Covers: escape-obfuscated
 * `url()` and semicolons, entity-encoded and case-varied urls, CSS comments, empty and
 * malformed declarations, value-restricted `display`, whitespace-prefixed and entity-encoded
 * `javascript:`, `@import` smuggled through `<svg><style>`, class injection, deep nesting, and
 * empty input.
 *
 * The origin assertion is the load-bearing one: it does not care WHICH vector was used, only
 * that nothing the browser would fetch points anywhere but at us.
 */
describe('adversarial sweep over the email renderer', () => {
  const NASTY = [
    '<img src=x onerror=alert(1)>',
    '<div style="background:url(\\75 rl)">x</div>',
    '<div style="width:1px\\3b color:red">x</div>',
    '<div style="background-image:url(HTTPS://EVIL.test/a.png)">x</div>',
    '<div style="background-image:URL( &quot;https://evil.test/a.png&quot; )">x</div>',
    '<div style="/*x*/color:red">x</div>',
    '<div style=";;;;">x</div>',
    '<div style="color">x</div>',
    '<div style="display:FLEX">x</div>',
    '<div style="display:  table-cell  ">x</div>',
    '<a href=" javascript:alert(1)">x</a>',
    '<a href="jaVaScRiPt:alert(1)">x</a>',
    '<a href="&#106;avascript:alert(1)">x</a>',
    '<svg><style>@import url(https://evil.test/a.css)</style></svg>',
    '<table><tr><td style="background-image:url(https://evil.test/p.gif)">x</td></tr></table>',
    '<div style="color:red" class="prose">x</div>',
    '<img src="https://api.test/api/organizations/7/messages/events/5/image?src=a" style="height:9px">',
    '<p>'.repeat(60) + 'deep' + '</p>'.repeat(60),
    '',
    '   ',
  ];
  it('never emits script-ish output, never reaches a foreign origin, never throws', () => {
    for (const input of NASTY) {
      let out = '';
      expect(() => {
        out = render(input);
      }, `threw on: ${input}`).not.toThrow();
      expect(out.toLowerCase(), input).not.toContain('onerror');
      expect(out.toLowerCase(), input).not.toContain('javascript:');
      expect(out.toLowerCase(), input).not.toContain('<script');
      expect(out.toLowerCase(), input).not.toContain('@import');
      // every fetchable url must be ours
      const doc = new DOMParser().parseFromString(`<body>${out}</body>`, 'text/html');
      for (const el of doc.querySelectorAll('*')) {
        const urls = [el.getAttribute('src')].filter(Boolean) as string[];
        for (const match of (el.getAttribute('style') ?? '').matchAll(
          /url\(\s*"?([^")]+)"?\s*\)/gi
        ))
          urls.push(match[1]);
        for (const url of urls)
          expect(new URL(url).origin, `${input} -> ${url}`).toBe('https://api.test');
      }
    }
  });
  it('keeps the legitimate proxied image and its geometry', () => {
    const ours = imageProxyBase(CTX);
    const out = render(`<img src="${ours}?src=a" width="9" height="9">`);
    expect(out).toContain('<img');
    expect(out).toContain('width="9"');
  });
});
