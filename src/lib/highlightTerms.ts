/**
 * Split text into the parts that match the typed search terms and the parts that do not, for the
 * `Highlight` component. Plain text in, plain text out — the caller renders each part as a React
 * text node, so nothing here is ever HTML.
 *
 * Matches the way the backend searched (threadSearch.ts): a term of letters only is found where a
 * WORD STARTS (`invo` → "Invoice", not "layout" for `you`); a term with a digit or a symbol — a
 * code, an address — and a term shorter than MIN_WORD_TERM_LENGTH anywhere. Case-insensitive, every term, longest first so `john smith` wins
 * over `john` where both fit.
 */
/** `start`: the part's offset in the text — a stable React key. */
export type HighlightPart = { text: string; match: boolean; start: number };

const LETTERS_ONLY = /^[\p{L}\p{M}\s]+$/u;
/** The backend's MIN_INDEXED_TERM_LENGTH: shorter terms are matched anywhere, not by word start. */
const MIN_WORD_TERM_LENGTH = 3;
const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const termPattern = (term: string): string => {
  const escaped = escapeRegExp(term).replace(/\s+/g, '\\s+');
  return term.length >= MIN_WORD_TERM_LENGTH && LETTERS_ONLY.test(term)
    ? `(?<![\\p{L}\\p{M}])${escaped}`
    : escaped;
};

export const splitByTerms = (
  text: string,
  terms: readonly string[] | undefined
): HighlightPart[] => {
  const usable = [...new Set((terms ?? []).map((term) => term.trim()).filter(Boolean))].sort(
    (left, right) => right.length - left.length
  );
  if (!text || usable.length === 0) return text ? [{ text, match: false, start: 0 }] : [];
  const pattern = new RegExp(usable.map(termPattern).join('|'), 'giu');
  const parts: HighlightPart[] = [];
  let last = 0;
  for (const hit of text.matchAll(pattern)) {
    const start = hit.index ?? 0;
    if (hit[0].length === 0) continue;
    if (start > last) parts.push({ text: text.slice(last, start), match: false, start: last });
    parts.push({ text: hit[0], match: true, start });
    last = start + hit[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), match: false, start: last });
  return parts;
};
