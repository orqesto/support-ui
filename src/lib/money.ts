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
