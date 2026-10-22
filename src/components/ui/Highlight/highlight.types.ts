import type { HighlightMode } from '@/lib/highlightTerms';

export type HighlightProps = {
  /** Plain text to show. */
  text: string;
  /** The search terms to mark (the backend's reading of the search). None = plain text. */
  terms?: readonly string[];
  /**
   * Where a term counts as found: `anywhere` for fields the backend matches anywhere (sender,
   * subject); `wordStart` (default) for message text. See lib/highlightTerms.
   */
  mode?: HighlightMode;
  className?: string;
  markClassName?: string;
};
