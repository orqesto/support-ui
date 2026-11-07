import { describe, expect, it } from 'vitest';
import { allowanceLine } from '../kbRangeCopy';

describe('allowanceLine money', () => {
  it('allowance: an agent gets no money; the old aiAllowance shape never prints NaN', () => {
    const short = {
      bulkMicrosLeft: 3_200_000,
      estimatedMicros: 5_000_000,
      estimatedCalls: 130,
      short: true,
    };
    const agent = allowanceLine(short, false, 'managed') ?? '';
    expect(agent).not.toMatch(/\$|NaN/);
    expect(agent).toContain("more than is left of this period's AI allowance");
    // Old backend: { callsLeftThisMonth, estimatedCalls, short } - no money fields at all.
    const oldShape = { callsLeftThisMonth: 40, estimatedCalls: 130, short: true } as unknown as Parameters<
      typeof allowanceLine
    >[0];
    for (const showMoney of [true, false]) {
      const line = allowanceLine(oldShape, false, 'managed', showMoney) ?? '';
      expect(line).not.toMatch(/NaN|\$/);
    }
    expect(allowanceLine(oldShape, false, 'managed', true)).toBe(
      'If AI is unavailable during the read, the affected threads stay unmined and are retried automatically.'
    );
  });
});
