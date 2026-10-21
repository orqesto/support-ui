import type { UsagePeriod } from '@/services/subscription.service';

export const TRIAL_SENTENCE = '14-day free trial on any paid plan, up to 1,000 messages, no card';

/** "4,000 messages this period, AI included; 1,240 used; resets 5 Nov." */
export const messagesSummary = (
  limit: number,
  used: number,
  period?: UsagePeriod,
  aiIncluded = true
): string => {
  const resets = period
    ? `; resets ${new Date(period.end).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`
    : '';
  return `${limit.toLocaleString()} messages this period${aiIncluded ? ', AI included' : ''}; ${used.toLocaleString()} used${resets}.`;
};

/**
 * The one line under the usage heading. `aiIncluded` is true only where the plan carries managed
 * AI; Free and own-key workspaces get the own-key sentence instead.
 */
export const MessagesSummary = ({
  limit,
  used,
  period,
  aiIncluded,
}: {
  limit: number;
  used: number;
  period?: UsagePeriod;
  aiIncluded: boolean;
}) => (
  <p data-testid="messages-summary" className="mb-4 text-sm text-foreground/80">
    {messagesSummary(limit, used, period, aiIncluded)}
    {!aiIncluded && ` AI runs on your own key; your plan covers ${limit.toLocaleString()} messages.`}
  </p>
);
