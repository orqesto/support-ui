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

  it('drops inline styles, matching the inbox thread sanitiser', () => {
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
