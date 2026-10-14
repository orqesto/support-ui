/**
 * Editor HTML as the plain text a model gets — the translator, or AI draft's note: every block
 * on its own paragraph, a link's URL kept beside its words (`here (https://…)`) so it survives,
 * list items as `- ` / `n. ` lines (an `<ol start>` keeps its numbering), whitespace and `&nbsp;`
 * collapsed. ALL text is read — a template body pasted next to a paragraph, a `<div>`, a bare
 * line — never only the `<p>`s (review of #592: a refund fact outside them never reached the note).
 * Parsed with DOMParser: an inert document, nothing in it loads or runs.
 */
const BLOCKS = 'p, div, li, h1, h2, h3, h4, h5, h6, pre, blockquote, tr, ul, ol, table';

/** The link's text already says where it goes (autolinks: `help.example` → `http://help.example`). */
const textIsTheTarget = (text: string, href: string): boolean =>
  text === href || text === href.replace(/^https?:\/\//i, '').replace(/\/$/, '');

export const editorHtmlToText = (html: string): string => {
  const root = new DOMParser().parseFromString(html, 'text/html').body;
  root.querySelectorAll('a[href]').forEach((anchor) => {
    const href = anchor.getAttribute('href')?.trim() ?? '';
    // Only web links: a mailto: or javascript: target says nothing a reader can follow.
    if (/^https?:\/\//i.test(href) && !textIsTheTarget(anchor.textContent?.trim() ?? '', href)) {
      anchor.append(` (${href})`);
    }
  });
  root.querySelectorAll('br').forEach((br) => br.replaceWith('\n'));
  root.querySelectorAll('ul, ol').forEach((list) => {
    const start = list.tagName === 'OL' ? Number(list.getAttribute('start')) || 1 : 1;
    Array.from(list.children)
      .filter((child) => child.tagName === 'LI')
      .forEach((item, index) => {
        const marker = list.tagName === 'OL' ? `${start + index}. ` : '- ';
        const first = item.firstElementChild;
        (first?.tagName === 'P' ? first : item).prepend(marker);
      });
  });
  root.querySelectorAll(BLOCKS).forEach((block) => block.after('\n\n'));
  return (root.textContent ?? '')
    .split('\n')
    .map((line) => line.replace(/[ \t\u00a0]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};
