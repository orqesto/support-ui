/**
 * A mailbox import from a chosen day (date-range calendar, 2026-10-22): the picker reads a stored
 * since day, a preset clears one, and the count estimate reaches back as far as the import will.
 */
import { describe, it, expect } from 'vitest';
import {
  countLookbackDays,
  importRangeDays,
  importRangePatch,
  importRangeValue,
  sinceDay,
} from '../importRange';

// Pinned: UTC+3 in October (no DST change before 25 Oct), so local midnight is 21:00Z the day before.
process.env.TZ = 'Europe/Helsinki';

describe('importRangeValue', () => {
  it('a stored since day shows as a since day', () => {
    expect(importRangeValue({ bulkImportDays: 30, bulkImportSince: '2026-10-03' }, 30)).toEqual({
      kind: 'since',
      since: '2026-10-03',
    });
  });
  it('else the stored days, as a preset (0 = all time stays 0)', () => {
    expect(importRangeValue({ bulkImportDays: 90 }, 30)).toEqual({ kind: 'preset', value: '90' });
    expect(importRangeValue({ bulkImportDays: 0 }, 30)).toEqual({ kind: 'preset', value: '0' });
    expect(importRangeValue({ bulkImportDays: '180' }, 30)).toEqual({
      kind: 'preset',
      value: '180',
    });
  });
  it('nothing stored → the default', () => {
    expect(importRangeValue(undefined, 30)).toEqual({ kind: 'preset', value: '30' });
    expect(importRangeValue({ bulkImportSince: null }, 7)).toEqual({ kind: 'preset', value: '7' });
  });
});

describe('importRangePatch', () => {
  it('a preset sends its days and clears a since day', () => {
    expect(importRangePatch({ kind: 'preset', value: '90' })).toEqual({
      bulkImportDays: 90,
      bulkImportSince: null,
    });
  });
  it('a since day is sent as the instant of its LOCAL midnight', () => {
    expect(importRangePatch({ kind: 'since', since: '2026-10-01' })).toEqual({
      bulkImportSince: '2026-09-30T21:00:00.000Z',
    });
    expect(importRangePatch({ kind: 'range', from: '2026-10-03', to: '2026-10-09' })).toEqual({
      bulkImportSince: '2026-10-02T21:00:00.000Z',
    });
  });
  it('reads back as the same day', () => {
    const sent = importRangePatch({ kind: 'since', since: '2026-10-01' }).bulkImportSince;
    expect(importRangeValue({ bulkImportSince: sent }, 30)).toEqual({
      kind: 'since',
      since: '2026-10-01',
    });
  });
});

describe('sinceDay — reading a stored value', () => {
  it('an instant is the local day it falls on', () => {
    expect(sinceDay('2026-09-30T21:00:00.000Z')).toBe('2026-10-01');
    expect(sinceDay('2026-10-01T20:59:00.000Z')).toBe('2026-10-01');
  });
  it('a legacy day is that day', () => {
    expect(sinceDay('2026-10-03')).toBe('2026-10-03');
  });
  it('nothing or junk is null', () => {
    expect(sinceDay(null)).toBeNull();
    expect(sinceDay('nope')).toBeNull();
  });
});

describe('importRangeDays — the estimate reaches as far as the import', () => {
  it('whole days from the since day local midnight, at least 1', () => {
    const now = new Date('2026-10-22T07:00:00Z');
    expect(importRangeDays({ kind: 'since', since: '2026-10-03' }, now)).toBe(19);
    expect(countLookbackDays({ bulkImportSince: '2026-10-02T21:00:00.000Z' }, now)).toBe(19);
    expect(countLookbackDays({ bulkImportSince: '2026-10-03' }, now)).toBe(19);
    expect(importRangeDays({ kind: 'since', since: '2026-10-22' }, now)).toBe(1);
    expect(importRangeDays({ kind: 'preset', value: '0' }, now)).toBe(0);
  });
});

describe('countLookbackDays — the IMAP form check counts what the import will read (final review)', () => {
  it('a since day sends the days back to it', async () => {
    const { countLookbackDays } = await import('../importRange');
    const now = new Date('2026-10-22T07:00:00Z');
    expect(countLookbackDays({ lookbackDays: 30, bulkImportSince: '2026-10-03' }, now)).toBe(19);
  });
  it('no since day → the lookback as set', async () => {
    const { countLookbackDays } = await import('../importRange');
    expect(countLookbackDays({ lookbackDays: 90 })).toBe(90);
    expect(countLookbackDays({})).toBeUndefined();
  });
});

describe('imapEarliestDay (final review: IMAP cut a since day older than 365 days silently)', () => {
  it('is 364 days before today, so today plus 364 earlier days are pickable', async () => {
    const { imapEarliestDay } = await import('../importRange');
    expect(imapEarliestDay(new Date(2026, 9, 22, 10))).toBe('2025-10-23');
  });
});
