/**
 * Avatar initials, one rule for every avatar (thread header, messages, list rows, board cards,
 * contact profile). Three copies used to disagree: the same sender could show `AN` on the board
 * and `A` in the thread, and a bare `<address>` showed `<J` (owner decision 2026-11-08).
 */

/** `name` without its `<…>` parts (the address of `Name <addr>`), an unclosed `<` dropping the rest. */
const withoutAngleParts = (name: string): string => {
  let text = name;
  for (let start = text.indexOf('<'); start >= 0; start = text.indexOf('<')) {
    const end = text.indexOf('>', start);
    text = `${text.slice(0, start)} ${end < 0 ? '' : text.slice(end + 1)}`;
  }
  return text;
};

const wordsOf = (text: string): string[] =>
  text
    .split(/[\s@.]+/)
    // Punctuation is not an initial: a display name arrives quoted (`"Joel @ ngrok" <…>`), and
    // the avatar read `"N`.
    .map((part) => part.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter(Boolean);

/**
 * Up to two letters: the first letters of the first two words of the name (an address splits at
 * `@` and `.`), or one letter for a single word, or `?` when there is nothing to read. The
 * address in `Name <addr>` is ignored; a name that is only `<addr>` reads the address.
 */
export function getInitials(name: string | null | undefined): string {
  // A record without the name (a list row's, an older backend's) must not take the page down.
  const raw = name ?? '';
  let parts = wordsOf(withoutAngleParts(raw));
  if (parts.length === 0) parts = wordsOf(raw);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (parts[0]?.[0] ?? '?').toUpperCase();
}
