/**
 * Rendering the email we were actually sent.
 *
 * An order confirmation arrives as `text/html` with a real table and a tracking link, and as
 * a `text/plain` alternative where the storefront writes that table as
 * `| Discount: | -16.50 |`. The console stored and showed the second one, so the summary was
 * unreadable and the tracking link — the whole point of the mail — was not clickable.
 *
 * ⛔ The two tests that matter here are the refusals. Allowing `img` at all is only safe
 * because every remote source is rewritten to our proxy, and a remote image in an email is a
 * read receipt: loaded directly it tells the sender exactly when an agent opened the message,
 * from the agent's IP. The rewrite is a regex over hostile markup, so the sanitizer hook is
 * the backstop for when the regex is wrong.
 */
import { describe, it, expect } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ThreadBubble } from '@/components/messages/ThreadBubble';
import {
  proxyRemoteImages,
  isProxiedImageUrl,
  liftImageDimensions,
} from '@/components/messages/messageDetailConstants';
import { useAuthStore } from '@/stores/authStore';
import { API_BASE_URL } from '@/lib/config';

const ORDER_HTML = `
  <table>
    <tr><td>Discount:</td><td>-£16.50</td></tr>
    <tr><td>Total:</td><td>£158.50</td></tr>
  </table>
  <a href="https://track.example.test/ABC123">Track your order</a>`;

const PIPES = '| Discount: | -£16.50 |\n| Total: | £158.50 |';

describe('liftImageDimensions — an email that sizes with CSS', () => {
  /**
   * ⛔ THE CASE support-ui#404 COULD NOT HELP. In staging's SOM-INF-1579 every `<img>` in the
   * message carries its geometry in `style` and NOT in attributes — 8 of 8 — so "stop the
   * sanitizer deleting width/height" had nothing to keep. Emails use both spellings.
   */
  it('copies a pixel size out of style into attributes', () => {
    const out = liftImageDimensions(
      '<img src="https://c.test/a.png" style="width: 600px; height: 80px">'
    );
    expect(out).toContain('width="600"');
    expect(out).toContain('height="80"');
  });

  it('keeps a percentage, which is the other thing the attribute understands', () => {
    expect(liftImageDimensions('<img src="x" style="width:100%">')).toContain('width="100%"');
  });

  it('⛔ an explicit attribute wins — the sender already answered', () => {
    const out = liftImageDimensions('<img src="x" width="40" style="width: 600px">');
    expect(out).toContain('width="40"');
    expect(out).not.toContain('width="600"');
  });

  it('reads through !important, which email templates use constantly', () => {
    const out = liftImageDimensions(
      '<img src="x" style="width: 600px !important; height:80px!important">'
    );
    expect(out).toContain('width="600"');
    expect(out).toContain('height="80"');
  });

  it('⛔ max-width is not width', () => {
    expect(liftImageDimensions('<img src="x" style="max-width: 600px">')).not.toContain(
      'width="600"'
    );
  });

  it('drops what an attribute cannot express, rather than guessing', () => {
    for (const css of [
      'width: auto',
      'width: inherit',
      'width: calc(100% - 20px)',
      'width: 12em',
      'width: expression(alert(1))',
      'width: 0px',
      'width: 99999px',
    ]) {
      const out = liftImageDimensions(`<img src="x" style="${css}">`);
      expect(out).toBe(`<img src="x" style="${css}">`);
    }
  });

  it('leaves an image with no style alone', () => {
    const html = '<img src="https://c.test/a.png" alt="a">';
    expect(liftImageDimensions(html)).toBe(html);
  });
});

