import { describe, expect, it } from 'vitest';
import {
  fmtMoneyTokens,
  microsPerToken,
  microsToTokens,
  parseTokens,
  tokensToMicros,
} from '../budget.rules';

describe('budget amounts in tokens', () => {
  it('reads tokens as people type them', () => {
    expect(parseTokens('50M')).toBe(50_000_000);
    expect(parseTokens('2.5m')).toBe(2_500_000);
    expect(parseTokens('500K')).toBe(500_000);
    expect(parseTokens('1,200,000')).toBe(1_200_000);
    expect(parseTokens('')).toBeNull();
    // CONTROLS: not a positive number of tokens.
    expect(parseTokens('lots')).toBeNaN();
    expect(parseTokens('0')).toBeNaN();
    expect(parseTokens('-5M')).toBeNaN();
  });

  it('prices tokens at what this budget paid per token this period', () => {
    // $10 for 1M tokens: 10 micros a token.
    const rate = microsPerToken(10_000_000, 1_000_000);
    expect(rate).toBe(10);
    expect(tokensToMicros(50_000_000, rate!)).toBe(500_000_000);
    expect(microsToTokens(500_000_000, rate!)).toBe(50_000_000);
    expect(fmtMoneyTokens(40_000_000, rate)).toBe('≈ $40.00 (4.0M tokens)');
  });

  it('has no price without usage: just the money', () => {
    expect(microsPerToken(0, 0)).toBeNull();
    expect(microsPerToken(5_000_000, 0)).toBeNull();
    expect(microsPerToken(5_000_000, undefined)).toBeNull();
    expect(fmtMoneyTokens(40_000_000, null)).toBe('≈ $40.00');
  });
});
