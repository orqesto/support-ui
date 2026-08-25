/**
 * Turns a plan row into the few lines that make a wizard card a real choice.
 *
 * Derived from `plan.limits` / `plan.features` rather than a copy table in the
 * frontend: the platform console can change a plan's caps, and hardcoded card
 * copy would keep advertising the old ones with nothing to catch it. The only
 * hardcoded thing here is the human LABEL for a feature flag, which does not
 * go stale when a number changes.
 *
 * Everything is defensive about missing fields — an older backend that does not
 * send `limits`/`features` yields an empty list and the card falls back to name
 * and price, rather than white-screening (see FE-app/CLAUDE.md on version skew).
 */

import type { PlanFeatureFlags, PlanLimitValues, SubscriptionPlan } from '@/services/subscription.service';

/**
 * Plans express "no ceiling" as this exact number rather than null, so a literal
 * 999999 must never be printed at a customer.
 *
 * Matched EXACTLY, not as a `>=` threshold. Enterprise Cloud's storage cap is a
 * real 1,048,576 MB (1 TB) — larger than the sentinel — so treating it as a
 * floor renders the most expensive tier's headline storage as "Unlimited",
 * which is both wrong and worse than the truth.
 */
const UNLIMITED_SENTINEL = 999999;

const isUnlimited = (value: number): boolean => value === UNLIMITED_SENTINEL;

const formatCount = (value: number, singular: string, plural: string): string =>
  isUnlimited(value)
    ? `Unlimited ${plural}`
    : `${value.toLocaleString()} ${value === 1 ? singular : plural}`;

/** Storage is stored in MB; nobody wants to read "1048576 MB". */
export const formatStorage = (megabytes: number): string => {
  if (isUnlimited(megabytes)) return 'Unlimited storage';
  if (megabytes >= 1024 * 1024) return `${Math.round(megabytes / (1024 * 1024))} TB`;
  if (megabytes >= 1024) return `${Math.round(megabytes / 1024)} GB`;
  return `${megabytes} MB`;
};

/**
 * The caps a buyer actually compares tiers on, in reading order. Deliberately
 * not every limit — `maxOrganizations` is 1 on every sellable plan, and
 * `maxAICallsPerMonth` is a derived headroom number that only confuses.
 */
export const planLimitLines = (plan: SubscriptionPlan): string[] => {
  const limits: Partial<PlanLimitValues> = plan.limits ?? {};
  const lines: string[] = [];

  if (typeof limits.maxUsers === 'number') {
    lines.push(formatCount(limits.maxUsers, 'agent', 'agents'));
  }
  if (typeof limits.maxMessagesPerMonth === 'number') {
    lines.push(
      isUnlimited(limits.maxMessagesPerMonth)
        ? 'Unlimited messages'
        : `${limits.maxMessagesPerMonth.toLocaleString()} messages/mo`
    );
  }
  if (typeof limits.maxIntegrations === 'number') {
    lines.push(formatCount(limits.maxIntegrations, 'channel', 'channels'));
  }
  if (typeof limits.maxStorageMb === 'number') {
    lines.push(formatStorage(limits.maxStorageMb));
  }

  return lines;
};

/**
 * Feature flags worth naming on a card, with the wording a customer recognises.
 *
 * A flag absent from this map is never shown — several are either on every tier
 * (so they differentiate nothing) or named for their implementation rather than
 * for what they do, and guessing at customer-facing wording for those is how
 * marketing copy ends up invented in a component.
 */
const FEATURE_LABELS: Partial<Record<keyof PlanFeatureFlags, string>> = {
  aiAutoReply: 'AI auto-reply',
  leadQualification: 'lead qualification',
  advancedAnalytics: 'advanced analytics',
  jiraSync: 'Jira sync',
  sso: 'SSO',
  scim: 'SCIM provisioning',
  auditLogs: 'audit logs',
  customWorkflows: 'custom workflows',
  dedicatedOnboarding: 'dedicated onboarding',
};

/** How many additions fit on a card before it stops being scannable. */
const MAX_ADDITIONS_SHOWN = 3;

/**
 * What this tier adds over the one below it.
 *
 * Framed as a DELTA because that is the question being asked at this point in
 * the wizard — not "what is Enterprise Cloud", but "what does the extra €500
 * buy". The cheapest tier has nothing below it, so it gets no line.
 */
export const planFeatureAdditions = (
  plan: SubscriptionPlan,
  previousPlan: SubscriptionPlan | undefined
): string[] => {
  if (!previousPlan) return [];

  const features: Partial<PlanFeatureFlags> = plan.features ?? {};
  const previousFeatures: Partial<PlanFeatureFlags> = previousPlan.features ?? {};

  return (Object.keys(FEATURE_LABELS) as (keyof PlanFeatureFlags)[])
    .filter((flag) => features[flag] === true && previousFeatures[flag] !== true)
    .map((flag) => FEATURE_LABELS[flag] as string);
};

/**
 * The additions rendered as one line, truncated so a tier that adds five things
 * does not make its card twice the height of its neighbours.
 */
export const formatFeatureAdditions = (additions: string[]): string | null => {
  if (additions.length === 0) return null;
  const shown = additions.slice(0, MAX_ADDITIONS_SHOWN);
  const remaining = additions.length - shown.length;
  return remaining > 0 ? `Adds ${shown.join(', ')} +${remaining} more` : `Adds ${shown.join(', ')}`;
};
