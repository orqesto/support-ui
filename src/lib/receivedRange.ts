/**
 * The Received filter's date half.
 *
 * `ageRange` gives four relative buckets and cannot say "between the 3rd and the 9th";
 * the API's `receivedFrom` / `receivedTo` can, and rank on the same arrival expression,
 * so the two agree about when a thread arrived. One control offers both — a bucket OR a
 * range, never both, because two overlapping notions of "received" on screen at once is
 * the kind of thing nobody can predict the result of.
 *
 * Stored as full ISO instants rather than `YYYY-MM-DD`: a bare date string reaching
 * `::timestamptz` is resolved in the SERVER's timezone, which is not the one the user
 * picked the day in. The conversion here is local-time and reversible, so the input
 * shows back exactly the day that was chosen.
 */

const isValid = (date: Date): boolean => !Number.isNaN(date.getTime());

const pad = (value: number, width = 2): string => String(value).padStart(width, '0');

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Is this a day someone actually meant?
 *
 * An `<input type="date">` fires a change for every value that LOOKS complete, and a year
 * is typed one digit at a time — 0002, 0020, 0202 all arrive before 2026. Each is a valid
 * Date, so parsing alone accepts them, and the filter ends up set to the year 2 while the
 * field displays nothing (it will not render a year it cannot fit). Requiring a plausible
 * year means a half-typed one leaves the bound alone instead.
 */
const isPlausibleDay = (dateInput: string): boolean => {
  const parts = DAY.exec(dateInput);
  if (!parts) return false;
  const year = Number(parts[1]);
  return year >= 1970 && year <= 2999;
};

/** `YYYY-MM-DD` → the first instant of that day in the user's timezone. */
export const startOfDayIso = (dateInput: string): string | undefined => {
  if (!isPlausibleDay(dateInput)) return undefined;
  const date = new Date(`${dateInput}T00:00:00`);
  return isValid(date) ? date.toISOString() : undefined;
};

/** `YYYY-MM-DD` → the last instant of that day, so "to the 9th" includes the 9th. */
export const endOfDayIso = (dateInput: string): string | undefined => {
  if (!isPlausibleDay(dateInput)) return undefined;
  const date = new Date(`${dateInput}T23:59:59.999`);
  return isValid(date) ? date.toISOString() : undefined;
};

/** ISO instant → the `YYYY-MM-DD` an `<input type="date">` wants, in local time. The year
 *  is padded to four digits: the field silently renders nothing for a shorter one, which
 *  is how a set filter can appear to be unset. */
export const toDateInput = (iso: string | undefined): string => {
  if (!iso) return '';
  const date = new Date(iso);
  if (!isValid(date)) return '';
  return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const day = (iso: string): string =>
  new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

/** How a range reads on a token: one bound, the other, or both. */
export const rangeText = (from?: string, to?: string): string => {
  if (from && to) return `${day(from)} – ${day(to)}`;
  if (from) return `since ${day(from)}`;
  if (to) return `until ${day(to)}`;
  return '';
};

/** The token value for a range — parsed back by `rangeFromValue`. */
export const RANGE_SEPARATOR = '..';

export const rangeValue = (from?: string, to?: string): string =>
  `${from ?? ''}${RANGE_SEPARATOR}${to ?? ''}`;

export const rangeFromValue = (value: string): { from?: string; to?: string } => {
  const [from, to] = value.split(RANGE_SEPARATOR);
  return { from: from || undefined, to: to || undefined };
};

export const isRangeValue = (value: string): boolean => value.includes(RANGE_SEPARATOR);
