import { describe, expect, it } from 'vitest';
import { splitMinutes, toMinutes } from '../durationUnits';

describe('duration units (SLA targets are stored in minutes)', () => {
  it('shows a value in the largest unit that divides it evenly', () => {
    expect(splitMinutes(90)).toEqual({ amount: 90, unit: 'minute' });
    expect(splitMinutes(120)).toEqual({ amount: 2, unit: 'hour' });
    expect(splitMinutes(1440)).toEqual({ amount: 1, unit: 'day' });
    expect(splitMinutes(2880)).toEqual({ amount: 2, unit: 'day' });
    expect(splitMinutes(1500)).toEqual({ amount: 25, unit: 'hour' });
  });

  it('converts back to minutes', () => {
    expect(toMinutes(3, 'day')).toBe(4320);
    expect(toMinutes(4, 'hour')).toBe(240);
    expect(toMinutes(15, 'minute')).toBe(15);
  });
});
