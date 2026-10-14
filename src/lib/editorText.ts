/**
 * Editor HTML as the plain text a model gets — the translator, or AI draft's note: blocks split by
 * blank lines, a link's URL kept beside its words (`here (https://…)`) so it survives, list items
 * as `- ` / `1. ` lines. HTML with no block element at all (a bare template body) is read whole.
 * Parsed with DOMParser: an inert document, nothing in it loads or runs.
 */
export const editorHtmlToText = (html: string): string => {
  const root = new DOMParser().parseFromString(html, 'text/html').body;
  root.querySelectorAll('a[href]').forEach((anchor) => {
    const href = anchor.getAttribute('href') ?? '';
    if (href && anchor.textContent?.trim() !== href) anchor.append(` (${href})`);
  });
  root.querySelectorAll('br').forEach((br) => br.replaceWith('\n'));
  root.querySelectorAll('li > p:first-child').forEach((paragraph) => {
    const item = paragraph.parentElement!;
    const ordered = item.parentElement?.tagName === 'OL';
    const position = Array.from(item.parentElement?.children ?? []).indexOf(item) + 1;
    paragraph.prepend(ordered ? `${position}. ` : '- ');
  });
  const blocks = Array.from(root.querySelectorAll('p, h1, h2, h3, pre'));
  if (blocks.length === 0) return root.textContent?.trim() ?? '';
  return blocks
    .map((block) => block.textContent?.trim() ?? '')
    .filter(Boolean)
    .join('\n\n');
};
