/**
 * One implementation, two surfaces. These pin the boundary and the wording, because the
 * notification and the document row must never disagree about the same document — a reader
 * who sees "8 months" in one place and nothing in the other has no way to tell which is
 * lying.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { daysSince, isStale, formatStaleAge, KB_STALE_AFTER_DAYS } from '../kbStaleness';

const iso = (daysAgo: number) =>
  new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString();

afterEach(() => {
  vi.useRealTimers();
});

describe('daysSince', () => {
  it('counts whole days', () => {
    expect(daysSince(iso(45))).toBe(45);
  });

  /** CONTROL: absent and malformed dates must not read as "infinitely stale". */
  it('CONTROL: returns null rather than a number it cannot justify', () => {
    expect(daysSince(null)).toBeNull();
    expect(daysSince(undefined)).toBeNull();
    expect(daysSince('not a date')).toBeNull();
  });
});

describe('isStale', () => {
  it('is true at the threshold and false one day short of it', () => {
    expect(isStale(iso(KB_STALE_AFTER_DAYS))).toBe(true);
    expect(isStale(iso(KB_STALE_AFTER_DAYS - 1))).toBe(false);
  });

  /**
   * CONTROL: a document with no usable date is NOT flagged. Flagging it would put an amber
   * badge on every row the API could not date, which is noise pointing at nothing.
   */
  it('CONTROL: an unknown date is not stale', () => {
    expect(isStale(null)).toBe(false);
    expect(isStale('')).toBe(false);
  });
});

describe('formatStaleAge', () => {
  it('reads in months, because the threshold is measured in months', () => {
    expect(formatStaleAge(221)).toBe('7 months');
    expect(formatStaleAge(35)).toBe('1 month');
  });

  it('collapses long absences rather than printing a large number', () => {
    expect(formatStaleAge(402)).toBe('over a year');
    expect(formatStaleAge(900)).toBe('over 2 years');
  });

  it('falls back to days below a month', () => {
    expect(formatStaleAge(12)).toBe('12 days');
    expect(formatStaleAge(1)).toBe('1 day');
  });
});
