/** Counters and the backend's caps (search plan step 3½d): `10,000+`, never an invented number. */
import { describe, expect, it } from 'vitest';
import { counterTotal, formatCount, hiddenKnown, sumCounts } from '../listTotals';

describe('list counters', () => {
  it('a capped total is "at least", a timed-out one is unknown, an exact one a number', () => {
    expect(counterTotal({ total: 42 })).toBe(42);
    expect(counterTotal({ total: 10000, totalCapped: true })).toEqual({ atLeast: 10000 });
    expect(counterTotal({ total: 26, totalCapped: true, countTimedOut: true })).toBeUndefined();
    expect(counterTotal(undefined)).toBeUndefined();
  });

  it('shows "at least" with a plus', () => {
    expect(formatCount(42)).toBe('42');
    expect(formatCount({ atLeast: 10000 })).toBe(`${(10000).toLocaleString()}+`);
  });

  it('adds counters: unknown if any is, "at least" if any is', () => {
    expect(sumCounts([1, 2])).toBe(3);
    expect(sumCounts([1, { atLeast: 1000 }])).toEqual({ atLeast: 1001 });
    expect(sumCounts([1, undefined])).toBeUndefined();
  });

  it('a capped scope says nothing about hidden rows', () => {
    expect(hiddenKnown({ hidden: 7 })).toBe(7);
    expect(hiddenKnown({ hidden: 7, capped: true })).toBe(0);
    expect(hiddenKnown(null)).toBe(0);
  });
});
