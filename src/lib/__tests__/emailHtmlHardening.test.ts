import { describe, it, expect } from 'vitest';
import { sanitizeEmailHtml, imageProxyBase } from '../emailHtml';

const CONTEXT = { eventId: 5690, apiBaseUrl: 'https://api.test', organizationId: 21 };
const render = (html: string) => sanitizeEmailHtml(html, CONTEXT);

/**
 * Findings from audit pass 1 over this feature's own diff. Each of these was a defect I had
 * written and did not see until the diff was read against the DATA rather than against itself.
 */

describe("FORBID_CONTENTS must stay at DOMPurify's default", () => {
  /**
   * ⛔ The regression this pins: setting `FORBID_CONTENTS` REPLACES DOMPurify's default list
   * rather than extending it. I had set it to `['style','script','title','head']` as "defence
   * in depth". The default is far longer — `svg`, `math`, `template`, `noscript`, `plaintext`,
   * `xmp` — and dropping those from the list is what lets namespace-confusion content through.
   *
   * Measured before the fix: this probe rendered `"SVGTEXTMATHTEXTNOSCRIPTTEXT"`.
   */
  const PROBE =
    '<svg><desc>SVGTEXT</desc></svg>' +
    '<math><mi>MATHTEXT</mi></math>' +
    '<noscript>NOSCRIPTTEXT</noscript>' +
    '<style>STYLETEXT</style>';

  it('drops the CONTENTS of svg, math, noscript and style, not just the elements', () => {
    const out = render(PROBE);
    for (const leak of ['SVGTEXT', 'MATHTEXT', 'NOSCRIPTTEXT', 'STYLETEXT']) {
      expect(out, `${leak} leaked through as text`).not.toContain(leak);
    }
  });

  it('negative control: the probe really does carry that text', () => {
    // A clean result proves nothing if the strings were never in the input.
    for (const leak of ['SVGTEXT', 'MATHTEXT', 'NOSCRIPTTEXT', 'STYLETEXT']) {
      expect(PROBE).toContain(leak);
    }
  });
});

describe('links an email actually contains', () => {
  it('keeps mailto: and tel:, which a signature is mostly made of', () => {
    // `^https?:` stripped every one of these, so a contact block rendered as dead text.
    const out = render(
      '<a href="mailto:natalie@prefabhome.eu">mail</a><a href="tel:+37123558987">call</a>'
    );
    expect(out).toContain('href="mailto:natalie@prefabhome.eu"');
    expect(out).toContain('href="tel:+37123558987"');
  });

  it('still refuses the schemes that can execute', () => {
    for (const href of ['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>']) {
      const out = render(`<a href="${href}">x</a>`);
      expect(out, href).not.toContain('href=');
    }
  });

  it('opens surviving links away from the console', () => {
    const out = render('<a href="https://example.test">x</a>');
    expect(out).toContain('target="_blank"');
    expect(out).toContain('rel="noopener noreferrer"');
  });
});

describe('the proxy url has ONE builder', () => {
  it('agrees with the url proxyRemoteImages actually writes', async () => {
    /**
     * ⛔ The silent-total failure this pins. `proxyRemoteImages` WRITES an `<img src>`; the
     * renderer's last-line-of-defence hook DELETES any `<img>` whose src does not start with
     * `imageProxyBase(...)`. These were two separate copies of the same template string until
     * the 2026-09-19 audit. A one-character drift removes every image from every email, with
     * no error raised anywhere — so the agreement is asserted rather than assumed.
     */
    const { proxyRemoteImages } = await import('@/components/messages/messageDetailConstants');
    for (const organizationId of [21, null]) {
      const context = { eventId: 5690, apiBaseUrl: 'https://api.test', organizationId };
      const written = proxyRemoteImages(
        '<img src="https://sender.test/a.png">',
        context.eventId,
        context.apiBaseUrl,
        context.organizationId
      );
      const expected = imageProxyBase(context);
      expect(written, `org=${organizationId}`).toContain(`src="${expected}?src=`);
      // And the renderer keeps that image rather than deleting it.
      expect(sanitizeEmailHtml(written, context)).toContain('<img');
    }
  });
});
