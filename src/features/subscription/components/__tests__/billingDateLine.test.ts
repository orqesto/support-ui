import { describe, it, expect } from 'vitest';
import { billingDateLine } from '../billingDateLine';

const NOW = new Date('2026-09-28T12:00:00Z');
const PAST = '2026-08-25T00:00:00Z';
const FUTURE = '2026-10-25T00:00:00Z';

describe('billingDateLine', () => {
  it('states no billing date on a free plan, whatever the stored period says (prod: all 6 were in the past)', () => {
    expect(
      billingDateLine({ price: 0 }, { status: 'active', currentPeriodEnd: PAST }, NOW)
    ).toBeNull();
    expect(
      billingDateLine({ price: 0 }, { status: 'active', currentPeriodEnd: FUTURE }, NOW)
    ).toBeNull();
  });

  it('keeps "Next Billing Date" for a paid plan whose period ends in the future', () => {
    expect(
      billingDateLine({ price: 5000 }, { status: 'active', currentPeriodEnd: FUTURE }, NOW)
    ).toEqual({
      label: 'Next Billing Date',
      date: new Date(FUTURE),
    });
  });

  it('claims nothing for an ACTIVE paid plan whose date has passed (not "next", not "ended")', () => {
    expect(
      billingDateLine({ price: 5000 }, { status: 'active', currentPeriodEnd: PAST }, NOW)
    ).toBeNull();
  });

  it('still says when a cancelled or expired period ends, free or paid', () => {
    for (const status of ['cancelled', 'expired']) {
      expect(billingDateLine({ price: 0 }, { status, currentPeriodEnd: FUTURE }, NOW)?.label).toBe(
        'Period Ends'
      );
      // …and in the past tense once that end has passed.
      expect(billingDateLine({ price: 5000 }, { status, currentPeriodEnd: PAST }, NOW)?.label).toBe(
        'Period Ended'
      );
    }
  });

  it('states nothing when there is no usable date', () => {
    expect(
      billingDateLine({ price: 5000 }, { status: 'active', currentPeriodEnd: null }, NOW)
    ).toBeNull();
    expect(
      billingDateLine({ price: 5000 }, { status: 'active', currentPeriodEnd: 'not a date' }, NOW)
    ).toBeNull();
  });
});
