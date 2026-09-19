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

describe('the image guard is pinned to THIS message', () => {
  it('refuses our own proxy url when it names a different event or workspace', () => {
    /**
     * ⛔ Stricter than `isProxiedImageUrl` ON PURPOSE. That helper answers "did we write this
     * url?" and accepts any event and any org. Here the question is "did we write it FOR THIS
     * MESSAGE?" — otherwise a sender can hand us a proxy url scoped to a message, or a
     * workspace, other than the one on screen and have the console fetch it.
     */
    const ours = imageProxyBase(CONTEXT);
    expect(render(`<img src="${ours}?src=https%3A%2F%2Fa.test%2Fx.png">`)).toContain('<img');

    for (const foreign of [
      'https://api.test/api/organizations/21/messages/events/999/image?src=x',
      'https://api.test/api/organizations/99/messages/events/5690/image?src=x',
      'https://api.test/api/messages/events/5690/image?src=x',
    ]) {
      expect(render(`<img src="${foreign}">`), foreign).not.toContain('<img');
    }
  });
});

describe('against real mail, not invented fixtures', () => {
  /**
   * Shapes taken from the four messages actually on staging (events 6072, 5690, 12811, 12875),
   * measured rather than imagined: 2554 declarations, 36 distinct properties, and 88 style
   * attributes containing quotes.
   *
   * ⚠️ What this test does and does NOT prove. It pins that a real HTML-ENCODED font stack
   * (`&quot;Times New Roman&quot;,Times,serif`, 195 occurrences in the sample) survives
   * decoding and filtering intact. It does NOT exercise the quote-aware splitter, and an
   * earlier version of this comment claimed it did: the encoded `&quot;` ends in a semicolon,
   * but the DOM decodes the attribute BEFORE the filter sees it, so by then there is no
   * semicolon inside the quotes. A control confirmed it — replacing `splitDeclarations` with a
   * plain `split(';')` leaves this test GREEN.
   *
   * Measured on the same real population: across 915 style attributes the quote/paren-aware
   * splitter and a naive split produce identical output in 915 cases and differ in 0. The
   * splitter is therefore defensive rather than load-bearing here; what genuinely needs it
   * (`url(data:…;base64,…)`, a quoted value containing `;`) is covered by the unit tests in
   * `emailCss.test.ts`, not by this one.
   */
  it('keeps a quoted font stack intact', () => {
    // NB the wrapper: a bare <td> outside a <table> is dropped by the HTML parser, so the
    // first version of this test asserted against the empty string and failed for a reason
    // that had nothing to do with the font stack.
    const out = render(
      '<table><tr><td style="font-family:&quot;Times New Roman&quot;,Times,serif; color:#333">x</td></tr></table>' +
        '<div style="font-family:&quot;Open Sans&quot;,sans-serif">y</div>'
    );
    expect(out).toContain('Times New Roman');
    expect(out).toContain('Times,serif');
    expect(out).toContain('color: #333');
  });

  it('keeps the two properties real mail used that the allowlist first missed', () => {
    const out = render(
      '<div style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; text-decoration-line:underline">x</div>'
    );
    for (const decl of ['text-overflow', 'text-decoration-line', 'overflow', 'white-space']) {
      expect(out, `${decl} was dropped`).toContain(decl);
    }
  });

  it('still rejects the properties real mail used that we refuse on purpose', () => {
    // These four also appear in that same real sample. Surviving is the failure.
    const out = render(
      '<div style="position:absolute; top:0; cursor:url(https://e.test/c.cur),auto; border-image:url(https://e.test/b.png)">x</div>'
    );
    for (const decl of ['position', 'top:', 'cursor', 'border-image']) {
      expect(out, `${decl} survived`).not.toContain(decl);
    }
  });

  it('keeps lang and aria-label, which real mail carries', () => {
    const out = render('<a href="https://x.test" aria-label="A1.jpeg" lang="lv">x</a>');
    expect(out).toContain('aria-label="A1.jpeg"');
    expect(out).toContain('lang="lv"');
  });
});
