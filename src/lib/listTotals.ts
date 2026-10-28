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
