/**
 * D36 — derive a record format from an EXAMPLE, and preview it — CA-5 Task 6.
 *
 * ⛔ NO PATTERN EVER, ANYWHERE. The admin types an example order number and we infer a prefix, a
 * length and a charset. D36 reversed D14 and came with its own bound: an admin-authored regex
 * applied to inbound message text is an unbounded ReDoS surface, so the SHAPE of this matcher —
 * a linear scan that cannot backtrack — is the mitigation. Nothing here reaches `new RegExp`
 * with anything an admin typed.
 *
 * ⚠️ DECLARED DIVERGENCE RISK, because naming it is the point. `findInText` below is a SECOND
 * implementation of `customApiRecordMatcher.extractCandidates` on the backend, which is the
 * authoritative one. It exists only to show the admin their format working on their own sentence
 * before they save — it never decides anything. The boundary rule is ported deliberately (a match
 * must be a whole token, so `AB12` does not match inside `XAB12Y`) and the cases in the suite
 * mirror the backend's. If the backend's rule changes, this preview becomes a lie rather than a
 * bug — which is the failure mode to watch for, and why the preview says "we would suggest"
 * rather than asserting what will happen.
 */

export type RecordCharset = 'digits' | 'alnum' | 'alnum_upper';

export interface RecordFormat {
  prefix: string;
  length: number;
  charset: RecordCharset;
}

/** ⛔ The backend's allowlist, character for character. A prefix is compared, never compiled. */
const PREFIX_ALLOWED = /^[A-Za-z0-9\-_#/. ]*$/;
const MAX_PREFIX_LENGTH = 32;
const MIN_RECORD_LENGTH = 1;
const MAX_RECORD_LENGTH = 64;

const isDigit = (code: number) => code >= 48 && code <= 57;
const isUpper = (code: number) => code >= 65 && code <= 90;
const isLower = (code: number) => code >= 97 && code <= 122;

const allows: Record<RecordCharset, (code: number) => boolean> = {
  digits: isDigit,
  alnum: (code) => isDigit(code) || isUpper(code) || isLower(code),
  alnum_upper: (code) => isDigit(code) || isUpper(code),
};

/**
 * Read an example the admin typed — `137416`, `ORD-137416`, `A1B2C3` — as a format.
 *
 * ⛔ The admin must not have to know it is "6 digits with no prefix". They type the thing they
 * would read off an order, and we say back what we understood. Returns null when the example
 * cannot be expressed as prefix + fixed-length run, which is an honest "we cannot do this one"
 * rather than a format that silently matches nothing.
 */
export const deriveFormat = (example: string): RecordFormat | null => {
  const trimmed = example.trim();
  if (!trimmed) return null;

  /*
   * The body is the TRAILING run of alphanumerics; everything before it is the literal prefix.
   * That reads an order number the way a person does — `ORD-137416` is "ORD-" then the number.
   */
  let start = trimmed.length;
  while (start > 0) {
    const code = trimmed.charCodeAt(start - 1);
    if (!(isDigit(code) || isUpper(code) || isLower(code))) break;
    start -= 1;
  }

  const prefix = trimmed.slice(0, start);
  const body = trimmed.slice(start);
  if (!body) return null;
  if (prefix.length > MAX_PREFIX_LENGTH || !PREFIX_ALLOWED.test(prefix)) return null;
  if (body.length < MIN_RECORD_LENGTH || body.length > MAX_RECORD_LENGTH) return null;

  const codes = Array.from(body, (char) => char.charCodeAt(0));
  const charset: RecordCharset = codes.every(isDigit)
    ? 'digits'
    : codes.every((code) => isDigit(code) || isUpper(code))
      ? 'alnum_upper'
      : 'alnum';

  return { prefix, length: body.length, charset };
};

const CHARSET_WORDS: Record<RecordCharset, { one: string; many: string }> = {
  digits: { one: 'digit', many: 'digits' },
  alnum_upper: { one: 'letter or digit (capitals)', many: 'letters or digits (capitals)' },
  alnum: { one: 'letter or digit', many: 'letters or digits' },
};

/**
 * Say the format back in words an admin can check. ⛔ "prefix / length / charset" is OUR
 * vocabulary; "6 digits, starting with ORD-" is the same fact in theirs.
 */
export const describeFormat = (format: RecordFormat): string => {
  const words = CHARSET_WORDS[format.charset];
  const count = `${format.length} ${format.length === 1 ? words.one : words.many}`;
  return format.prefix ? `${count}, starting with “${format.prefix}”` : `${count}, with no prefix`;
};

/**
 * Rebuild an example that derives back to exactly this format — the inverse of `deriveFormat`.
 *
 * ⛔ WHY THIS IS NOT `prefix + '0'.repeat(length)` (audit pass 1). That is what it was, and it
 * loses the charset: a lookup saved as `alnum` re-opened as "000000" derives back to `digits`, so
 * an admin who opened a lookup and pressed Save without touching this field SILENTLY NARROWED its
 * format — and had no way to know, because the screen showed them a number and a number is what
 * they saved. The leading character carries the charset, and the round trip is asserted.
 */
export const exampleFor = (format: RecordFormat): string => {
  const lead = format.charset === 'digits' ? '0' : format.charset === 'alnum_upper' ? 'A' : 'a';
  return `${format.prefix}${lead}${'0'.repeat(Math.max(0, format.length - 1))}`;
};

/** Ported from the backend: a match must be a whole token, not a slice of a longer run. */
const isBoundary = (text: string, index: number, format: RecordFormat): boolean => {
  if (index < 0 || index >= text.length) return true;
  const code = text.charCodeAt(index);
  return !(allows[format.charset](code) || isDigit(code) || isUpper(code) || isLower(code));
};

/** The ceiling the backend scans to. Mirrored so the preview cannot imply an unbounded scan. */
export const MAX_SCAN_CHARS = 20_000;
const CANDIDATE_CAP = 5;

/**
 * What we WOULD suggest from this text. A linear scan — every position examined a bounded number
 * of times, no backtracking, nothing compiled.
 */
export const findInText = (text: string, format: RecordFormat): string[] => {
  if (!text) return [];
  const scanned = text.slice(0, MAX_SCAN_CHARS);
  const isAllowed = allows[format.charset];
  const total = format.prefix.length + format.length;
  const found: string[] = [];

  for (let index = 0; index + total <= scanned.length; index += 1) {
    if (format.prefix && !scanned.startsWith(format.prefix, index)) continue;
    if (!isBoundary(scanned, index - 1, format)) continue;

    let ok = true;
    for (let offset = 0; offset < format.length; offset += 1) {
      if (!isAllowed(scanned.charCodeAt(index + format.prefix.length + offset))) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    if (!isBoundary(scanned, index + total, format)) continue;

    const candidate = scanned.slice(index, index + total);
    if (!found.includes(candidate)) found.push(candidate);
    if (found.length >= CANDIDATE_CAP) break;
    index += total - 1;
  }

  return found;
};
