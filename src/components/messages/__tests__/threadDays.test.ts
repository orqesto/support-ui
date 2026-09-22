/**
 * Day separators in the thread (v3). Grouped by the SAME time the thread is sorted by, so a
 * separator can only ever sit between days, in order. All times are built in LOCAL time, the
 * way the UI renders them.
 */
import { describe, it, expect } from 'vitest';
import type { MessageEvent } from '@/types';
import { dayLabel, dayStarts, threadTimeOf } from '../threadDays';

const at = (year: number, month: number, day: number, hour = 12, minute = 0) =>
  new Date(year, month - 1, day, hour, minute).getTime();
const now = new Date(2026, 8, 22, 15, 0); // Tue 22 Sep 2026, 15:00 local

describe('dayLabel', () => {
  it('names today and yesterday', () => {
    expect(dayLabel(at(2026, 9, 22, 0, 5), now)).toBe('Today');
    expect(dayLabel(at(2026, 9, 21, 23, 59), now)).toBe('Yesterday');
  });

  it('gives weekday, day and month within this year', () => {
    expect(dayLabel(at(2026, 9, 15), now)).toBe('Tuesday 15 September');
  });

  it('adds the year only when it is not this year', () => {
    expect(dayLabel(at(2025, 12, 31), now)).toBe('Wednesday 31 December 2025');
  });

  it('knows yesterday across a month boundary', () => {
    const firstOfMonth = new Date(2026, 9, 1, 9, 0); // 1 Oct
    expect(dayLabel(at(2026, 9, 30, 22, 0), firstOfMonth)).toBe('Yesterday');
  });
});

describe('dayStarts', () => {
  it('opens the thread with its first day and adds nothing within a single day', () => {
    expect([...dayStarts([at(2026, 9, 22, 9), at(2026, 9, 22, 11), at(2026, 9, 22, 14)])]).toEqual([
      0,
    ]);
  });

  it('marks each item that begins a new day — across midnight', () => {
    const times = [at(2026, 9, 21, 23, 58), at(2026, 9, 21, 23, 59), at(2026, 9, 22, 0, 1)];
    expect([...dayStarts(times)]).toEqual([0, 2]);
  });

  it('marks a year change', () => {
    expect([...dayStarts([at(2025, 12, 31, 23), at(2026, 1, 1, 1)])]).toEqual([0, 1]);
  });

  it('never starts a day on an unparseable time', () => {
    expect([...dayStarts([Number.NaN, at(2026, 9, 22)])]).toEqual([1]);
  });

  it('an empty thread has no separators', () => {
    expect(dayStarts([]).size).toBe(0);
  });
});

describe('threadTimeOf — the ordering rule the separators share', () => {
  const msg = (fields: Partial<MessageEvent>) => fields as MessageEvent;

  it('prefers sentAt, then metadata.receivedAt, then createdAt', () => {
    expect(
      threadTimeOf(msg({ sentAt: '2026-09-22T10:00:00Z', createdAt: '2026-09-01T00:00:00Z' }))
    ).toBe(Date.parse('2026-09-22T10:00:00Z'));
    expect(
      threadTimeOf(
        msg({ metadata: { receivedAt: '2026-09-21T10:00:00Z' }, createdAt: '2026-09-01T00:00:00Z' })
      )
    ).toBe(Date.parse('2026-09-21T10:00:00Z'));
    expect(threadTimeOf(msg({ createdAt: '2026-09-01T00:00:00Z' }))).toBe(
      Date.parse('2026-09-01T00:00:00Z')
    );
  });
});
