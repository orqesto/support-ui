import { describe, it, expect } from 'vitest';
import { finiteNumber } from '../finiteNumber';

describe('finiteNumber', () => {
  it('numbers and numeric strings', () => {
    expect(finiteNumber(90)).toBe(90);
    expect(finiteNumber(0)).toBe(0);
    expect(finiteNumber('1.5')).toBe(1.5);
  });

  it('CONTROL: what is not a number is null (Number() would read null and "" as 0)', () => {
    for (const value of [null, undefined, '', '  ', 'abc', true, NaN, Infinity, {}])
      expect(finiteNumber(value)).toBeNull();
  });
});
