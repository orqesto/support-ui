/** Small display helpers shared by the KB automatic-actions page. */

/** A 0–1 score as a whole percent; an unscored entry reads as a dash, never "0%". */
export const formatPercent = (value: number | null): string =>
  value === null ? '–' : `${Math.round(value * 100)}%`;

/** First `max` characters of a text, on one idea: long entries are previews, not the whole text. */
export const preview = (text: string, max: number): string => {
  const trimmed = text.trim();
  if (!trimmed) return '(empty)';
  return trimmed.length > max ? `${trimmed.slice(0, max).trimEnd()}…` : trimmed;
};

/** A timestamp as local date and time; a missing or unreadable one as a dash. */
export const formatWhen = (iso: string | null): string => {
  if (!iso) return '–';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '–' : date.toLocaleString();
};
