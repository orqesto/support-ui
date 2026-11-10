/**
 * Where SLA Performance lives: Statistics → Performance (its SLA section is first). The old `/sla`
 * page and the Dashboard's "Avg Response Time" tile both land here with the window they carry, so
 * the figures match the number clicked.
 *
 * Same rules as `periodFromSearch` (`@/lib/reportPeriod`) with the Statistics presets: a custom
 * range is kept; a day count the picker has no button for (e.g. the tile's 1-day window) falls back
 * to `defaultDays` instead of stranding the picker. Kept import-free on purpose: the `/sla`
 * redirect loads with the app shell, and `reportPeriod` pulls in date-fns (~30 KB of main chunk).
 */
export const STATISTICS_PRESET_DAYS: readonly number[] = [7, 30, 90, 365];

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export const slaPerformancePath = (search: string, defaultDays: number): string => {
  const params = new URLSearchParams(search);
  const out = new URLSearchParams();
  const fromDay = params.get('from');
  const toDay = params.get('to');
  if (fromDay && toDay && DAY.test(fromDay) && DAY.test(toDay) && fromDay <= toDay) {
    out.set('from', fromDay);
    out.set('to', toDay);
  } else {
    const days = Number(params.get('days'));
    out.set('days', String(STATISTICS_PRESET_DAYS.includes(days) ? days : defaultDays));
  }
  return `/statistics?${out.toString()}#performance`;
};
