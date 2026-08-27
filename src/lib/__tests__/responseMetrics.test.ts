/**
 * The dashboard showed a mean and nothing else. These pin the two facts that make it
 * readable — the median beside it, and how many threads it is an average OF.
 */
import { describe, it, expect } from 'vitest';
import { formatMinutes, responseMetricDetail } from '../responseMetrics';

describe('formatMinutes', () => {
  it('renders minutes, hours, and both', () => {
    expect(formatMinutes(40)).toBe('40m');
    expect(formatMinutes(120)).toBe('2h');
    expect(formatMinutes(95)).toBe('1h 35m');
  });

  it('renders a dash for no value, not "0m"', () => {
    expect(formatMinutes(null)).toBe('—');
  });
});

describe('responseMetricDetail', () => {
  it('puts the median next to the count', () => {
    expect(responseMetricDetail(41, 42)).toBe('median 41m · 42 threads');
  });

  it('says how much weight a small average carries', () => {
    // The whole point: 5h over one thread is not the same claim as 5h over 600.
    expect(responseMetricDetail(305, 1)).toBe('median 5h 5m · 1 thread');
  });

  it('keeps the count when the API omits a median', () => {
    // A stray dash beside a real number reads like a broken field; the count alone is
    // still worth showing.
    expect(responseMetricDetail(null, 12)).toBe('12 threads');
  });

  it('says nothing at all when there is no sample', () => {
    // The headline is already "—". A line reading "0 threads" underneath is noise.
    expect(responseMetricDetail(null, 0)).toBeNull();
    expect(responseMetricDetail(41, 0)).toBeNull();
    expect(responseMetricDetail(41, Number.NaN)).toBeNull();
  });
});
