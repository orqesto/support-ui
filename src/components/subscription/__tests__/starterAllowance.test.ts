/**
 * Free AI starter allowance (owner decision 2026-10-22): the one module that knows the wire shape.
 * Parsing tolerates an older backend (no field) and a malformed one; the line reads messages for
 * agents and adds money for admins; without microsPerMessage it reads a percentage.
 */
import { describe, expect, it } from 'vitest';
import {
  FREE_AI_ALLOWANCE_USED,
  isFreeAiAllowanceUsedError,
  parseStarterAllowance,
  starterAllowanceLine,
  type StarterAllowance,
} from '../starterAllowance';

const block = (over: Record<string, unknown> = {}) => ({
  totalMicros: 400_000,
  usedMicros: 148_000,
  remainingMicros: 252_000,
  exhausted: false,
  ...over,
});

describe('parseStarterAllowance', () => {
  it('older backend: no field, no ai block, or not an object ⇒ undefined', () => {
    expect(parseStarterAllowance(undefined)).toBeUndefined();
    expect(parseStarterAllowance({ active: true })).toBeUndefined();
    expect(parseStarterAllowance({ starterAllowance: null })).toBeUndefined();
    expect(parseStarterAllowance({ starterAllowance: 'lots' })).toBeUndefined();
  });

  it('malformed figures ⇒ undefined, never a crash', () => {
    expect(parseStarterAllowance({ starterAllowance: block({ totalMicros: 0 }) })).toBeUndefined();
    expect(parseStarterAllowance({ starterAllowance: block({ usedMicros: '1' }) })).toBeUndefined();
    expect(
      parseStarterAllowance({ starterAllowance: block({ remainingMicros: Number.NaN }) })
    ).toBeUndefined();
  });

  it('reads microsPerMessage from the block or from the ai block', () => {
    expect(
      parseStarterAllowance({ starterAllowance: block({ microsPerMessage: 4_000 }) })
    ).toMatchObject({ microsPerMessage: 4_000 });
    expect(
      parseStarterAllowance({ microsPerMessage: 4_000, starterAllowance: block() })
    ).toMatchObject({ microsPerMessage: 4_000 });
    expect(parseStarterAllowance({ starterAllowance: block() })).not.toHaveProperty(
      'microsPerMessage'
    );
  });

  it('a missing `exhausted` is derived from what is left', () => {
    const { exhausted: _drop, ...noFlag } = block({ remainingMicros: 0 });
    expect(parseStarterAllowance({ starterAllowance: noFlag })?.exhausted).toBe(true);
  });
});

const allowance = (over: Partial<StarterAllowance> = {}): StarterAllowance => ({
  totalMicros: 400_000,
  usedMicros: 148_000,
  remainingMicros: 252_000,
  exhausted: false,
  microsPerMessage: 4_000,
  ...over,
});

describe('starterAllowanceLine', () => {
  it('agent: messages only, no money', () => {
    const line = starterAllowanceLine(allowance(), false);
    expect(line).toBe('AI starter allowance: about 63 of 100 messages left.');
    expect(line).not.toMatch(/\$/);
  });

  it('admin: the same sentence plus the money', () => {
    expect(starterAllowanceLine(allowance(), true)).toBe(
      'AI starter allowance: about 63 of 100 messages left (≈ $0.25 of $0.40 left).'
    );
  });

  it('no microsPerMessage: a percentage', () => {
    expect(starterAllowanceLine(allowance({ microsPerMessage: undefined }), false)).toBe(
      'AI starter allowance: about 63% left.'
    );
  });

  it('used up', () => {
    expect(
      starterAllowanceLine(allowance({ remainingMicros: 0, usedMicros: 400_000, exhausted: true }), false)
    ).toBe('AI starter allowance: used up.');
  });
});

describe('isFreeAiAllowanceUsedError', () => {
  it('matches the refusal code only', () => {
    expect(isFreeAiAllowanceUsedError({ response: { data: { code: FREE_AI_ALLOWANCE_USED } } })).toBe(
      true
    );
    expect(isFreeAiAllowanceUsedError({ response: { data: { code: 'AI_NOT_CONFIGURED' } } })).toBe(
      false
    );
    expect(isFreeAiAllowanceUsedError(new Error('x'))).toBe(false);
  });
});
