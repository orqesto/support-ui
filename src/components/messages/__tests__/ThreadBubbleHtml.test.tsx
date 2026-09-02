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
import { proxyRemoteImages } from '@/components/messages/messageDetailConstants';
import { API_BASE_URL } from '@/lib/config';

const ORDER_HTML = `
  <table>
    <tr><td>Discount:</td><td>-£16.50</td></tr>
    <tr><td>Total:</td><td>£158.50</td></tr>
  </table>
  <a href="https://track.example.test/ABC123">Track your order</a>`;

const PIPES = '| Discount: | -£16.50 |\n| Total: | £158.50 |';

describe('proxyRemoteImages', () => {
  it('rewrites an absolute remote source to our proxy, url-encoded', () => {
    const out = proxyRemoteImages('<img src="https://cdn.shop.test/a.png">', 42, 'https://api.test');
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

  it('leaves cid:, data: and relative sources alone — the sanitizer drops them', () => {
    const html = '<img src="cid:logo@1"><img src="data:image/png;base64,AA"><img src="/rel.png">';
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
    const { container } = render(<ThreadBubble content={PIPES} isAgent={false} html={null} eventId={1} />);
    expect(container.querySelector('table')).toBeNull();
    expect(container.textContent).toContain('| Discount:');
  });

  it('falls back to text when there is no eventId — images could not be proxied safely', () => {
    const { container } = render(<ThreadBubble content={PIPES} isAgent={false} html={ORDER_HTML} />);
    expect(container.querySelector('table')).toBeNull();
  });

  it('⛔ renders a remote image ONLY through the proxy', () => {
    const html = '<img src="https://tracker.example.test/open.gif?id=abc">';
    const { container } = render(<ThreadBubble content="" isAgent={false} html={html} eventId={99} />);
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('src')).toContain(`${API_BASE_URL}/api/messages/events/99/image`);
    expect(img?.getAttribute('src')).not.toContain('tracker.example.test/open.gif?id=abc&');
  });

  it('⛔ BACKSTOP: strips an img the rewrite missed, rather than letting it beacon', () => {
    // Simulates `proxyRemoteImages` failing to match: the markup reaches the sanitizer with a
    // raw sender URL still on it. Without the hook, ALLOWED_URI_REGEXP (`^https?:`) would keep
    // it and the browser would fetch it straight from the sender — the read receipt the proxy
    // exists to prevent. Rendering the ALREADY-PROXIED path is what the component does, so we
    // reach past it by handing HTML whose src the rewrite cannot touch: an entity-encoded one.
    const sneaky = '<img src="https&#58;//tracker.example.test/open.gif">';
    const { container } = render(<ThreadBubble content="" isAgent={false} html={sneaky} eventId={5} />);
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
      <ThreadBubble content="Track it here: https://track.example.test/XYZ thanks" isAgent={false} />
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
    expect(container.querySelector('a')?.getAttribute('href')).toBe('https://track.example.test/XYZ');
    expect(container.textContent).toContain('.');
  });

  it('leaves a javascript: pseudo-URL untouched', () => {
    cleanup();
    render(<ThreadBubble content="javascript:alert(1)" isAgent={false} />);
    expect(screen.queryByRole('link')).toBeNull();
  });
});
