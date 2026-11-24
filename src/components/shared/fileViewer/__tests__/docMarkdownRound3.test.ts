/**
 * Review findings on the documentation renderer (release 1.1.330, round 3). Invented data.
 *
 * - F1: the heading rule backtracked cubically on a long run of spaces; a `.md` mail attachment
 *   froze the tab. Every rule in the renderer and in liftLinks is timed on adversarial lines.
 * - F4: inline code inside a bare URL was spliced into the link's href.
 * - F5: a long table (no blank line) was never split, so it rendered at once.
 * - F6: the splitter and the renderer disagreed on where a code fence ends.
 * - F7: nested (indented) lists flattened and `ol start` was lost.
 */
import { describe, it, expect } from 'vitest';
import { documentMarkdownToHtml, renderDocumentHtml, splitIntoSections } from '../docMarkdown';

const dom = (raw: string): HTMLElement => {
  const host = document.createElement('div');
  host.innerHTML = renderDocumentHtml(raw);
  return host;
};

const timed = (run: () => unknown): number => {
  const started = performance.now();
  run();
  return performance.now() - started;
};

const SPACES = ' '.repeat(50_000);

describe('docMarkdown — linear time on adversarial lines (F1 + audit)', () => {
  it('⛔ a heading with 50k spaces inside renders in under 50 ms', () => {
    const raw = `# a${SPACES}b`;
    expect(timed(() => documentMarkdownToHtml(raw))).toBeLessThan(50);
    expect(dom(raw).querySelector('h1')?.textContent?.replace(/\s+/g, ' ')).toBe('a b');
  });

  it('CONTROL: closing #s are still dropped, a # inside a word is kept', () => {
    const host = dom('## Shipping zones ##\n### C# notes');
    expect(host.querySelector('h2')?.textContent).toBe('Shipping zones');
    expect(host.querySelector('h3')?.textContent).toBe('C# notes');
  });

  const adversarial: Array<[string, string]> = [
    ['heading with many closing-ish #s', `# a${' #'.repeat(25_000)} b`],
    ['heading ending in spaces then a mark', `# a${SPACES}#${SPACES}x`],
    ['bullet with a line separator after spaces', `- ${SPACES}\u2028x`],
    ['numbered with a line separator after spaces', `1. ${SPACES}\u2028x`],
    ['quote with a line separator after spaces', `> ${SPACES}\u2028x`],
    ['many open brackets (markdown link label)', '['.repeat(50_000)],
    ['open brackets then a half link', '[a'.repeat(25_000) + '](https://x.example/'],
    ['table separator that fails at the end', `|${'--|'.repeat(20_000)}x\n| a |`],
    ['bold with no close', `**${'a '.repeat(25_000)}`],
    ['many bold openers on one line', '**a '.repeat(15_000)],
    ['underscore emphasis openers', ' _a'.repeat(20_000)],
    ['star emphasis openers', ' *a'.repeat(20_000)],
    ['backticks with no close', '`a'.repeat(25_000)],
    ['URL full of parens', `https://x.example/${'('.repeat(25_000)}`],
    ['table row of pipes', `| a |\n|---|\n${'|'.repeat(50_000)}`],
  ];
  it.each(adversarial)('⛔ %s renders in under 150 ms', (_name, raw) => {
    expect(timed(() => documentMarkdownToHtml(raw))).toBeLessThan(150);
  });
});

describe('docMarkdown — inline code inside a bare URL (F4)', () => {
  const payload = 'see https://x.example/`a" onclick="alert(1)` end';

  it('⛔ the code never reaches the href, before or after sanitizing', () => {
    const raw = documentMarkdownToHtml(payload);
    expect(raw).not.toMatch(/href="[^"]*(<code>|)/);
    expect(raw).not.toMatch(/onclick="/);
    const host = dom(payload);
    const link = host.querySelector('a');
    expect(link?.getAttribute('href')).toBe('https://x.example/');
    expect(link?.getAttribute('onclick')).toBeNull();
    expect(host.querySelector('code')?.textContent).toBe('a" onclick="alert(1)');
  });

  it('CONTROL: a URL next to code still links, the code stays code', () => {
    const host = dom('Open https://x.example/guide and run `make docs`.');
    expect(host.querySelector('a')?.getAttribute('href')).toBe('https://x.example/guide');
    expect(host.querySelector('code')?.textContent).toBe('make docs');
  });
});

