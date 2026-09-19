/**
 * The public tracking page's event HTML must pass through DOMPurify like every other
 * `dangerouslySetInnerHTML` sink in `src/`.
 *
 * It was the one that did not: `linkifyHtml(event.content)` went straight into the DOM
 * on the strength of the BE having sanitised it. Audit u39 P1-4.
 */
import { describe, expect, it } from 'vitest';
import { renderEventHtml } from '@/pages/TrackingPage';

describe('renderEventHtml', () => {
  it('THE FIX: strips inline event-handler attributes', () => {
    const html = renderEventHtml(
      '<p onclick="steal()">Hi <a href="https://shop.test/order/1" onmouseover="steal()">order</a></p>'
    );
    expect(html).not.toMatch(/onclick/i);
    expect(html).not.toMatch(/onmouseover/i);
    expect(html).toContain('href="https://shop.test/order/1"');
    expect(html).toContain('order');
  });

  it('drops script and image sinks, and non-http(s) link targets', () => {
    const html = renderEventHtml(
      '<p>x<script>steal()</script><img src="x" onerror="steal()"><a href="javascript:steal()">go</a></p>'
    );
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/<img/i);
    expect(html).not.toMatch(/onerror/i);
    expect(html).not.toMatch(/javascript:/i);
    expect(html).toContain('go');
  });

  /**
   * ⚠️ RENAMED 2026-09-19. This used to be called "drops inline styles, matching the inbox
   * thread sanitiser", and that justification is now FALSE: the inbox thread renders sender
   * mail through `sanitizeEmailHtml`, which keeps a filtered inline-`style` subset.
   *
   * The assertion is unchanged and still correct — this page keeps dropping style — but the
   * reason is its own, not parity with the thread. It is PUBLIC and unauthenticated, it allows
   * no `img`, and it has no event id to scope an image proxy with, so it deliberately did not
   * adopt the email renderer. Left as "matching the thread", the next person reconciling the
   * two would have widened an anonymous surface to restore an equivalence that no longer holds.
   */
  it('drops inline styles — this page is public and does NOT use the email renderer', () => {
    const html = renderEventHtml('<p style="position:fixed">hi</p>');
    expect(html).not.toMatch(/style=/i);
    expect(html).toContain('hi');
  });

  it('CONTROL: keeps the formatting the BE allows and still linkifies bare URLs', () => {
    const html = renderEventHtml(
      '<p>See <strong>https://shop.test/track/abc</strong> and <a href="https://shop.test/help">help</a></p>'
    );
    expect(html).toContain('<strong>');
    expect(html).toContain('href="https://shop.test/track/abc"');
    expect(html).toContain('href="https://shop.test/help"');
  });
});
