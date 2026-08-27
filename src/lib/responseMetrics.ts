/**
 * What it takes to believe an average response time.
 *
 * `/api/sla/summary` returns a mean, a median and a sample size over the same window, and
 * the dashboard showed only the mean. That is the least informative of the three on its own:
 * a mean of 5h over six threads and over six hundred are different claims, and the backend
 * says so where it computes them —
 *
 *   "A mean over a long-tailed distribution is defined by its outliers. Reporting the median
 *    beside it lets a reader see when one slow thread is carrying the whole figure."
 *
 * So the tile shows the median and the count next to the mean, and neither is inferred: both
 * come off the wire already computed over exactly the window the headline used.
 */

/** `95` → `1h 35m`, `40` → `40m`, `null` → `—`. */
export const formatMinutes = (mins: number | null): string => {
  if (mins === null) return '—';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem > 0 ? `${hrs}h ${rem}m` : `${hrs}h`;
};

/**
 * The line under the headline: `median 41m · 42 threads`.
 *
 * Returns null when there is nothing to qualify — no sample means the headline is already
 * `—`, and a second line saying `0 threads` under a dash is noise.
 *
 * The median is dropped rather than printed as `—` when the API omits it: the count alone
 * still tells a reader how much weight the average carries, and a stray dash next to a real
 * number reads like a broken field.
 */
export const responseMetricDetail = (
  medianMins: number | null,
  sampleSize: number
): string | null => {
  if (!Number.isFinite(sampleSize) || sampleSize <= 0) return null;
  const threads = `${sampleSize} ${sampleSize === 1 ? 'thread' : 'threads'}`;
  return medianMins === null ? threads : `median ${formatMinutes(medianMins)} · ${threads}`;
};
