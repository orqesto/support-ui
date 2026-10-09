import { describe, expect, it } from 'vitest';
import { lookupTabLabel, LOOKUPS_TAB_FALLBACK } from '../lookupsTab';

const opt = (category?: unknown) => (category === undefined ? {} : { category });

describe('lookupTabLabel — the tab names what every lookup here returns, or says Lookups', () => {
  it.each([
    ['order', 'Orders'],
    ['shipment', 'Shipments'],
    ['invoice', 'Invoices'],
    ['account', 'Accounts'],
  ])('all %s ⇒ %s', (category, label) => {
    expect(lookupTabLabel([opt(category), opt(category)])).toBe(label);
  });

  it.each([
    ['mixed categories', [opt('order'), opt('shipment')]],
    ['one without a category', [opt('order'), opt(null)]],
    ['null first, then order', [opt(null), opt('order')]],
    ['a word this build does not know', [opt('booking')]],
    ['an older backend without the field', [opt(), opt()]],
    ['no lookups', []],
  ])('%s ⇒ Lookups', (_label, options) => {
    expect(lookupTabLabel(options)).toBe(LOOKUPS_TAB_FALLBACK);
  });

  it('options not loaded yet ⇒ Lookups', () => {
    expect(lookupTabLabel(null)).toBe('Lookups');
  });
});
