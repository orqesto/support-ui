/**
 * One document from its stored chunks, without the text the chunker repeats at each seam.
 *
 * The backend chunker (BE-service `documentationChunkingService.ts`, `chunkTextWithConfig`) cuts
 * the extracted text into windows of `chunkSize` characters that start `chunkSize - overlap`
 * apart, trims each window, and drops a window shorter than `minChunkSize`. So chunk N+1 starts
 * with the last `overlap` characters of chunk N's window. Glued with "\n\n" (the old viewer)
 * every seam showed that text twice.
 *
 * The table below mirrors the backend's configs (type default, or the manual strategy when one is
 * set). Only `chunkSize` and `overlap` matter here.
 */

type SeamRule = { chunkSize: number; overlap: number };

const BY_TYPE: Record<string, SeamRule> = {
  technical: { chunkSize: 1000, overlap: 200 },
  nda: { chunkSize: 8000, overlap: 0 },
  legal: { chunkSize: 5000, overlap: 500 },
  policy: { chunkSize: 2000, overlap: 300 },
  template: { chunkSize: 50000, overlap: 0 },
  general: { chunkSize: 1500, overlap: 250 },
};

const BY_STRATEGY: Record<string, SeamRule> = {
  small: { chunkSize: 800, overlap: 150 },
  medium: { chunkSize: 2000, overlap: 300 },
  large: { chunkSize: 5000, overlap: 500 },
  whole: { chunkSize: 100000, overlap: 0 },
};

/** A type or strategy this file does not know (a newer backend): look for up to the largest overlap. */
const UNKNOWN_RULE: SeamRule = { chunkSize: 0, overlap: 500 };

export const seamRuleFor = (
  documentType: string | null | undefined,
  chunkingStrategy: string | null | undefined
): SeamRule => {
  const strategy = chunkingStrategy ?? 'auto';
  if (strategy !== 'auto') return BY_STRATEGY[strategy] ?? UNKNOWN_RULE;
  return BY_TYPE[documentType ?? 'general'] ?? UNKNOWN_RULE;
};

/**
 * Below this many characters a suffix/prefix match is not trusted as the overlap: two chunks
 * of a document with no overlap can still happen to end and start with the same short word.
 */
const MIN_MATCH = 8;

/**
 * The repeated text at a seam. Window N ends with the region R that window N+1 starts with;
 * trimming takes R's trailing whitespace off chunk N and its leading whitespace off chunk N+1,
 * so `R.trim()` is a suffix of one and a prefix of the other. The longest such match no longer
 * than `overlap` is taken (a longer false match needs text that repeats itself across the seam).
 */
const seamLength = (joined: string, next: string, overlap: number): number => {
  for (let length = Math.min(overlap, joined.length, next.length); length >= MIN_MATCH; length--) {
    if (joined.endsWith(next.slice(0, length))) return length;
  }
  return 0;
};

/**
 * Joins chunks (already in `chunkIndex` order) into the document text.
 *
 * - Overlapping rule: the repeated text is dropped; the rest follows exactly as extracted.
 * - No overlap: windows touch. When both sides are full windows nothing was trimmed, so the seam
 *   is mid-text and the chunks join with nothing between them. Otherwise whitespace may have been
 *   trimmed there and a line break keeps the two words apart.
 * - No match found (a chunk dropped for being short, an older chunker): a line break, as before.
 */
export const joinChunks = (chunks: string[], rule: SeamRule): string => {
  if (chunks.length === 0) return '';
  let joined = chunks[0];
  for (let index = 1; index < chunks.length; index++) {
    const previous = chunks[index - 1];
    const next = chunks[index];
    const isLast = index === chunks.length - 1;
    if (rule.overlap > 0) {
      const seam = seamLength(joined, next, rule.overlap);
      joined += seam > 0 ? next.slice(seam) : `\n${next}`;
    } else if (
      rule.chunkSize > 0 &&
      previous.length === rule.chunkSize &&
      !isLast &&
      next.length === rule.chunkSize
    ) {
      joined += next;
    } else {
      joined += `\n${next}`;
    }
  }
  return joined;
};