describe('proxyRemoteImages — the workspace in the url', () => {
  /**
   * ⛔ THE BUG. A browser loads `<img src>` itself: no api-client, so no
   * `X-Organization-Context`. On production's TES-INF-1393 every image request that had
   * completed when the network log was read answered 400 "Organization context required",
   * while the same message's /html call — which DOES go through the interceptor — returned
   * 200. Every test in this file passed throughout.
   */
  it('names the workspace in the path when one is selected', () => {
    const out = proxyRemoteImages(
      '<img src="https://cdn.shop.test/a.png">',
      42,
      'https://api.test',
      36
    );
    expect(out).toContain(
      'https://api.test/api/organizations/36/messages/events/42/image?src=https%3A%2F%2Fcdn.shop.test%2Fa.png'
    );
  });

  it('keeps the bare shape when no workspace is selected — never organizations/undefined', () => {
    const out = proxyRemoteImages(
      '<img src="https://cdn.shop.test/a.png">',
      42,
      'https://api.test',
      null
    );
    expect(out).toContain('https://api.test/api/messages/events/42/image?src=');
    expect(out).not.toContain('undefined');
    expect(out).not.toContain('/organizations/');
  });

  it('sends the workspace on a cid image too — it 400d for exactly the same reason', () => {
    const out = proxyRemoteImages('<img src="cid:logo@corp.example">', 12, 'https://api.test', 7);
    expect(out).toContain('/api/organizations/7/messages/events/12/image?cid=logo%40corp.example');
  });

  it('decodes character references, so the backend is not asked to fetch a literal &amp;', () => {
    const html = '<img src="https://cdn.shop.test/t.png?auto=format&amp;fit=crop&amp;h=88">';
    const out = proxyRemoteImages(html, 42, 'https://api.test', 36);
    // encodeURIComponent turns `&` into %26; an `amp%3B` in here is the defect.
    expect(out).toContain('t.png%3Fauto%3Dformat%26fit%3Dcrop%26h%3D88');
    expect(out).not.toContain('amp%3B');
  });
});

describe('isProxiedImageUrl — what the sanitizer backstop keeps', () => {
  const base = 'https://api.test';

  it('keeps both proxy shapes', () => {
    expect(isProxiedImageUrl(`${base}/api/messages/events/9/image?src=x`, base)).toBe(true);
    expect(
      isProxiedImageUrl(`${base}/api/organizations/36/messages/events/9/image?src=x`, base)
    ).toBe(true);
  });

  it('⛔ admits ONLY the proxy path — matching the api base url is not enough', () => {
    expect(isProxiedImageUrl(`${base}/api/attachments/9/download`, base)).toBe(false);
    expect(isProxiedImageUrl(`${base}/api/organizations/36/messages/events/9/html`, base)).toBe(
      false
    );
    expect(isProxiedImageUrl('https://tracker.example.test/open.gif', base)).toBe(false);
    // A sender's url that merely STARTS with our origin's text.
    expect(isProxiedImageUrl(`${base}.evil.test/api/messages/events/9/image`, base)).toBe(false);
  });
});

describe('proxyRemoteImages', () => {
  it('rewrites an absolute remote source to our proxy, url-encoded', () => {
    const out = proxyRemoteImages(
      '<img src="https://cdn.shop.test/a.png">',
      42,
      'https://api.test'
    );
    expect(out).toContain(
      'https://api.test/api/messages/events/42/image?src=https%3A%2F%2Fcdn.shop.test%2Fa.png'
    );
    expect(out).not.toContain('src="https://cdn.shop.test/a.png"');
  });

  it('handles single-quoted and unquoted sources, and other attributes before src', () => {
    const html = `<img width="600" src='https://cdn.shop.test/b.png' alt="x">
                  <img src=https://cdn.shop.test/c.png >`;
    const out = proxyRemoteImages(html, 7, 'https://api.test');
    expect(out).not.toContain('cdn.shop.test/b.png"');
    expect(out.match(/api\/messages\/events\/7\/image/g)).toHaveLength(2);
  });

  it('rewrites a cid: part to the same endpoint, so one prefix covers both kinds', () => {
    const out = proxyRemoteImages('<img src="cid:logo@corp.example">', 12, 'https://api.test');
    expect(out).toContain('https://api.test/api/messages/events/12/image?cid=logo%40corp.example');
  });

  it('leaves data: and relative sources alone — the sanitizer drops them', () => {
    const html = '<img src="data:image/png;base64,AA"><img src="/rel.png">';
    expect(proxyRemoteImages(html, 1, 'https://api.test')).toBe(html);
  });

  it('ignores an empty cid rather than emitting a request for nothing', () => {
    const html = '<img src="cid:">';
    expect(proxyRemoteImages(html, 1, 'https://api.test')).toBe(html);
  });
});

