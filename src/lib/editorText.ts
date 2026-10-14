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
 *
 * `lists` given (Translate): every `<ol>` item's number AND the paragraph it is in are recorded
 * there, in text order, with the text's paragraph count — so the way back knows which `n. `
 * paragraphs WERE list items — see translatedTextToHtml.
 */
export type SourceLists = {
  /** How many paragraphs (blank-line separated blocks) the outgoing text has. */
  blocks: number;
  /** Every `<ol>` item, in text order: its number and the index of its paragraph. */
  items: { number: number; block: number }[];
};

/** Blank lines split paragraphs — the ONE split both directions count paragraphs with. */
const paragraphsOf = (text: string): string[] =>
  text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

export const editorHtmlToText = (
  html: string,
  options: { linkTargets?: string[]; lists?: SourceLists } = {}
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
  // Each <ol> item's text starts with a private-use character found nowhere in the source, so
  // the finished text tells which paragraph every item landed in; it is removed before return.
  let tag = 0xe001;
  while (tag < 0xf8ff && (root.textContent ?? '').includes(String.fromCharCode(tag))) tag++;
  const itemTag = String.fromCharCode(tag);
  const itemNumbers = new Map<Element, number>();
  root.querySelectorAll('ul, ol').forEach((list) => {
    const start = list.tagName === 'OL' ? Number(list.getAttribute('start')) || 1 : 1;
    Array.from(list.children)
      .filter((child) => child.tagName === 'LI')
      .forEach((item, index) => {
        if (list.tagName === 'OL') itemNumbers.set(item, start + index);
        const marker = list.tagName === 'OL' ? `${itemTag}${start + index}. ` : '- ';
        const first = item.firstElementChild;
        (first?.tagName === 'P' ? first : item).prepend(marker);
      });
  });
  // Document order of the items is their order in the text (a nested list's items sit between
  // its parent item and the next one) — not the order the lists were visited above.
  const numbers: number[] = [];
  root.querySelectorAll('li').forEach((item) => {
    const number = itemNumbers.get(item);
    if (number !== undefined) numbers.push(number);
  });
  root.querySelectorAll(BLOCKS).forEach((block) => block.after('\n\n'));
  const tagged = (root.textContent ?? '')
    .split('\n')
    .map((line) => line.replace(/[ \t\u00a0]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (options.lists) {
    const paragraphs = paragraphsOf(tagged);
    options.lists.blocks = paragraphs.length;
    paragraphs.forEach((paragraph, block) => {
      for (const char of paragraph) {
        if (char === itemTag && numbers.length)
          options.lists?.items.push({ number: numbers.shift() ?? 0, block });
      }
    });
  }
  return tagged.split(itemTag).join('');
};

const escapeHtml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const BULLET = /^- (.*)$/s;
const NUMBERED = /^(\d+)\. (.*)$/s;

/**
 * Which `n. ` paragraphs of a translation are the source's `<ol>` items (see
 * translatedTextToHtml), by paragraph index.
 */
const claimListItems = (paragraphs: string[], lists: SourceLists): Map<number, RegExpExecArray> => {
  const claimed = new Map<number, RegExpExecArray>();
  if (paragraphs.length === lists.blocks) {
    for (const { block } of lists.items) {
      const item = NUMBERED.exec(paragraphs[block] ?? '');
      if (item) claimed.set(block, item);
    }
    return claimed;
  }
  // The count changed: a longest common subsequence of numbers, O(numbered × items).
  const numbered = paragraphs.flatMap((paragraph, at) => {
    const item = NUMBERED.exec(paragraph);
    return item ? [{ at, item, number: Number(item[1]) }] : [];
  });
  const source = lists.items;
  const width = source.length + 1;
  const matches = new Int32Array((numbered.length + 1) * width);
  const distance = new Float64Array((numbered.length + 1) * width);
  const position = (at: number, count: number) => (count > 1 ? at / (count - 1) : 0);
  const gap = (row: number, col: number) =>
    Math.abs(
      position(numbered[row].at, paragraphs.length) - position(source[col].block, lists.blocks)
    );
  const pairs = (row: number, col: number) => numbered[row].number === source[col].number;
  // Better: more matches; on a tie, the smaller total distance.
  const better = (m1: number, d1: number, m2: number, d2: number) =>
    m1 > m2 || (m1 === m2 && d1 < d2);
  for (let row = 1; row <= numbered.length; row++) {
    for (let col = 1; col <= source.length; col++) {
      const cell = row * width + col;
      let best = matches[cell - width];
      let cost = distance[cell - width];
      if (better(matches[cell - 1], distance[cell - 1], best, cost)) {
        best = matches[cell - 1];
        cost = distance[cell - 1];
      }
      if (pairs(row - 1, col - 1)) {
        const paired = matches[cell - width - 1] + 1;
        const pairedCost = distance[cell - width - 1] + gap(row - 1, col - 1);
        if (better(paired, pairedCost, best, cost)) {
          best = paired;
          cost = pairedCost;
        }
      }
      matches[cell] = best;
      distance[cell] = cost;
    }
  }
  for (let row = numbered.length, col = source.length; row > 0 && col > 0; ) {
    const cell = row * width + col;
    if (
      pairs(row - 1, col - 1) &&
      matches[cell] === matches[cell - width - 1] + 1 &&
      distance[cell] === distance[cell - width - 1] + gap(row - 1, col - 1)
    ) {
      claimed.set(numbered[row - 1].at, numbered[row - 1].item);
      row--;
      col--;
    } else if (matches[cell] === matches[cell - width] && distance[cell] === distance[cell - width])
      row--;
    else col--;
  }
  return claimed;
};

/**
 * A translation (plain text) back into editor HTML — the reverse of editorHtmlToText with
 * `linkTargets` and `lists`: blank lines split paragraphs, single newlines become breaks,
 * runs of `- ` paragraphs become a bulleted list, `[[aN]]…[[/aN]]` becomes a link around the
 * translated words, a bare http(s) URL becomes a link, everything else is TEXT.
 *
 * A `n. ` paragraph is a numbered-list item ONLY when the source had an `<ol>` item there
 * (`lists`) — the structure is carried, not guessed from the text. Review of #594 guessed ("two
 * consecutive items", so a German "15. Oktober …" is not a list) and lost every one-item list;
 * matching by number alone let a date ("3. Oktober …") ahead of the list claim item 3 and turn
 * items 1–3 into text (review of #597). Translators keep the paragraph count, so:
 * - same count: paragraph i is an item when the source's paragraph i was one — a date in a
 *   paragraph that was prose never is, and reordered items stay items;
 * - count changed (paragraphs merged, split or dropped): the largest set of `n. ` paragraphs
 *   whose numbers match the source items IN ORDER, ties going to the paragraph at the nearer
 *   relative position. A date can still win there only when it ties with the real item.
 * Consecutive numbers form one `<ol>`, which keeps its first number; a nested list comes back
 * flat (plain text has no nesting).
 *
 * A link whose markers the translator dropped or broke keeps its URL: a lone closing marker
 * becomes ` (URL)`, a lone opening marker is removed, and a link with no marker left at all is
 * added as its own paragraph — a reply may lose a link's wording, never the link.
 *
 * ⛔ Not the markdown converter the AI answers use — it read the `_` in `{first_name|…}` …
 * `{{ticket_id}}` as italics and ate both underscores.
 */
export const translatedTextToHtml = (
  text: string,
  linkTargets: string[] = [],
  lists: SourceLists = { blocks: 0, items: [] }
): string => {
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

  const paragraphs = paragraphsOf(text);
  const listItems = claimListItems(paragraphs, lists);

  const out: string[] = [];
  for (let at = 0; at < paragraphs.length; ) {
    const numbered = listItems.get(at);
    if (numbered) {
      const listed = [`<li><p>${inline(numbered[2])}</p></li>`];
      for (let previous = Number(numbered[1]); ++at < paragraphs.length; previous++) {
        const item = listItems.get(at);
        if (!item || Number(item[1]) !== previous + 1) break;
        listed.push(`<li><p>${inline(item[2])}</p></li>`);
      }
      const first = Number(numbered[1]);
      const start = first !== 1 ? ` start="${first}"` : '';
      out.push(`<ol${start}>${listed.join('')}</ol>`);
    } else if (BULLET.test(paragraphs[at])) {
      const items: string[] = [];
      for (; at < paragraphs.length; at++) {
        const item = BULLET.exec(paragraphs[at]);
        if (!item) break;
        items.push(`<li><p>${inline(item[1])}</p></li>`);
      }
      out.push(`<ul>${items.join('')}</ul>`);
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
