import {
  rangeQuery,
  spanDays,
  type DateRangePreset,
  type DateRangeValue,
} from '@/components/ui/DateRangePicker';

/**
 * A report's window: the last `days`, or a custom range of the user's local days (`fromDay`,
 * `toDay`, `YYYY-MM-DD`). `days` is always there (a range's span), so a tab that prints "last N
 * days" keeps working; the API gets `days` OR `from`/`to` (periodParams), never both.
 */
export type ReportPeriod = { days: number } | { days: number; fromDay: string; toDay: string };

export const isCustomPeriod = (
  period: ReportPeriod
): period is { days: number; fromDay: string; toDay: string } => 'fromDay' in period;

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The API query for a period: `{days}` or the first and last instant of its local days. */
export const periodParams = (period: ReportPeriod): { days: number } | { from: string; to: string } =>
  isCustomPeriod(period) ? rangeQuery(period.fromDay, period.toDay) : { days: period.days };

/** The same as a query string. */
export const periodQueryString = (period: ReportPeriod): string =>
  new URLSearchParams(
    Object.entries(periodParams(period)).map(([key, value]) => [key, String(value)])
  ).toString();

/** A stable key for caches and effect dependencies. */
export const periodKey = (period: ReportPeriod): string =>
  isCustomPeriod(period) ? `${period.fromDay}~${period.toDay}` : String(period.days);

/**
 * The period a URL holds: `?from=YYYY-MM-DD&to=YYYY-MM-DD` (a custom range), else `?days=N`
 * (every link made before the calendar), else the screen's default. `allowedDays` keeps a screen's
 * old rule of honouring only its own presets.
 */
export const periodFromSearch = (
  search: string | URLSearchParams,
  defaultDays: number,
  allowedDays?: readonly number[]
): ReportPeriod => {
  const params = typeof search === 'string' ? new URLSearchParams(search) : search;
  const fromDay = params.get('from');
  const toDay = params.get('to');
  if (fromDay && toDay && DAY.test(fromDay) && DAY.test(toDay) && fromDay <= toDay) {
    return { days: spanDays(fromDay, toDay), fromDay, toDay };
  }
  const days = Number(params.get('days'));
  if (days > 0 && (!allowedDays || allowedDays.includes(days))) return { days };
  return { days: defaultDays };
};

/** Write a period into URL params (replacing whichever form was there). */
export const periodToSearch = (period: ReportPeriod, params: URLSearchParams): URLSearchParams => {
  params.delete('days');
  params.delete('from');
  params.delete('to');
  if (isCustomPeriod(period)) {
    params.set('from', period.fromDay);
    params.set('to', period.toDay);
  } else {
    params.set('days', String(period.days));
  }
  return params;
};

/** Day-count presets for the picker (`value` is the day count as text). */
export const dayPresets = (options: readonly { days: number; label: string }[]): DateRangePreset[] =>
  options.map((option) => ({ value: String(option.days), label: option.label }));

export const periodToPickerValue = (period: ReportPeriod): DateRangeValue =>
  isCustomPeriod(period)
    ? { kind: 'range', from: period.fromDay, to: period.toDay }
    : { kind: 'preset', value: String(period.days) };

export const pickerValueToPeriod = (value: DateRangeValue): ReportPeriod => {
  if (value.kind === 'range') return { days: spanDays(value.from, value.to), fromDay: value.from, toDay: value.to };
  if (value.kind === 'since') return { days: 1, fromDay: value.since, toDay: value.since };
  return { days: Number(value.value) };
};
