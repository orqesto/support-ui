/**
 * The billing-date line on the Subscription card, or null when there is no date worth stating.
 *
 * Why this exists (prod, 2026-09-28): every workspace on the €0 admin plan showed "Next Billing
 * Date" with a `current_period_end` that had passed months ago — 6 of 7 workspaces — on the same
 * card as "your allowance resets on <a real future date>". The backend never advances the period of
 * a plan it does not bill, so for those plans the stored date is not a billing date at all.
 *
 * Only reached where billing is enabled: `BillingRoute` (App.tsx) keeps self-hosted deployments off
 * this page entirely, so this changes nothing on a self-hosted box.
 */
export type BillingDateLine = { label: string; date: Date };

export const billingDateLine = (
  plan: { price: number },
  subscription: { status: string; currentPeriodEnd?: string | null },
  now: Date = new Date()
): BillingDateLine | null => {
  const end = subscription.currentPeriodEnd ? new Date(subscription.currentPeriodEnd) : null;
  const validEnd = end && !Number.isNaN(end.getTime()) ? end : null;

  // A cancelled or expired subscription still has a real end to its period — say when.
  if (subscription.status === 'cancelled' || subscription.status === 'expired') {
    if (!validEnd) return null;
    return {
      label: validEnd.getTime() < now.getTime() ? 'Period Ended' : 'Period Ends',
      date: validEnd,
    };
  }
  // Nothing is ever billed on a free plan, so there is no "next billing date" to show.
  if (plan.price <= 0) return null;
  if (!validEnd) return null;
  // A date in the past is not the NEXT anything — and on an ACTIVE subscription it does not mean the
  // plan ended either (a renewal the provider has not reported yet). Claim nothing.
  return validEnd.getTime() < now.getTime() ? null : { label: 'Next Billing Date', date: validEnd };
};