describe('docMarkdown — long tables and blank-line-free text are split (F5)', () => {
  const header = '| SKU | Product | Price |\n| --- | --- | --- |';
  const table = `${header}\n${Array.from({ length: 20_000 }, (_, row) => `| SKU-${row} | Invented item ${row} | ${row}.99 |`).join('\n')}`;

  it('⛔ a 377 KB-sized table is cut by rows, each part keeps the header and renders fast', () => {
    expect(table.length).toBeGreaterThan(370_000);
    const parts = splitIntoSections(table, 50_000);
    expect(parts.length).toBeGreaterThan(3);
    for (const part of parts) {
      expect(part.length).toBeLessThan(2 * 50_000 + 200);
      expect(part.startsWith(header)).toBe(true);
    }
    let rows = 0;
    let firstMs = 0;
    parts.forEach((part, index) => {
      const ms = timed(() => {
        rows += dom(part).querySelectorAll('tbody tr').length;
      });
      if (index === 0) firstMs = ms;
    });
    expect(rows).toBe(20_000);
    expect(firstMs).toBeLessThan(2000);
  });

  it('⛔ text with no blank line is cut at a line break', () => {
    const text = Array.from({ length: 8_000 }, (_, line) => `Invented line ${line} of a long note.`).join('\n');
    const parts = splitIntoSections(text, 50_000);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.join('\n')).toBe(text);
  });

  it('CONTROL: a short table is one part', () => {
    expect(splitIntoSections(`${header}\n| A | B | 1 |`, 50_000)).toHaveLength(1);
  });
});

describe('docMarkdown — the splitter ends a code fence where the renderer does (F6)', () => {
  it('⛔ a ~~~ line and a blank line inside a ``` block do not cut the block', () => {
    const raw = [
      'x'.repeat(50_000),
      '```',
      'code a',
      '~~~',
      '',
      'code b',
      '```',
      '',
      'after the code',
    ].join('\n');
    const parts = splitIntoSections(raw, 50_000);
    const host = document.createElement('div');
    host.innerHTML = parts.map(renderDocumentHtml).join('');
    const code = host.querySelector('pre code')?.textContent ?? '';
    expect(code).toContain('code a');
    expect(code).toContain('code b');
    expect([...host.querySelectorAll('p')].some((para) => para.textContent === 'after the code')).toBe(true);
  });
});

describe('docMarkdown — nested lists and ordered-list start (F7)', () => {
  it('⛔ indented items nest under the item above, an ordered list may nest in a bullet', () => {
    const host = dom('- item\n  - nested\n    1. deep\n- next');
    const top = host.querySelector(':scope > ul');
    expect(top?.children).toHaveLength(2);
    const nested = top?.querySelector(':scope > li > ul');
    expect(nested?.querySelector(':scope > li')?.firstChild?.textContent).toBe('nested');
    expect(nested?.querySelector(':scope > li > ol > li')?.textContent).toBe('deep');
    expect(top?.children[1].textContent).toBe('next');
  });

  it('⛔ an ordered list keeps its first number', () => {
    const host = dom('3. three\n4. four');
    expect(host.querySelector('ol')?.getAttribute('start')).toBe('3');
  });

  it('⛔ a heading inside a list item is a heading; task items show their box', () => {
    const host = dom('- ## Returns\n- [x] label printed\n- [ ] parcel sent');
    expect(host.querySelector('li > h2')?.textContent).toBe('Returns');
    const items = [...host.querySelectorAll('li')].map((li) => li.textContent);
    expect(items).toEqual(['Returns', '☑ label printed', '☐ parcel sent']);
  });

  it('CONTROL: a flat list from 1 has no start, a bullet then a numbered list at one level are two lists', () => {
    const host = dom('1. a\n2. b\n\n- c\n1. d');
    expect(host.querySelector('ol')?.hasAttribute('start')).toBe(false);
    expect(host.querySelectorAll(':scope > ol, :scope > ul')).toHaveLength(3);
  });
});
