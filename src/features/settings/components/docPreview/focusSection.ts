/**
 * Finding one stored chunk ("Section N" of a source link) inside the rendered preview.
 *
 * The preview shows the document as one page (chunks joined, Markdown rendered), so a chunk has
 * no element of its own. Its first lines are looked up in the rendered text instead, compared by
 * letters and digits only: Markdown marks, list bullets and spacing differ between the stored
 * text and the page. A line that is on the page several times (a repeated heading, a table
 * header) is taken where the chunk is: its place in the document is known from the chunks
 * before it.
 */

/** Paragraph-level elements of the rendered page (a table row is matched as a whole). */
const BLOCKS = 'p,li,h1,h2,h3,h4,h5,h6,tr,pre,blockquote';
const LIST_MARKER = /^\s*(?:[-*+•]|\d+[.)])\s+/;
/** A shorter line ("Yes.", "Notes") is in too many places to say where the chunk starts. */
const MIN_LETTERS = 8;
/** A chunk of nothing but short lines (a price list, a glossary) is placed by those instead. */
const MIN_LETTERS_SHORT = 3;
const MAX_LINES = 8;
const KEY_LETTERS = 60;

const letters = (text: string): string => text.replace(/[^\p{L}\p{N}]+/gu, '').toLowerCase();

/** A line as it is compared: its first letters and digits, list marker dropped. */
const keyOf = (line: string): string => letters(line.replace(LIST_MARKER, '')).slice(0, KEY_LETTERS);

/** The cited chunk: its first lines as stored, and how far into the document it starts (0–1). */
export type ChunkFocus = { lines: string[]; at: number };

/**
 * The chunk's first lines worth searching for, as stored. A line the previous chunk also holds
 * is the text the chunker repeats at the seam, and belongs to the section before.
 */
export const focusLines = (chunk: string | undefined, previous?: string): string[] => {
  const own = (chunk ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => !previous?.includes(line));
  const atLeast = (count: number) =>
    own.filter((line) => letters(line.replace(LIST_MARKER, '')).length >= count).slice(0, MAX_LINES);
  const long = atLeast(MIN_LETTERS);
  return long.length > 0 ? long : atLeast(MIN_LETTERS_SHORT);
};

/** The focus for the chunk at `position` of the chunks in order; null when there is none. */
export const chunkFocus = (chunks: string[], position: number): ChunkFocus | null => {
  if (position < 0 || position >= chunks.length) return null;
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const before = chunks.slice(0, position).reduce((sum, chunk) => sum + chunk.length, 0);
  return {
    lines: focusLines(chunks[position], chunks[position - 1]),
    at: total > 0 ? before / total : 0,
  };
};

const nearest = <T>(items: T[], distance: (item: T) => number): T | undefined =>
  items.reduce<T | undefined>(
    (best, item) => (best === undefined || distance(item) < distance(best) ? item : best),
    undefined
  );

type Block = { element: HTMLElement; key: string; at: number };

/** Every block of the page with its text and how far into the page it starts: one pass. */
const blocksOf = (root: HTMLElement): Block[] => {
  const found: { element: HTMLElement; start: number }[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  let length = 0;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.nodeType === Node.TEXT_NODE) length += node.nodeValue?.length ?? 0;
    else if ((node as HTMLElement).matches(BLOCKS)) found.push({ element: node as HTMLElement, start: length });
  }
  return found.map(({ element, start }) => ({
    element,
    key: letters(element.textContent ?? ''),
    at: length > 0 ? start / length : 0,
  }));
};

/**
 * The rendered block where the chunk starts: the one holding its first findable line (the
 * innermost when blocks nest, the nearest to the chunk's place when the line repeats). `exact`
 * is false when no line was found and the block is only the one at the chunk's place; `line` is
 * the chunk's line the block holds.
 */
