import type { UsagePeriod } from '@/services/subscription.service';

/** "5 October 2026" — the reset is a day, not an instant, to the person reading it. */
export const formatResetDay = (iso: string): string =>
  new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });

/**
 * One sentence naming the period the message allowance runs over. The allowance follows
 * the billing cycle, not the calendar month (owner decision 2026-09-04), so the copy
 * says which clock applies and when it resets rather than assuming "this month".
 */
export const describeUsagePeriod = (period: UsagePeriod): string =>
  period.source === 'billing'
    ? `Your billing period — the message allowance resets on ${formatResetDay(period.end)}.`
    : `Calendar month — the message allowance resets on ${formatResetDay(period.end)}.`;
