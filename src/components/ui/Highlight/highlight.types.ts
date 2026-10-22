export type HighlightProps = {
  /** Plain text to show. */
  text: string;
  /** The search terms to mark (the backend's reading of the search). None = plain text. */
  terms?: readonly string[];
  className?: string;
  markClassName?: string;
};
