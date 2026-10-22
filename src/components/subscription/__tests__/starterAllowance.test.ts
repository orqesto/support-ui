/**
 * Free AI starter allowance (owner decision 2026-10-22): the one module that knows the wire shape.
 * Parsing tolerates an older backend (no field) and a malformed one; the line reads messages for
 * agents and adds money for admins; without microsPerMessage it reads a percentage.
 */
import { describe, expect, it } from 'vitest';
import {
  AI_REFUSAL_CODES,
  aiRefusalText,
  FREE_AI_ALLOWANCE_USED,
  isStarterPaused,
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
    // Not on Free: the backend sends null.
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

  it('the response carries no microsPerMessage: one message is a hundredth of the allowance', () => {
    expect(parseStarterAllowance({ starterAllowance: block() })?.microsPerMessage).toBe(4_000);
  });

  it('a microsPerMessage a later backend sends wins (block or ai block)', () => {
    // 5,000, not the derived 4,000 (400,000 / 100): the test fails if the sent value is ignored.
    expect(
      parseStarterAllowance({ starterAllowance: block({ microsPerMessage: 5_000 }) })
    ).toMatchObject({ microsPerMessage: 5_000 });
    expect(
      parseStarterAllowance({ microsPerMessage: 5_000, starterAllowance: block() })
    ).toMatchObject({ microsPerMessage: 5_000 });
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

  it('under half a message left: "less than 1", never "about 0"', () => {
    expect(
      starterAllowanceLine(allowance({ remainingMicros: 1_000, usedMicros: 399_000 }), false)
    ).toBe('AI starter allowance: less than 1 of 100 messages left.');
  });

  it('used up', () => {
    expect(
      starterAllowanceLine(
        allowance({ remainingMicros: 0, usedMicros: 400_000, exhausted: true }),
        false
      )
    ).toBe('AI starter allowance: used up.');
  });
});

describe('isFreeAiAllowanceUsedError', () => {
  it('matches the refusal code only', () => {
    expect(
      isFreeAiAllowanceUsedError({ response: { data: { code: FREE_AI_ALLOWANCE_USED } } })
    ).toBe(true);
    expect(isFreeAiAllowanceUsedError({ response: { data: { code: 'AI_NOT_CONFIGURED' } } })).toBe(
      false
    );
    expect(isFreeAiAllowanceUsedError(new Error('x'))).toBe(false);
  });
});

describe('isStarterPaused', () => {
  it('only a pause with reason free_allowance_used; exhausted alone (own-key Free) is not', () => {
    expect(isStarterPaused({ paused: true, reason: 'free_allowance_used' })).toBe(true);
    expect(isStarterPaused({ paused: false, reason: null })).toBe(false);
    expect(isStarterPaused({ paused: true, reason: 'budget_used' })).toBe(false);
    expect(isStarterPaused(undefined)).toBe(false);
  });
});

describe('AI_REFUSAL_CODES', () => {
  it('carries every backend refusal code and the old translation code (one release)', () => {
    expect([...AI_REFUSAL_CODES].sort()).toEqual([
      'AI_BUDGET_PAUSED',
      'AI_NOT_IN_PLAN',
      'AI_PAUSED',
      'AI_USAGE_LIMIT_EXCEEDED',
      'FREE_AI_ALLOWANCE_USED',
    ]);
  });
});

describe('aiRefusalText', () => {
  const refused = (code: string, error = 'Server sentence.') => ({ data: { code, error } });

  it('not an AI refusal (no code, other code) ⇒ undefined: the caller keeps its own text', () => {
    expect(aiRefusalText({ data: { error: 'x' } }, false)).toBeUndefined();
    expect(aiRefusalText(refused('AI_DRAFTS_OFF'), false)).toBeUndefined();
    expect(aiRefusalText(new Error('x'), true)).toBeUndefined();
  });

  it('FREE_AI_ALLOWANCE_USED: agent "ask your admin"; admin the server sentence', () => {
    expect(aiRefusalText(refused('FREE_AI_ALLOWANCE_USED'), false)).toBe(
      'Your free AI allowance is used — ask your admin to add your own AI key to keep AI running.'
    );
    expect(aiRefusalText(refused('FREE_AI_ALLOWANCE_USED'), true)).toBe('Server sentence.');
  });

  it('AI_NOT_IN_PLAN: an agent is asked to go to an admin', () => {
    expect(aiRefusalText(refused('AI_NOT_IN_PLAN'), false)).toMatch(/Ask your admin/);
  });

  it.each(['AI_BUDGET_PAUSED', 'AI_PAUSED', 'AI_USAGE_LIMIT_EXCEEDED'])(
    '%s: an agent never reads buying or upgrade wording',
    (code) => {
      const text = aiRefusalText(
        refused(code, 'Used up. Buying more messages or upgrading adds to it.'),
        false
      );
      expect(text).toMatch(/Ask your admin/);
      expect(text).not.toMatch(/Buying|upgrad/i);
    }
  );
});
