/**
 * `requireSavedRow` is the one check that a 2xx save really returned the row it saved. Anything
 * without a numeric id proves nothing was written, so it must throw — a row-shaped object too.
 */
import { describe, it, expect } from 'vitest';
import { requireSavedRow, SaveNotConfirmedError } from '@/lib/errorMessages';

describe('requireSavedRow', () => {
  it('returns a row that carries a numeric id', () => {
    const row = { id: 7, name: 'rule_a' };
    expect(requireSavedRow(row)).toBe(row);
  });

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['an empty object', {}],
    ['a failure envelope', { success: false }],
    ['a row without an id', { name: 'rule_a', active: true }],
    ['a row with a string id', { id: '7', name: 'rule_a' }],
    ['a row with a null id', { id: null, name: 'rule_a' }],
    ['a string', 'saved'],
  ])('throws SaveNotConfirmedError for %s', (_label, value) => {
    expect(() => requireSavedRow(value as { id: number } | null | undefined)).toThrow(
      SaveNotConfirmedError
    );
  });
});
