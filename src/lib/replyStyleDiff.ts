/**
 * Word-level diff for the reply_style suggestion review.
 *
 * The reply_style payload is PROSE — a paragraph of house-voice guidance that an
 * LLM rewrote from the current one. Showing the two blocks side by side makes an
 * admin re-read both and guess what moved; the whole decision is "what changed",
 * so the diff is the primary view, not a nicety.
 *
 * Plain LCS over whitespace-preserving tokens: no dependency, deterministic, and
 * small enough to unit-test. Guidance is capped at 2000 chars on the backend, so
 * the O(n*m) table stays tiny; the token cap below is a belt-and-braces guard for
 * a payload that somehow arrives longer (falls back to whole-block replace).
 */

export type DiffSegment = { type: 'same' | 'added' | 'removed'; text: string };

/** Above this token count per side we stop diffing and show a block replace. */
const MAX_TOKENS = 1200;

/** Split into words AND the whitespace between them, so rejoining is lossless. */
const tokenize = (text: string): string[] => (text ? text.split(/(\s+)/).filter(Boolean) : []);

const push = (out: DiffSegment[], type: DiffSegment['type'], text: string): void => {
  const last = out[out.length - 1];
  if (last?.type === type) last.text += text;
  else out.push({ type, text });
};

export const diffWords = (before: string, after: string): DiffSegment[] => {
  const from = tokenize(before);
  const to = tokenize(after);
  if (from.length === 0 && to.length === 0) return [];
  if (from.length === 0) return [{ type: 'added', text: after }];
  if (to.length === 0) return [{ type: 'removed', text: before }];
  if (from.length > MAX_TOKENS || to.length > MAX_TOKENS) {
    return [
      { type: 'removed', text: before },
      { type: 'added', text: after },
    ];
  }

  // lcs[ax][bx] = length of the longest common subsequence of from[ax:] and to[bx:].
  const lcs: number[][] = Array.from({ length: from.length + 1 }, () =>
    new Array<number>(to.length + 1).fill(0)
  );
  for (let ax = from.length - 1; ax >= 0; ax--) {
    for (let bx = to.length - 1; bx >= 0; bx--) {
      lcs[ax][bx] =
        from[ax] === to[bx] ? lcs[ax + 1][bx + 1] + 1 : Math.max(lcs[ax + 1][bx], lcs[ax][bx + 1]);
    }
  }

  const segments: DiffSegment[] = [];
  let fromIndex = 0;
  let toIndex = 0;
  while (fromIndex < from.length && toIndex < to.length) {
    if (from[fromIndex] === to[toIndex]) {
      push(segments, 'same', from[fromIndex]);
      fromIndex++;
      toIndex++;
    } else if (lcs[fromIndex + 1][toIndex] >= lcs[fromIndex][toIndex + 1]) {
      push(segments, 'removed', from[fromIndex]);
      fromIndex++;
    } else {
      push(segments, 'added', to[toIndex]);
      toIndex++;
    }
  }
  while (fromIndex < from.length) push(segments, 'removed', from[fromIndex++]);
  while (toIndex < to.length) push(segments, 'added', to[toIndex++]);
  return segments;
};

/** True when the two texts differ by more than surrounding whitespace. */
export const hasRealChange = (before: string, after: string): boolean =>
  before.trim() !== after.trim();
