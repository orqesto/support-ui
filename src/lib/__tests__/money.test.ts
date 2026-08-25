/**
 * Every price we display is NET, while Stripe adds VAT at checkout — €1,000 became €1,210 with
 * nothing on our side saying so, which means anyone reading a plan card was quoted a number they
 * would not be charged.
 *
 * The fix is a label, deliberately NOT a rate. Stripe Tax resolves VAT from the customer's
 * location (21% LV, 19% DE, 23% IE, 0% for cross-border B2B reverse charge, none outside the EU),
 * so a hardcoded percentage next to a price would be wrong for most customers — and it is a tax
 * statement, not copy. These tests pin that distinction so nobody "helpfully" adds the number.
 */
import { describe, expect, it } from 'vitest';
import { VAT_NOTE, formatMoney, formatMoneyExVat } from '@/lib/money';

describe('price formatting', () => {
  it('formats minor units as the customer reads them', () => {
    expect(formatMoney(100000, 'EUR')).toContain('1,000');
    expect(formatMoney(60500, 'EUR')).toContain('605');
  });

  it('marks a quoted price as net, so the checkout total is never a surprise', () => {
    const quoted = formatMoneyExVat(100000, 'EUR');
    expect(quoted).toContain(formatMoney(100000, 'EUR'));
    expect(quoted).toContain(VAT_NOTE);
  });

  it('states NO rate — the percentage depends on where the customer is', () => {
    // 21% is Latvia. A German customer pays 19%, an Irish one 23%, a VAT-registered business
    // buying cross-border pays 0% under reverse charge. Only Stripe, at checkout, knows which.
    expect(VAT_NOTE).not.toMatch(/\d/);
    expect(formatMoneyExVat(100000, 'EUR')).not.toMatch(/21\s*%/);
  });

  it('keeps the currency of the plan rather than assuming euro', () => {
    expect(formatMoneyExVat(100000, 'USD')).toMatch(/\$|USD/);
    expect(formatMoneyExVat(100000, 'USD')).toContain(VAT_NOTE);
  });
});
