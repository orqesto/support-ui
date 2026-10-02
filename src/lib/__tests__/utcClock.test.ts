import { describe, expect, it } from 'vitest';
import {
  describeNextReset,
  formatUtcAndLocal,
  formatUtcDateAndLocal,
  nextUtcMidnight,
} from '../utcClock';

const pad = (value: number) => String(value).padStart(2, '0');

describe('utcClock — "00:00 UTC (HH:MM your time)"', () => {
  it('writes the instant in UTC, then the same instant on the reader clock', () => {
    const iso = '2026-10-01T00:12:00.000Z';
    const at = new Date(iso);
    expect(formatUtcAndLocal(iso)).toBe(
      `00:12 UTC (${pad(at.getHours())}:${pad(at.getMinutes())} your time)`
    );
  });

  it('says nothing for a missing or malformed instant — never "Invalid Date"', () => {
    expect(formatUtcAndLocal(null)).toBeNull();
    expect(formatUtcAndLocal(undefined)).toBeNull();
    expect(formatUtcAndLocal('not a date')).toBeNull();
  });

  it('the next reset is the next 00:00 UTC, including just before midnight', () => {
    expect(nextUtcMidnight(new Date('2026-09-30T23:59:59.000Z'))).toBe('2026-10-01T00:00:00.000Z');
    expect(nextUtcMidnight(new Date('2026-09-30T00:00:00.000Z'))).toBe('2026-10-01T00:00:00.000Z');
    expect(describeNextReset(new Date('2026-09-30T10:00:00.000Z'))).toMatch(
      /^00:00 UTC \(\d\d:\d\d your time\)$/
    );
  });
});

describe("utcClock — the reader's date when it is another day there (pass 9)", () => {
  const withTz = (tz: string, run: () => void) => {
    const before = process.env.TZ;
    process.env.TZ = tz;
    try {
      run();
    } finally {
      if (before === undefined) delete process.env.TZ;
      else process.env.TZ = before;
    }
  };

  it('a reader nine hours ahead is told their own date', () => {
    withTz('Asia/Tokyo', () => {
      expect(formatUtcDateAndLocal('2026-09-30T20:00:00.000Z')).toBe(
        '20:00 UTC on 2026-09-30 (05:00 on 2026-10-01 your time)'
      );
    });
  });

  it('CONTROL: the same calendar day there — no second date', () => {
    withTz('UTC', () => {
      expect(formatUtcDateAndLocal('2026-09-30T20:00:00.000Z')).toBe(
        '20:00 UTC on 2026-09-30 (20:00 your time)'
      );
    });
  });
});
