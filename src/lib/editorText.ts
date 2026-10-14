import { liftLinks } from './liftLinks';

/**
 * Editor HTML as the plain text a model gets — the translator, or AI draft's note: every block
 * on its own paragraph, a link's URL kept beside its words (`here (https://…)`) so it survives,
 * list items as `- ` / `n. ` lines (an `<ol start>` keeps its numbering), whitespace and `&nbsp;`
 * collapsed. ALL text is read — a template body pasted next to a paragraph, a `<div>`, a bare
 * line — never only the `<p>`s (review of #592: a refund fact outside them never reached the note).
 * Parsed with DOMParser: an inert document, nothing in it loads or runs.
 */
const BLOCKS = 'p, div, li, h1, h2, h3, h4, h5, h6, pre, blockquote, tr, td, th, ul, ol, table';

/** The link's text already says where it goes (autolinks: `help.example` → `http://help.example`). */
const textIsTheTarget = (text: string, href: string): boolean =>
  text === href || text === href.replace(/^https?:\/\//i, '').replace(/\/$/, '');

/**
 * `linkTargets` given (Translate): a link becomes `[[a0]]its words[[/a0]]` and its URL is pushed
 * there, so the words can be translated and the link rebuilt around the result — see
 * translatedTextToHtml. Without it (the AI note): `its words (https://…)`.
 */
export const editorHtmlToText = (
  html: string,
  options: { linkTargets?: string[] } = {}
): string => {
  const root = new DOMParser().parseFromString(html, 'text/html').body;
  root.querySelectorAll('a[href]').forEach((anchor) => {
    const href = anchor.getAttribute('href')?.trim() ?? '';
    const text = anchor.textContent?.trim() ?? '';
    if (options.linkTargets) {
      // Translate. Kept: web, mailto: and tel: links (review of #593: an address lost its target).
      if (!/^(?:https?:\/\/|mailto:|tel:)/i.test(href)) return;
      if (/^https?:\/\//i.test(text)) {
        // Words that ARE a URL go out bare (the way back links them again); in markers the URL
        // inside them was linked a second time — nested anchors (review of #597).
        if (text !== href) anchor.append(` (${href})`);
        return;
      }
      const index = options.linkTargets.push(href) - 1;
      anchor.prepend(`[[a${index}]]`);
      anchor.append(`[[/a${index}]]`);
      return;
    }
    // The AI note: only web links say anything a reader can follow.
    if (/^https?:\/\//i.test(href) && !textIsTheTarget(text, href)) anchor.append(` (${href})`);
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

const escapeHtml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const BULLET = /^- (.*)$/s;
const NUMBERED = /^(\d+)\. (.*)$/s;

/**
 * A translation (plain text) back into editor HTML — the reverse of editorHtmlToText with
 * `linkTargets`: blank lines split paragraphs, single newlines become breaks, runs of `- ` /
 * `n. ` paragraphs become a real list again (an `<ol>` keeps its first number), `[[aN]]…[[/aN]]`
 * becomes a link around the translated words, a bare http(s) URL becomes a link, everything else
 * is TEXT.
 *
 * A link whose markers the translator dropped or broke keeps its URL: a lone closing marker
 * becomes ` (URL)`, a lone opening marker is removed, and a link with no marker left at all is
 * added as its own paragraph — a reply may lose a link's wording, never the link.
 *
 * ⛔ Not the markdown converter the AI answers use — it read the `_` in `{first_name|…}` …
 * `{{ticket_id}}` as italics and ate both underscores.
 */
export const translatedTextToHtml = (text: string, linkTargets: string[] = []): string => {
  const anchor = (index: number, label: string) =>
    `<a href="${escapeHtml(linkTargets[index] ?? '')}">${label}</a>`;
  const used = new Set<number>();
  const known = (index: string): boolean => linkTargets[Number(index)] !== undefined;
  const inline = (paragraph: string): string => {
    // URLs lifted first (liftLinks: never across a `[[` marker), then escaped, then the markers.
    const links = liftLinks(paragraph);
    return links.restore(
      escapeHtml(links.text)
        .replace(
          /\[\[a(\d+)\]\]([\s\S]*?)\[\[\/a\1\]\]/g,
          (_match, index: string, label: string) => {
            if (!known(index)) return label; // a marker the translator invented: keep the words
            used.add(Number(index));
            return anchor(Number(index), label);
          }
        )
        .replace(/\[\[\/a(\d+)\]\]/g, (_match, index: string) => {
          if (!known(index)) return '';
          used.add(Number(index));
          const url = linkTargets[Number(index)];
          return ` (${anchor(Number(index), escapeHtml(url))})`;
        })
        .replace(/\[\[a\d+\]\]/g, '')
        .replace(/\n/g, '<br>')
    );
  };

  const paragraphs = text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  const out: string[] = [];
  for (let at = 0; at < paragraphs.length; ) {
    const numbered = NUMBERED.exec(paragraphs[at]);
    // A lone "15. Oktober …" is a German date, not a list: a numbered list needs two
    // consecutive items (review of #594).
    const next = numbered ? NUMBERED.exec(paragraphs[at + 1] ?? '') : null;
    const isList =
      BULLET.test(paragraphs[at]) ||
      (numbered !== null && next !== null && Number(next[1]) === Number(numbered[1]) + 1);
    if (isList) {
      const tag = numbered ? 'ol' : 'ul';
      const items: string[] = [];
      for (; at < paragraphs.length; at++) {
        const item = (numbered ? NUMBERED : BULLET).exec(paragraphs[at]);
        if (!item) break;
        items.push(`<li><p>${inline(item[item.length - 1])}</p></li>`);
      }
      const start = numbered && numbered[1] !== '1' ? ` start="${numbered[1]}"` : '';
      out.push(`<${tag}${start}>${items.join('')}</${tag}>`);
    } else {
      out.push(`<p>${inline(paragraphs[at])}</p>`);
      at++;
    }
  }
  linkTargets.forEach((url, index) => {
    if (!used.has(index)) out.push(`<p>${anchor(index, escapeHtml(url))}</p>`);
  });
  return out.join('');
};
