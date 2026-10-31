/**
 * Whether an AI answer's knowledge search was cut short (backend, 2026-10-31).
 *
 * The AI Draft and the KB button search the knowledge base, documentation and past replies under a
 * time limit. A search stopped at it leaves the answer written without part of what it would
 * normally read; the backend lists the stopped reads in `meta.timing.searchCutShort` (and caps the
 * confidence). Read defensively: an older backend sends no `meta`, which means nothing was cut.
 */
export const searchCutShort = (body: unknown): boolean => {
  if (typeof body !== 'object' || body === null) return false;
  const meta = (body as { meta?: unknown }).meta;
  if (typeof meta !== 'object' || meta === null) return false;
  const timing = (meta as { timing?: unknown }).timing;
  if (typeof timing !== 'object' || timing === null) return false;
  const cut = (timing as { searchCutShort?: unknown }).searchCutShort;
  return Array.isArray(cut) && cut.length > 0;
};

/** What the panels say about such an answer. */
export const SEARCH_CUT_SHORT_COPY =
  'Part of the knowledge search took too long and was skipped, so this answer may be missing information. Check it before sending.';
