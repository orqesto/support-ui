/**
 * Plan prices as a customer reads them.
 *
 * Shared rather than redefined per screen: the wizard and the Billing page both
 * quote the same amount, and two copies drift — one showing "€500" while the
 * other shows "€500.00" is the sort of mismatch that makes someone hesitate on
 * a payment screen.
 *
 * Amounts are stored in minor units (cents), as Stripe holds them.
 */
export const formatMoney = (amountInMinorUnits: number, currency: string): string =>
  new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: 0,
  }).format(amountInMinorUnits / 100);

/**
 * How we say a quoted price does not yet include tax.
 *
 * ⚠️ Deliberately NOT a rate. Stripe Tax computes VAT from the CUSTOMER's location at checkout —
 * 21% in Latvia, 19% in Germany, 23% in Ireland, 0% for a VAT-registered business buying
 * cross-border under reverse charge, and none at all outside the EU. Printing a single
 * percentage next to a price would be wrong for most customers and is a tax statement rather
 * than copy, so the wording states only what is true everywhere: the number shown is net.
 *
 * The rate itself is shown once, by Stripe, on the checkout breakdown — the one place that knows
 * where the customer actually is.
 */
export const VAT_NOTE = 'excl. VAT';

/**
 * A plan price as quoted BEFORE tax.
 *
 * Every price we display is net, while checkout adds VAT on top — so €1,000 became €1,210 with
 * nothing on our side having said so. Anyone reading a plan card was given a number they would
 * not be charged.
 */
export const formatMoneyExVat = (amountInMinorUnits: number, currency: string): string =>
  `${formatMoney(amountInMinorUnits, currency)} ${VAT_NOTE}`;

/** Micro-dollars in one dollar. */
export const MICROS_PER_USD = 1_000_000;

/**
 * Money from micro-dollars: "≈ $12.40" (2 decimals). A positive amount under one cent is
 * "<$0.01" (under half a cent), never "≈ $0.00" (it was spent). Thousands are grouped: "≈ $1,234.50".
 * Kept by design (M7): always en-US, whatever the browser locale — the amount is US dollars and a
 * "$1.234,50" would misread. The server's texts drop "≈"; this adds it.
 */
export const fmtMoney = (micros: number): string => {
  // Same rule as the backend: under half a cent (and above nothing) is "<$0.01"; a tiny negative
  // is "$0.00", never "-$0.00".
  if (micros > 0 && micros < 5_000) return '<$0.01';
  const dollars = micros / MICROS_PER_USD;
  const text = Math.abs(dollars).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const negative = dollars < 0 && text !== '0.00';
  return `≈ ${negative ? '-' : ''}$${text}`;
};