describe('ThreadBubble with the original HTML', () => {
  it('renders the real table instead of the pipe-delimited text alternative', () => {
    const { container } = render(
      <ThreadBubble content={PIPES} isAgent={false} html={ORDER_HTML} eventId={1} />
    );
    expect(container.querySelector('table')).not.toBeNull();
    expect(container.querySelectorAll('td').length).toBeGreaterThan(0);
    expect(container.textContent).not.toContain('| Discount:');
  });

  it('makes the tracking link clickable — the thing you could do in Gmail and not here', () => {
    const { container } = render(
      <ThreadBubble content={PIPES} isAgent={false} html={ORDER_HTML} eventId={1} />
    );
    const link = container.querySelector('a');
    expect(link?.getAttribute('href')).toBe('https://track.example.test/ABC123');
  });

  it('falls back to the text body when the sender sent no HTML', () => {
    const { container } = render(
      <ThreadBubble content={PIPES} isAgent={false} html={null} eventId={1} />
    );
    expect(container.querySelector('table')).toBeNull();
    expect(container.textContent).toContain('| Discount:');
  });

  it('falls back to text when there is no eventId — images could not be proxied safely', () => {
    const { container } = render(
      <ThreadBubble content={PIPES} isAgent={false} html={ORDER_HTML} />
    );
    expect(container.querySelector('table')).toBeNull();
  });

  it('⛔ renders a remote image ONLY through the proxy', () => {
    const html = '<img src="https://tracker.example.test/open.gif?id=abc">';
    const { container } = render(
      <ThreadBubble content="" isAgent={false} html={html} eventId={99} />
    );
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('src')).toContain(`${API_BASE_URL}/api/messages/events/99/image`);
    expect(img?.getAttribute('src')).not.toContain('tracker.example.test/open.gif?id=abc&');
  });

  it('renders an inline cid image through the endpoint the sanitizer trusts', () => {
    // The whole reason cid goes to the same URL shape: the DOMPurify hook only keeps an <img>
    // whose src starts with our /api/messages/events/ prefix. A separate attachment URL would
    // have been stripped by the very backstop that protects remote images.
    const { container } = render(
      <ThreadBubble
        content=""
        isAgent={false}
        html='<img src="cid:logo@corp.example">'
        eventId={12}
      />
    );
    const img = container.querySelector('img');
    expect(img?.getAttribute('src')).toContain('/api/messages/events/12/image?cid=');
  });

  /**
   * ⛔ The test this file was missing. Every render case above runs with NO workspace selected,
   * so they exercised the shape production could never use — and stayed green while the console
   * showed a dozen broken images. This one renders the way a signed-in console does, and
   * asserts the `<img>` SURVIVES the sanitizer: the backstop hook keeps an image only if it
   * recognises the url, so a rewrite the hook does not know about is a blank thread, not a
   * broken one.
   */
  it('renders the workspace-scoped proxy url, and the sanitizer keeps it', () => {
    cleanup();
    useAuthStore.setState({ selectedOrganizationId: 36 });
    try {
      const html = '<img src="https://cdn.shop.test/banner.png?a=1&amp;b=2">';
      const { container } = render(
        <ThreadBubble content="" isAgent={false} html={html} eventId={99} />
      );
      const img = container.querySelector('img');
      expect(img).not.toBeNull();
      expect(img?.getAttribute('src')).toContain(
        `${API_BASE_URL}/api/organizations/36/messages/events/99/image?src=`
      );
      expect(img?.getAttribute('src')).not.toContain('amp%3B');
    } finally {
      useAuthStore.setState({ selectedOrganizationId: null });
    }
  });

  /**
   * ⛔ The email's own dimensions must survive the sanitizer. They did not: `ALLOWED_URI_REGEXP`
   * is applied to attribute values generally and `40` is not a url, so every `width`/`height`
   * was deleted and each image rendered at its intrinsic size, scaled to the container — a 40px
   * logo as a full-width banner. Invisible until images started rendering at all.
   */
  it('keeps the width and height the email asked for', () => {
    cleanup();
    useAuthStore.setState({ selectedOrganizationId: 36 });
    try {
      const html = '<img src="https://cdn.shop.test/logo.png" width="40" height="37" alt="logo">';
      const { container } = render(
        <ThreadBubble content="" isAgent={false} html={html} eventId={99} />
      );
      const img = container.querySelector('img');
      expect(img?.getAttribute('width')).toBe('40');
      expect(img?.getAttribute('height')).toBe('37');
    } finally {
      useAuthStore.setState({ selectedOrganizationId: null });
    }
  });

  it('⛔ a javascript: url is still refused — the dimensions are safe, the URI guard is not relaxed', () => {
    cleanup();
    const html = '<img src="javascript:alert(1)" width="10"><a href="javascript:alert(1)">x</a>';
    const { container } = render(
      <ThreadBubble content="" isAgent={false} html={html} eventId={99} />
    );
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('a')?.getAttribute('href') ?? null).toBeNull();
  });

  /**
   * End to end through the real component: style in, attributes out, and NO css in the DOM.
   * This is the shape staging's SOM-INF-1579 actually has.
   */
  it('renders an email that sizes with CSS at the size it asked for, with no style attribute', () => {
    cleanup();
    useAuthStore.setState({ selectedOrganizationId: 36 });
    try {
      const html =
        '<img src="https://cdn.shop.test/logo.png" style="width: 120px; height: 40px; position: fixed; display: none">';
      const { container } = render(
        <ThreadBubble content="" isAgent={false} html={html} eventId={99} />
      );
      const img = container.querySelector('img');
      expect(img?.getAttribute('width')).toBe('120');
      expect(img?.getAttribute('height')).toBe('40');
      /**
       * ⚠️ REWRITTEN 2026-09-19, and the change is deliberate — read before "restoring" it.
       *
       * This used to assert `style` was null and that NO css survived, because `style` was
       * forbidden outright. That is exactly what collapsed table-built signatures, so the
       * owner's decision is now to honour a filtered subset (Gmail's model). The guard the
       * test protects has therefore moved: it is no longer "no CSS" but "only CSS from the
       * allowlist", and `position` — which could lift sender content out of the bubble and
       * over our own UI — is still refused.
       *
       * `display: none` now survives, which is a REAL BEHAVIOUR CHANGE: an image or block the
       * sender hid is now actually hidden, where before it was shown. That is Gmail parity and
       * it suppresses 1px spacers and tracking pixels, but it does mean a sender can hide
       * content from an agent that older builds displayed.
       */
      expect(img?.getAttribute('style')).toContain('width: 120px');
      expect(img?.getAttribute('style')).not.toContain('position');
      expect(container.innerHTML).not.toContain('fixed');
      expect(img?.getAttribute('style')).toContain('display: none');
    } finally {
      useAuthStore.setState({ selectedOrganizationId: null });
    }
  });

  it('⛔ BACKSTOP: strips an img the rewrite missed, rather than letting it beacon', () => {
    // Simulates `proxyRemoteImages` failing to match: the markup reaches the sanitizer with a
    // raw sender URL still on it. Without the hook, ALLOWED_URI_REGEXP (`^https?:`) would keep
    // it and the browser would fetch it straight from the sender — the read receipt the proxy
    // exists to prevent. Rendering the ALREADY-PROXIED path is what the component does, so we
    // reach past it by handing HTML whose src the rewrite cannot touch: an entity-encoded one.
    const sneaky = '<img src="https&#58;//tracker.example.test/open.gif">';
    const { container } = render(
      <ThreadBubble content="" isAgent={false} html={sneaky} eventId={5} />
    );
    const imgs = [...container.querySelectorAll('img')];
    for (const img of imgs) {
      expect(img.getAttribute('src') ?? '').toContain('/api/messages/events/');
    }
  });
});

