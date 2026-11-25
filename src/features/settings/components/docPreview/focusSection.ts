/**
 * Finding one stored chunk ("Section N" of a source link) inside the rendered preview.
 *
 * The preview shows the document as one page (chunks joined, Markdown rendered), so a chunk has
 * no element of its own. Its first lines are looked up in the rendered text instead, compared by
 * letters and digits only: Markdown marks, list bullets and spacing differ between the stored
 * text and the page.
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

/** The first rendered block holding one of the lines; the innermost one when blocks nest. */
export const findFocusBlock = (root: HTMLElement, lines: string[]): HTMLElement | null => {
  const blocks = Array.from(root.querySelectorAll<HTMLElement>(BLOCKS)).map((element) => ({
    element,
    key: letters(element.textContent ?? ''),
  }));
  for (const line of lines) {
    const key = letters(line.replace(LIST_MARKER, '')).slice(0, KEY_LETTERS);
    const matches = blocks.filter((block) => block.key.includes(key));
    const innermost = matches.find(
      (block) => !matches.some((other) => other !== block && block.element.contains(other.element))
    );
    if (innermost) return innermost.element;
  }
  return null;
};

/** Where the chunk starts in plain text: the first of its lines found as written. */
export const findFocusRange = (text: string, lines: string[]): { start: number; end: number } | null => {
  for (const line of lines) {
    const start = text.indexOf(line);
    if (start >= 0) return { start, end: start + line.length };
  }
  return null;
};

/** How many parts of a long document must be rendered for the chunk to be on the page. */
export const sectionsToShow = (sections: string[], lines: string[]): number => {
  if (lines.length === 0 || sections.length <= 1) return 1;
  for (const line of lines) {
    const index = sections.findIndex((section) => section.includes(line));
    if (index >= 0) return index + 1;
  }
  // Not found as written (a synced page's Markdown differs from its chunks): render it all.
  return sections.length;
};
