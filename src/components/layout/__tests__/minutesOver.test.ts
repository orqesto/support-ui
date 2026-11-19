import { describe, expect, it } from 'vitest';
import { formatBreachAmount, minutesOver } from '../notificationFormat';

const now = Date.parse('2026-11-19T12:00:00.000Z');

describe('minutesOver — the bell counts a growing breach itself (the row is not rewritten)', () => {
  it('a running wait: minutes since the wait started, minus the target', () => {
    const breach = {
      breachAmount: 10, // what the server stored when it last wrote the row
      details: { waitStartedAt: '2026-11-19T10:00:00.000Z', targetMinutes: 60 },
    };
    expect(minutesOver(breach, now)).toBe(60);
    expect(minutesOver(breach, now + 30 * 60_000)).toBe(90);
    expect(formatBreachAmount(minutesOver(breach, now))).toBe('1h over');
  });

  it('CONTROL: a recorded breach (no wait start) shows its stored, fixed minutes', () => {
    expect(minutesOver({ breachAmount: 42, details: { targetMinutes: 30 } }, now)).toBe(42);
  });

  it('a row from an older server (no wait start) or with no target shows the stored minutes', () => {
    expect(minutesOver({ breachAmount: 15, details: {} }, now)).toBe(15);
    expect(
      minutesOver({ breachAmount: 15, details: { waitStartedAt: '2026-11-19T10:00:00.000Z' } }, now)
    ).toBe(15);
  });

  it('an unreadable wait start falls back to the stored minutes', () => {
    expect(
      minutesOver(
        { breachAmount: 7, details: { waitStartedAt: 'not a date', targetMinutes: 5 } },
        now
      )
    ).toBe(7);
  });

  it('a clock behind the server never shows less than the server stored', () => {
    const breach = {
      breachAmount: 120,
      details: { waitStartedAt: '2026-11-19T11:30:00.000Z', targetMinutes: 10 },
    };
    expect(minutesOver(breach, now)).toBe(120);
  });
});
