import { logger } from '@/lib/logger';
import { aiService } from '@/services/ai.service';
import { subscriptionService } from '@/services/subscription.service';
import type { StarterAllowance } from './starterAllowance';

/** Why the API says AI is stopped (`/api/usage/current` → `ai.reason`). */
export type AiPauseReason =
  | 'not_in_plan'
  | 'server_ceiling'
  | 'budget_used'
  | 'bulk_share_used'
  | 'workspace_bulk_limit'
  /** Free on our key, its one-time starter allowance used up (starterAllowance.ts). */
  | 'free_allowance_used';

/** `ai` block of `GET /api/usage/current`. Optional on the wire: an older backend sends none. */
export type AiStatus = {
  currency: 'USD';
  /** The money budgets are switched on; false ⇒ the figures are null. */
  active: boolean;
  usedMicros: number | null;
  budgetMicros: number | null;
  /** Live AI is stopped. */
  paused: boolean;
  /** Only history import / KB building are stopped. */
  bulkPaused: boolean;
  reason: AiPauseReason | null;
  /** The reason as a sentence, from the API. */
  message: string | null;
  resetsAt: string | null;
  /**
   * Free only (also on its own key): the one-time starter allowance. Parsed by
   * `parseStarterAllowance` in the service (null, absent or malformed ⇒ undefined).
   */
  starterAllowance?: StarterAllowance;
};

/** The `ai` block of /api/usage/current; undefined when the call fails or the backend sends none. */
export const loadAiStatus = async (): Promise<AiStatus | undefined> => {
  try {
    return (await subscriptionService.getUsage())?.ai;
  } catch (error) {
    logger.warn('Could not read the AI status:', error);
    return undefined;
  }
};

/**
 * Own key = platform AI is off AND at least one provider of the workspace's own is enabled
 * (platform off with no provider is "no AI", not "your own key"). Unknown (call fails, old
 * backend) = false.
 */
export const loadOwnKey = async (): Promise<boolean> => {
  try {
    const providers = await aiService.getProviders();
    return providers.data?.platform?.active === false && (providers.data?.enabled?.length ?? 0) > 0;
  } catch (error) {
    logger.warn('Could not read the AI provider settings:', error);
    return false;
  }
};

/**
 * What a customer reads for each reason: fixed sentences, never money (the API's own text names
 * dollars for budget_used; that is for admins). Unknown reasons get the generic sentence. A viewer
 * who cannot open the Subscription page (`canOpenSubscription` false) cannot buy or upgrade, so the
 * sentence asks an admin instead of offering it.
 */
export const customerPauseText = (reason: string | null, canOpenSubscription = true): string => {
  switch (reason) {
    case 'not_in_plan':
      return canOpenSubscription
        ? 'AI is not included in your plan. Upgrade, or connect your own AI key.'
        : 'AI is not included in your plan. Ask an admin to upgrade or connect your own AI key.';
    case 'budget_used':
      return canOpenSubscription
        ? "This period's AI messages are used up: AI drafts, auto-replies and analysis pause until the period resets. Buying more messages or upgrading adds to it."
        : "This period's AI messages are used up: AI drafts, auto-replies and analysis pause until the period resets. Ask an admin to buy more messages or upgrade.";
    case 'free_allowance_used':
      return canOpenSubscription
        ? 'Your free AI allowance is used — add your own AI key to keep AI running.'
        : 'Your free AI allowance is used — ask your admin to add your own AI key to keep AI running.';
    case 'server_ceiling':
      return "This server's AI limit for the month is reached: AI is paused until it resets.";
    default:
      return 'AI is paused for now.';
  }
};