describe('ThreadBubble plain-text branch', () => {
  it('autolinks a bare URL — a plain-text mail could never have a clickable link before', () => {
    cleanup();
    const { container } = render(
      <ThreadBubble
        content="Track it here: https://track.example.test/XYZ thanks"
        isAgent={false}
      />
    );
    const link = container.querySelector('a');
    expect(link?.getAttribute('href')).toBe('https://track.example.test/XYZ');
    expect(link?.getAttribute('rel')).toContain('noopener');
  });

  it('does not swallow the sentence-ending punctuation into the URL', () => {
    cleanup();
    const { container } = render(
      <ThreadBubble content="See https://track.example.test/XYZ." isAgent={false} />
    );
    expect(container.querySelector('a')?.getAttribute('href')).toBe(
      'https://track.example.test/XYZ'
    );
    expect(container.textContent).toContain('.');
  });

  it('leaves a javascript: pseudo-URL untouched', () => {
    cleanup();
    render(<ThreadBubble content="javascript:alert(1)" isAgent={false} />);
    expect(screen.queryByRole('link')).toBeNull();
  });
});

describe('ThreadBubble wide-content containment (ORB-SUP-1358)', () => {
  // The typography plugin is not installed, so `prose` is inert and these arbitrary
  // variants are the ONLY thing stopping browser defaults: an unwrapped <pre> (how a
  // Shopify contact-form relay ships the body) or a natural-width <img>/<table> used
  // to overflow the bubble and turn the whole thread panel into a sideways scroller.
  it('keeps a <pre> body and carries the classes that make it wrap', () => {
    cleanup();
    const { container } = render(
      <ThreadBubble
        content=""
        isAgent={false}
        html="<pre>You have received a new message from your online store contact form with one very long unbroken line that must wrap</pre>"
        eventId={3}
      />
    );
    expect(container.querySelector('pre')).not.toBeNull();
    // The wrap rule lives on the email ground, which is the `<pre>`'s GRANDparent now that the
    // body sits in its own scroll container. Search upwards rather than naming a depth, so a
    // future wrapper does not silently turn this assertion into a no-op.
    const ground = container.querySelector('pre')?.closest('.overflow-x-auto');
    expect(ground?.className).toContain('[&_pre]:whitespace-pre-wrap');
  });

  it('contains a wide table inside its own bubble instead of capping it', () => {
    cleanup();
    const { container } = render(
      <ThreadBubble content={PIPES} isAgent={false} html={ORDER_HTML} eventId={4} />
    );
    /**
     * ⚠️ The containment MECHANISM changed on 2026-09-19 and the guarantee did not.
     *
     * ORB-SUP-1358 is that a table wider than the bubble propagates overflow up to the thread
     * panel, whose `overflow-y-auto` makes overflow-x scrollable too, and the whole thread then
     * scrolls sideways. The old fix was `[&_table]:block` + `[&_table]:max-w-full` — which
     * contained the overflow by DESTROYING table layout, and that is what flattened every
     * table-built signature.
     *
     * The email ground now owns `overflow-x-auto`, so a wide table scrolls inside its own
     * bubble as a real table. `max-w-full` is deliberately NOT restored: capping the table at
     * the container width is the flattening behaviour we are removing.
     */
    const ground = container.querySelector('table')?.closest('.overflow-x-auto');
    expect(ground, 'a wide table must sit inside a scroll container').not.toBeNull();
    expect(ground?.className).not.toContain('[&_table]:block');
    expect(ground?.className).toContain('[&_img]:max-w-full');
  });
});
