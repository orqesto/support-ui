/**
 * A report window travels as `?days=N` (every link made before the calendar) or as
 * `?from=YYYY-MM-DD&to=YYYY-MM-DD` (a custom range); the API gets `days` OR `from`/`to`.
 */
import { describe, it, expect } from 'vitest';
import {
  periodFromSearch,
  periodKey,
  periodParams,
  periodToSearch,
  pickerValueToPeriod,
  periodToPickerValue,
} from '../reportPeriod';

describe('periodFromSearch', () => {
  it('an old ?days=30 link still loads 30 days', () => {
    expect(periodFromSearch('?days=30', 90)).toEqual({ days: 30 });
  });
  it('a custom range from the URL, with its span as days', () => {
    expect(periodFromSearch('?from=2026-10-03&to=2026-10-09', 30)).toEqual({ days: 7, fromDay: '2026-10-03', toDay: '2026-10-09' });
  });
  it('nothing, garbage or a backwards range → the default', () => {
    expect(periodFromSearch('', 30)).toEqual({ days: 30 });
    expect(periodFromSearch('?days=abc', 30)).toEqual({ days: 30 });
    expect(periodFromSearch('?from=2026-10-09&to=2026-10-03', 30)).toEqual({ days: 30 });
  });
  it('a screen that honours only its presets keeps doing so', () => {
    expect(periodFromSearch('?days=12', 30, [7, 30])).toEqual({ days: 30 });
  });
});

describe('periodParams', () => {
  it('days → {days}; a range → the first and last local instant', () => {
    expect(periodParams({ days: 7 })).toEqual({ days: 7 });
    expect(periodParams({ days: 7, fromDay: '2026-10-03', toDay: '2026-10-09' })).toEqual({
      from: new Date(2026, 9, 3).toISOString(),
      to: new Date(2026, 9, 9, 23, 59, 59, 999).toISOString(),
    });
  });
});

describe('round trips', () => {
  it('URL params', () => {
    const period = { days: 7, fromDay: '2026-10-03', toDay: '2026-10-09' };
    const params = periodToSearch(period, new URLSearchParams('days=30&channel=email'));
    expect(params.toString()).toBe('channel=email&from=2026-10-03&to=2026-10-09');
    expect(periodFromSearch(params, 30)).toEqual(period);
  });
  it('picker value', () => {
    expect(pickerValueToPeriod(periodToPickerValue({ days: 30 }))).toEqual({ days: 30 });
    expect(periodKey(pickerValueToPeriod({ kind: 'range', from: '2026-10-03', to: '2026-10-09' }))).toBe('2026-10-03~2026-10-09');
  });
});