export const findFocusBlock = (
  root: HTMLElement,
  focus: ChunkFocus
): { element: HTMLElement; exact: boolean; line?: string } | null => {
  const blocks = blocksOf(root);
  // Per line, the blocks holding it (innermost only); lines that are nowhere are dropped.
  const perLine = focus.lines
    .map((line) => {
      const key = keyOf(line);
      const holding = blocks.filter((block) => block.key.includes(key));
      const matches = holding.filter(
        (block) => !holding.some((other) => other !== block && block.element.contains(other.element))
      );
      return { line, matches };
    })
    .filter(({ matches }) => matches.length > 0);
  if (perLine.length > 0) {
    const { line, matches: first } = perLine[0];
    // A line of the chunk that is on the page once says where the chunk is for certain: the
    // chunk starts at the last block holding its first line at or before that one. With no such
    // line, the block nearest to the chunk's place in the document.
    const anchor = perLine.find(({ matches }) => matches.length === 1)?.matches[0];
    const upTo = anchor ? first.filter((block) => block.at <= anchor.at) : [];
    const best = anchor
      ? (upTo[upTo.length - 1] ?? anchor)
      : nearest(first, (block) => Math.abs(block.at - focus.at));
    if (best) return { element: best.element, exact: true, line };
  }
  const near = nearest(blocks, (block) => Math.abs(block.at - focus.at));
  return near ? { element: near.element, exact: false } : null;
};

/** A block longer than this is not marked whole: the line is marked inside it (`markLineStart`). */
export const LARGE_BLOCK_CHARS = 600;

const IS_LETTER = /[\p{L}\p{N}]/u;

/**
 * Wraps where `line` starts inside a block in a `<mark>` and returns it. Text extracted without
 * blank lines renders as one paragraph pages long: its top is nowhere near a chunk in its middle,
 * so the line itself is the place to scroll to. The mark stays inside one text node.
 */
export const markLineStart = (block: HTMLElement, line: string): HTMLElement | null => {
  const start = letters(block.textContent ?? '').indexOf(keyOf(line));
  if (start < 0) return null;
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  let seen = 0;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const value = node.nodeValue ?? '';
    const count = letters(value).length;
    if (seen + count > start) {
      // The character of this node at which the wanted letter stands.
      let toSkip = start - seen;
      let offset = 0;
      for (const char of value) {
        if (IS_LETTER.test(char)) {
          if (toSkip === 0) break;
          toSkip--;
        }
        offset += char.length;
      }
      const lineEnd = value.indexOf('\n', offset);
      const end = Math.min(offset + line.length, lineEnd > offset ? lineEnd : value.length, value.length);
      const range = document.createRange();
      range.setStart(node, offset);
      range.setEnd(node, Math.max(end, Math.min(offset + 1, value.length)));
      const mark = document.createElement('mark');
      range.surroundContents(mark);
      return mark;
    }
    seen += count;
  }
  return null;
};

/** Where the chunk starts in plain text: its first line found as written, nearest to its place. */
export const findFocusRange = (text: string, focus: ChunkFocus): { start: number; end: number } | null => {
  const wanted = focus.at * text.length;
  for (const line of focus.lines) {
    const starts: number[] = [];
    for (let start = text.indexOf(line); start >= 0; start = text.indexOf(line, start + 1)) starts.push(start);
    const start = nearest(starts, (candidate) => Math.abs(candidate - wanted));
    if (start !== undefined) return { start, end: start + line.length };
  }
  return null;
};

/**
 * How many parts of a long document must be rendered for the chunk to be on the page: up to the
 * part holding its line (the nearest to its place when several do), else the part at its place.
 * Never the whole of a long document for a line that is nowhere (a long freeze).
 */
export const sectionsToShow = (sections: string[], focus: ChunkFocus | null): number => {
  if (!focus || sections.length <= 1) return 1;
  const total = sections.reduce((sum, section) => sum + section.length, 0) || 1;
  let offset = 0;
  const parts = sections.map((section, index) => {
    const part = { index, key: letters(section), from: offset / total, to: (offset + section.length) / total };
    offset += section.length;
    return part;
  });
  // 0 inside the part, else how far outside it the chunk's place is.
  const away = (part: (typeof parts)[number]) => Math.max(part.from - focus.at, focus.at - part.to, 0);
  for (const line of focus.lines) {
    const key = keyOf(line);
    const best = nearest(parts.filter((part) => part.key.includes(key)), away);
    if (best) return best.index + 1;
  }
  return (nearest(parts, away)?.index ?? 0) + 1;
};
