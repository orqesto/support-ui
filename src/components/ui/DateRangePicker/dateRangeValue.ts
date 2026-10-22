import { differenceInCalendarDays, format, parseISO } from 'date-fns';
import { endOfDayIso, startOfDayIso } from '@/components/messages/filters/receivedRange';

/**
 * What a period control holds: one of the screen's quick choices (`preset`, by its own value —
 * "30", "lt24h"…), a custom from–to range, or one "since" day (a mailbox import). Days are the
 * user's LOCAL `YYYY-MM-DD`; `rangeQuery` turns them into the instants the API takes.
 */
export type DateRangeValue =
  | { kind: 'preset'; value: string }
  | { kind: 'range'; from: string; to: string }
  | { kind: 'since'; since: string };

export type DateRangePreset = { value: string; label: string };

/** A local `YYYY-MM-DD` day as a Date at its local midnight. */
export const dayToDate = (day: string): Date => parseISO(day);

/** A Date as its local `YYYY-MM-DD` day. */
export const dateToDay = (date: Date): string => format(date, 'yyyy-MM-dd');

/** Whole days from `from` to `to`, both counted: 3 Oct – 9 Oct is 7. */
export const spanDays = (from: string, to: string): number =>
  differenceInCalendarDays(dayToDate(to), dayToDate(from)) + 1;

/**
 * The API's `from`/`to`: the first instant of the from-day and the LAST instant of the to-day, in
 * the user's time zone — so "to the 9th" includes the 9th's evening, east or west of UTC.
 */
export const rangeQuery = (from: string, to: string): { from: string; to: string } => ({
  from: startOfDayIso(from) ?? '',
  to: endOfDayIso(to) ?? '',
});

/** How a value reads on its trigger. */
export const formatRangeLabel = (value: DateRangeValue, presets: readonly DateRangePreset[]): string => {
  if (value.kind === 'preset') return presets.find((preset) => preset.value === value.value)?.label ?? value.value;
  if (value.kind === 'since') return `Since ${format(dayToDate(value.since), 'd MMM yyyy')}`;
  const from = dayToDate(value.from);
  const to = dayToDate(value.to);
  const sameYear = from.getFullYear() === to.getFullYear();
  return `${format(from, sameYear ? 'd MMM' : 'd MMM yyyy')} – ${format(to, 'd MMM yyyy')}`;
};
