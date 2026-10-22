/**
 * Split text into the parts that match the typed search terms and the parts that do not, for the
 * `Highlight` component. Plain text in, plain text out — the caller renders each part as a React
 * text node, so nothing here is ever HTML.
 *
 * Marks what the backend matched (threadSearch.ts):
 * - `anywhere` (sender, subject, addresses): the backend matches those fields anywhere
 *   (`ILIKE %term%`), so a thread from "Bayou…" found by `you` shows its mark;
 * - `wordStart` (message text): a term of letters only, 3+ characters, where a WORD STARTS
 *   (`invo` → "Invoice", not "layout" for `you`) — the backend's word lists; a term with a digit
 *   or a symbol, or a shorter one, anywhere.
 * Case-insensitive, every term, longest first so `john smith` wins over `john` where both fit.
 *
 * ⛔ No lookbehind: Safari/iOS before 16.4 throws on `(?<!…)` when the RegExp is built, and that
 * took the whole thread list down with it. The word start is a captured separator instead.
 */
/** `start`: the part's offset in the text — a stable React key. */
export type HighlightPart = { text: string; match: boolean; start: number };
export type HighlightMode = 'wordStart' | 'anywhere';

const LETTERS_ONLY = /^[\p{L}\p{M}\s]+$/u;
/** The backend's MIN_INDEXED_TERM_LENGTH: shorter terms are matched anywhere, not by word start. */
const MIN_WORD_TERM_LENGTH = 3;
const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const termSource = (term: string): string => escapeRegExp(term).replace(/\s+/g, '\\s+');

/** Built once per (mode, terms) — a list renders several fields per row with the same terms. */
const patterns = new Map<string, RegExp | null>();
const PATTERN_CACHE_MAX = 50;

/**
 * Group 1: the separator before a word start (or nothing at the start of the text); group 2: a
 * word-start term; group 3: a term matched anywhere. null when there is nothing to mark.
 */
const patternFor = (mode: HighlightMode, usable: string[]): RegExp | null => {
  const key = `${mode}\u0000${usable.join('\u0001')}`;
  const cached = patterns.get(key);
  if (cached !== undefined) return cached;
  const atWordStart =
    mode === 'wordStart'
      ? usable.filter((term) => term.length >= MIN_WORD_TERM_LENGTH && LETTERS_ONLY.test(term))
      : [];
  const anywhere = usable.filter((term) => !atWordStart.includes(term));
  const alternatives = [
    atWordStart.length > 0
      ? `(^|[^\\p{L}\\p{M}])(${atWordStart.map(termSource).join('|')})`
      : '(?!)()()',
    anywhere.length > 0 ? `(${anywhere.map(termSource).join('|')})` : '(?!)',
  ];
  let pattern: RegExp | null;
  try {
    pattern = new RegExp(alternatives.join('|'), 'giu');
  } catch {
    // Never take the list down for a highlight.
    pattern = null;
  }
  if (patterns.size >= PATTERN_CACHE_MAX) patterns.clear();
  patterns.set(key, pattern);
  return pattern;
};

export const splitByTerms = (
  text: string,
  terms: readonly string[] | undefined,
  mode: HighlightMode = 'wordStart'
): HighlightPart[] => {
  const usable = [...new Set((terms ?? []).map((term) => term.trim()).filter(Boolean))].sort(
    (left, right) => right.length - left.length
  );
  const plain = text ? [{ text, match: false, start: 0 }] : [];
  if (!text || usable.length === 0) return plain;
  const pattern = patternFor(mode, usable);
  if (!pattern) return plain;
  const parts: HighlightPart[] = [];
  let last = 0;
  for (const hit of text.matchAll(pattern)) {
    const word = hit[2] ?? hit[3] ?? '';
    if (word.length === 0) continue;
    const start = (hit.index ?? 0) + (hit[2] !== undefined ? (hit[1] ?? '').length : 0);
    if (start > last) parts.push({ text: text.slice(last, start), match: false, start: last });
    parts.push({ text: word, match: true, start });
    last = start + word.length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), match: false, start: last });
  return parts;
};
