/**
 * Split text into the parts that match the typed search terms and the parts that do not, for the
 * `Highlight` component. Plain text in, plain text out — the caller renders each part as a React
 * text node, so nothing here is ever HTML.
 *
 * Marks what the backend matched (threadSearch.ts):
 * - a short WORD (1–2 letters: `y`, `hi`) only as a whole word, in every field — the backend
 *   matches it that way since 2026-10-22 (it used to light up every y in Friday and July);
 * - `anywhere` (sender, subject, addresses): other terms anywhere (`ILIKE %term%`), so a thread
 *   from "Bayou…" found by `you` shows its mark;
 * - `wordStart` (message text): a term of letters only where a WORD STARTS (`invo` → "Invoice",
 *   not "layout" for `you`) — the backend's word lists; a term with a digit or a symbol anywhere.
 * Case-insensitive, every term, longest first so the whole typed text (see highlightTermsFor)
 * wins over its single words where it appears.
 *
 * ⛔ No lookbehind: Safari/iOS before 16.4 throws on `(?<!…)` when the RegExp is built, and that
 * took the whole thread list down with it. A word start is a captured separator; a word end is a
 * lookahead, which every browser supports.
 */
/** `start`: the part's offset in the text — a stable React key. */
export type HighlightPart = { text: string; match: boolean; start: number };
export type HighlightMode = 'wordStart' | 'anywhere';

const LETTERS_ONLY = /^[\p{L}\p{M}\s]+$/u;
/** The backend's MIN_INDEXED_TERM_LENGTH: shorter words are matched as whole words only. */
const MIN_WORD_TERM_LENGTH = 3;
const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const termSource = (term: string): string => escapeRegExp(term).replace(/\s+/g, '\\s+');
const isShortWord = (term: string): boolean =>
  term.length < MIN_WORD_TERM_LENGTH && /^[\p{L}\p{M}]+$/u.test(term);

/** Built once per (mode, terms) — a list renders several fields per row with the same terms. */
const patterns = new Map<string, RegExp | null>();
const PATTERN_CACHE_MAX = 50;

/**
 * Groups: 1 separator + 2 word-start term; 3 separator + 4 short whole word; 5 term anywhere.
 * null when there is nothing to mark, or the pattern cannot be built.
 */
const patternFor = (mode: HighlightMode, usable: string[]): RegExp | null => {
  const key = `${mode}\u0000${usable.join('\u0001')}`;
  const cached = patterns.get(key);
  if (cached !== undefined) return cached;
  const shortWords = usable.filter(isShortWord);
  const atWordStart =
    mode === 'wordStart'
      ? usable.filter(
          (term) =>
            !isShortWord(term) && term.length >= MIN_WORD_TERM_LENGTH && LETTERS_ONLY.test(term)
        )
      : [];
  const anywhere = usable.filter(
    (term) => !shortWords.includes(term) && !atWordStart.includes(term)
  );
  const NOT_LETTER = '[^\\p{L}\\p{M}]';
  const alternatives = [
    atWordStart.length > 0
      ? `(^|${NOT_LETTER})(${atWordStart.map(termSource).join('|')})`
      : '(?!)()()',
    shortWords.length > 0
      ? `(^|${NOT_LETTER})(${shortWords.map(termSource).join('|')})(?![\\p{L}\\p{M}])`
      : '(?!)()()',
    anywhere.length > 0 ? `(${anywhere.map(termSource).join('|')})` : '(?!)()',
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
    const word = hit[2] ?? hit[4] ?? hit[5] ?? '';
    if (word.length === 0) continue;
    const separator = hit[2] !== undefined ? hit[1] : hit[4] !== undefined ? hit[3] : '';
    const start = (hit.index ?? 0) + (separator ?? '').length;
    if (start > last) parts.push({ text: text.slice(last, start), match: false, start: last });
    parts.push({ text: word, match: true, start });
    last = start + word.length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), match: false, start: last });
  return parts;
};

/**
 * The terms to mark for a search reading: its words, plus — for several words read one by one —
 * the whole typed text, so where it appears exactly it is marked as one passage (the backend
 * lists those threads first). null/absent reading → nothing to mark.
 */
export const highlightTermsFor = (
  reading: { terms: readonly string[]; asPhrase: boolean } | null | undefined
): string[] => {
  if (!reading) return [];
  const terms = [...reading.terms];
  return !reading.asPhrase && terms.length > 1 ? [...terms, terms.join(' ')] : terms;
};
