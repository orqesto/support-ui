import { logger } from '@/lib/logger';
import { aiService } from '@/services/ai.service';
import {
  subscriptionService,
  type AiPauseReason,
  type AiStatus,
} from '@/services/subscription.service';

// Moved to `@/services/subscription.service` (modularity task F2); re-exported for existing importers.
export type { AiPauseReason, AiStatus };

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
export const loadOwnKey = async (): Promise<boolean> => (await loadAiKeyState()).ownKey;

/**
 * Which AI the workspace runs on. `ownKey`: as loadOwnKey. `ourAiOff`: platform AI is off (own-key
 * mode) — with no own provider enabled, no AI runs at all. Unknown (call fails, old backend) =
 * both false, so nothing is claimed.
 */
export const loadAiKeyState = async (): Promise<{ ownKey: boolean; ourAiOff: boolean }> => {
  try {
    const providers = await aiService.getProviders();
    const ourAiOff = providers.data?.platform?.active === false;
    return { ownKey: ourAiOff && (providers.data?.enabled?.length ?? 0) > 0, ourAiOff };
  } catch (error) {
    logger.warn('Could not read the AI provider settings:', error);
    return { ownKey: false, ourAiOff: false };
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
