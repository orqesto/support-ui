import { logger } from '@/lib/logger';
import { aiService } from '@/services/ai.service';
import { subscriptionService } from '@/services/subscription.service';

/** Why the API says AI is stopped (`/api/usage/current` → `ai.reason`). */
export type AiPauseReason =
  | 'not_in_plan'
  | 'server_ceiling'
  | 'budget_used'
  | 'bulk_share_used'
  | 'workspace_bulk_limit';

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
 * dollars for budget_used; that is for admins). Unknown reasons get the generic sentence.
 */
export const customerPauseText = (reason: string | null): string => {
  switch (reason) {
    case 'not_in_plan':
      return 'AI is not included in your plan. Upgrade, or connect your own AI key.';
    case 'budget_used':
      return "This period's AI messages are used up: AI drafts, auto-replies and analysis pause until the period resets. Buying more messages or upgrading adds to it.";
    case 'server_ceiling':
      return "This server's AI limit for the month is reached: AI is paused until it resets.";
    default:
      return 'AI is paused for now.';
  }
};
