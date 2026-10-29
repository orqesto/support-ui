/**
 * How a thread-list total may be shown (backend search plan step 3½). Its own module, not
 * message.service: suites mock that service with a few functions, and a component importing these
 * from it would fail there.
 */

type TotalMeta = { total: number; totalCapped?: boolean; countTimedOut?: boolean };

/** A total as the list shows it: `10,000+` when it is a lower bound, never as exact. */
export const formatTotal = (total: number, capped?: boolean): string =>
  `${total.toLocaleString()}${capped ? '+' : ''}`;

/** A total a counter may show as a number: exact only (not capped, not cut short). */
export const exactTotal = (pagination: TotalMeta | undefined): number | undefined =>
  pagination && !pagination.totalCapped && !pagination.countTimedOut ? pagination.total : undefined;

/**
 * What a counter (a view pill, a triage chip) shows: an exact number, or `{ atLeast }` when the
 * backend stopped counting at its cap — shown `10,000+` (owner 2026-10-29). Never a count that ran
 * out of time: that is no number at all.
 */
export type Count = number | { atLeast: number };

/** A list total as a counter: exact, at least (the cap bit), or nothing (unknown, cut short). */
export const counterTotal = (pagination: TotalMeta | undefined): Count | undefined => {
  if (!pagination || pagination.countTimedOut) return undefined;
  return pagination.totalCapped ? { atLeast: pagination.total } : pagination.total;
};

/** A counter's text: `42`, or `10,000+`. */
export const formatCount = (count: Count): string =>
  typeof count === 'number' ? String(count) : formatTotal(count.atLeast, true);

/** Counters added up: unknown if any is unknown; "at least" if any is. */
export const sumCounts = (counts: (Count | undefined)[]): Count | undefined => {
  let sum = 0;
  let atLeast = false;
  for (const count of counts) {
    if (count === undefined) return undefined;
    if (typeof count === 'number') sum += count;
    else {
      sum += count.atLeast;
      atLeast = true;
    }
  }
  return atLeast ? { atLeast: sum } : sum;
};
