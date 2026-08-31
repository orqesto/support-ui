/**
 * How long is too long for a knowledge-base document to sit unchanged.
 *
 * Shared by the notification (push: the KB tells you) and the documentation list (pull: you
 * go and look). One implementation on purpose — two surfaces answering the same question
 * with independently-written date arithmetic is how they end up disagreeing about the same
 * document, and the reader has no way to tell which one is wrong.
 *
 * ⚠️ MIRRORS THE BACKEND DEFAULT, and can disagree with it. The scan that raises the
 * notification reads `KB_STALE_AFTER_DAYS` (default 183); this constant cannot see that env
 * var. If the backend threshold is ever tuned, a document can carry the badge without a
 * notification or vice versa. Acceptable while the default stands; if the override is ever
 * used in earnest, the threshold belongs in the documents API response instead of here.
 */
export const KB_STALE_AFTER_DAYS = 183;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Whole days since `isoDate`, or null when the value is missing or unparseable. */
export const daysSince = (isoDate: string | null | undefined): number | null => {
  if (!isoDate) return null;
  const then = new Date(isoDate).getTime();
  if (Number.isNaN(then)) return null;
  return Math.floor((Date.now() - then) / MS_PER_DAY);
};

export const isStale = (isoDate: string | null | undefined): boolean => {
  const days = daysSince(isoDate);
  return days !== null && days >= KB_STALE_AFTER_DAYS;
};

/**
 * "8 months" beats "247 days" for a threshold measured in months — the reader is deciding
 * whether a document is old enough to look at, not counting days.
 */
export const formatStaleAge = (days: number): string => {
  const months = Math.floor(days / 30);
  if (months >= 12) {
    const years = Math.floor(months / 12);
    return years === 1 ? 'over a year' : `over ${years} years`;
  }
  if (months >= 1) return `${months} month${months === 1 ? '' : 's'}`;
  return `${days} day${days === 1 ? '' : 's'}`;
};
