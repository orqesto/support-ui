import { describe, it, expect } from 'vitest';
import { renderDocumentHtml } from '../docMarkdown';
import { inventedDocument } from './beChunker';

const dom = (raw: string): HTMLElement => {
  const host = document.createElement('div');
  host.innerHTML = renderDocumentHtml(raw);
  return host;
};

describe('renderDocumentHtml — formatting', () => {
  it('renders headings, lists, emphasis, code and rules', () => {
    const host = dom(
      [
        '# Shipping guide',
        '## Zones',
        'Parcels leave **daily** and arrive in *two* days.',
        '',
        '- First option',
        '- Second option',
        '',
        '1. Step one',
        '2. Step two',
        '',
        '---',
        'Use `track --id` to check.',
        '',
        '```',
        'const a = 1 < 2;',
        '```',
      ].join('\n')
    );
    expect(host.querySelector('h1')?.textContent).toBe('Shipping guide');
    expect(host.querySelector('h2')?.textContent).toBe('Zones');
    expect(host.querySelector('strong')?.textContent).toBe('daily');
    expect(host.querySelector('em')?.textContent).toBe('two');
    expect(host.querySelectorAll('ul > li')).toHaveLength(2);
    expect(host.querySelectorAll('ol > li')).toHaveLength(2);
    expect(host.querySelector('hr')).not.toBeNull();
    expect(host.querySelector('p code')?.textContent).toBe('track --id');
    expect(host.querySelector('pre code')?.textContent).toBe('const a = 1 < 2;');
    expect(host.textContent).not.toContain('**');
    expect(host.textContent).not.toContain('# ');
  });

  it('renders a pipe table (the shape the backend writes for PDF tables)', () => {
    const host = dom('| Item | Price |\n| --- | --- |\n| Box | 10 EUR |\n| Bag | 4 EUR |');
    expect([...host.querySelectorAll('th')].map((cell) => cell.textContent)).toEqual(['Item', 'Price']);
    expect(host.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(host.querySelector('tbody td')?.textContent).toBe('Box');
  });

  it('keeps single line breaks inside a paragraph (extracted text relies on them)', () => {
    const host = dom('Example Shop\nMain Street 1\nExample City');
    expect(host.querySelectorAll('p')).toHaveLength(1);
    expect(host.querySelectorAll('p br')).toHaveLength(2);
  });

  it('links open in a new tab with noopener; underscores in URLs survive', () => {
    const host = dom('See [the guide](https://docs.example.com/a_b_c) or https://shop.example/x_y_z.');
    const links = [...host.querySelectorAll('a')];
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      'https://docs.example.com/a_b_c',
      'https://shop.example/x_y_z',
    ]);
    for (const link of links) {
      expect(link.getAttribute('target')).toBe('_blank');
      expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    }
  });

  it('snake_case words are not italicised', () => {
    expect(dom('Set order_id_prefix here').querySelector('em')).toBeNull();
  });
});

describe('renderDocumentHtml — sanitizing (payloads in a document are text, never markup)', () => {
  const payload = [
    '<script>window.__pwned = 1</script>',
    '<img src=x onerror="window.__pwned = 2">',
    '[click me](javascript:alert(1))',
    'javascript:alert(2)',
    '<a href="javascript:alert(3)">raw link</a>',
    '<iframe src="https://evil.example"></iframe>',
    '| <svg onload=alert(4)> | x |',
    '| --- | --- |',
    '| <b onmouseover=alert(5)>cell</b> | y |',
  ].join('\n\n');

  it('no script, img, iframe or svg element, no event handler, no javascript: link', () => {
    const host = dom(payload);
    expect(host.querySelector('script, img, iframe, svg, b')).toBeNull();
    for (const element of host.querySelectorAll('*')) {
      for (const attr of element.getAttributeNames()) expect(attr.startsWith('on')).toBe(false);
    }
    for (const link of host.querySelectorAll('a')) {
      expect(link.getAttribute('href') ?? '').toMatch(/^https?:/);
    }
    expect((window as { __pwned?: number }).__pwned).toBeUndefined();
  });

  it('the payload is still readable as text', () => {
    const host = dom(payload);
    expect(host.textContent).toContain('<script>window.__pwned = 1</script>');
    expect(host.textContent).toContain('click me');
  });
});

describe('renderDocumentHtml — a large document', () => {
  it('renders ~1 MB in reasonable time (jsdom; a browser is faster)', () => {
    const big = inventedDocument(1_000_000);
    const started = performance.now();
    const html = renderDocumentHtml(big);
    const elapsed = performance.now() - started;
    // Measured locally (jsdom, 2026-11-24): see the PR notes. The bound only catches a
    // pathological (quadratic) regression.
    console.info(`[doc preview] ${big.length} chars rendered in ${Math.round(elapsed)} ms`);
    expect(html.length).toBeGreaterThan(big.length / 2);
    expect(elapsed).toBeLessThan(10_000);
  });
});
