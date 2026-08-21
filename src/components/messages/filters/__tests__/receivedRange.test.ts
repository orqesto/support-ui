/**
 * The Received filter's date half.
 *
 * The whole reason this module exists is the conversion: a day the user picked is not an
 * instant, and the API compares instants. Getting it wrong is invisible — the filter
 * still works, it just quietly excludes the last day, or the first.
 */
import { describe, it, expect } from 'vitest';
import {
  endOfDayIso,
  isRangeValue,
  rangeFromValue,
  rangeText,
  rangeValue,
  startOfDayIso,
  toDateInput,
} from '../receivedRange';

describe('day ↔ instant', () => {
  it('round-trips the day the user picked, in their own timezone', () => {
    // The failure this guards: storing UTC midnight and reading it back in a timezone
    // behind UTC shows the PREVIOUS day in the input.
    for (const day of ['2026-01-01', '2026-06-15', '2026-12-31']) {
      expect(toDateInput(startOfDayIso(day))).toBe(day);
      expect(toDateInput(endOfDayIso(day))).toBe(day);
    }
  });

  it('ends the day at its last instant, so a one-day range is not empty', () => {
    const from = startOfDayIso('2026-08-21');
    const to = endOfDayIso('2026-08-21');
    expect(from && to && new Date(to).getTime() - new Date(from).getTime()).toBe(
      24 * 60 * 60 * 1000 - 1
    );
  });

  it('ignores a year still being typed', () => {
    // Found in the browser, not in a test: a date input fires a change for every value
    // that looks complete, and the year arrives a digit at a time — 0002, 0020, 0202 are
    // all real Dates. Storing one set the filter to the year 2 while the field showed
    // nothing back, because it will not render a year it cannot fit. The filter was on;
    // the control looked off.
    for (const halfTyped of ['0002-08-01', '0020-08-01', '0202-08-01']) {
      expect(startOfDayIso(halfTyped)).toBeUndefined();
      expect(endOfDayIso(halfTyped)).toBeUndefined();
    }
    expect(startOfDayIso('2026-08-01')).toBeDefined();
  });

  it('never hands back a day the input cannot display', () => {
    // The other half of the same failure: whatever is stored has to round-trip into the
    // field, or the two disagree about whether the filter is set.
    const day = toDateInput(startOfDayIso('2026-08-01'));
    expect(day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('rejects a date it cannot parse rather than passing NaN on', () => {
    // `NaN::timestamptz` is a 500, and a silently wrong window is worse than none.
    expect(startOfDayIso('')).toBeUndefined();
    expect(startOfDayIso('not-a-date')).toBeUndefined();
    expect(endOfDayIso('2026-13-45')).toBeUndefined();
  });

  it('reads an absent or unparseable instant as an empty input', () => {
    expect(toDateInput(undefined)).toBe('');
    expect(toDateInput('nonsense')).toBe('');
  });
});

describe('the token value', () => {
  const from = startOfDayIso('2026-08-01');
  const to = endOfDayIso('2026-08-09');

  it('survives being packed into one string and unpacked', () => {
    expect(rangeFromValue(rangeValue(from, to))).toEqual({ from, to });
  });

  it('keeps a one-sided range one-sided', () => {
    expect(rangeFromValue(rangeValue(from, undefined))).toEqual({ from, to: undefined });
    expect(rangeFromValue(rangeValue(undefined, to))).toEqual({ from: undefined, to });
  });

  it('is distinguishable from a bucket value', () => {
    // Both live in the same token slot, and only one of them is a range.
    expect(isRangeValue(rangeValue(from, to))).toBe(true);
    expect(isRangeValue('lt24h')).toBe(false);
  });

  it('reads as a sentence with one bound or two', () => {
    expect(rangeText(from, to)).toMatch(/–/);
    expect(rangeText(from, undefined)).toMatch(/^since /);
    expect(rangeText(undefined, to)).toMatch(/^until /);
    expect(rangeText(undefined, undefined)).toBe('');
  });
});
