import type { UsagePeriod } from '@/services/subscription.service';
import type { AiStatus } from './aiStatus';
import { isStarterPaused, type AiUnavailableReason } from './starterAllowance';

export const TRIAL_SENTENCE = '14-day free trial on any paid plan, up to 1,000 messages, no card';

/** "<limit> messages this period, AI included; <used> used; resets 5 Nov." (figures from the plan) */
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
 * Where a workspace's AI runs, when it is not part of the messages:
 * - `own_key`: the workspace's own AI key (and Free on an older backend: Free's own-key model);
 * - `starter`: Free on our key, on its one-time starter allowance;
 * - `not_in_plan`: a paid plan without AI and no own key — NOT "runs on your own key";
 * - `ai_off`: own-key mode with no provider enabled — no AI runs (not "starter", not "included");
 * - `not_verified`: no admin has verified their email, so our AI is held back (any plan, decision 2).
 */
export type AiSource = 'included' | 'own_key' | 'starter' | 'not_in_plan' | 'ai_off' | 'not_verified';

const aiSourceSentence = (source: AiSource, limit: number): string => {
  const covers = `your plan covers ${limit.toLocaleString()} messages.`;
  switch (source) {
    case 'included':
      return '';
    case 'own_key':
      return ` AI runs on your own key; ${covers}`;
    case 'starter':
      return ` AI runs on a starter allowance on us until you add your own AI key; ${covers}`;
    case 'not_in_plan':
      return ` AI is not included in your plan: upgrade, or connect your own AI key; ${covers}`;
    case 'ai_off':
      return ` AI is off: add your own AI key to run it; ${covers}`;
    case 'not_verified':
      return ` AI is off until a workspace admin verifies their email address (or adds an AI key); ${covers}`;
  }
};

/** The workspace's AI source from what the Subscription page knows. */
export const aiSourceOf = ({
  planName,
  ownKey,
  notInPlan,
  hasStarterAllowance,
  ourAiOff = false,
  starterPaused = false,
  unavailableReason,
  starterOnOurKey,
}: {
  planName: string;
  ownKey: boolean;
  notInPlan: boolean;
  hasStarterAllowance: boolean;
  /** Platform AI is switched off for the workspace (own-key mode); unknown = false. */
  ourAiOff?: boolean;
  /** The allowance was in use and is now used up (paused, reason free_allowance_used). */
  starterPaused?: boolean;
  /** `ai.unavailableReason`: the workspace has no AI at all, and why. Absent on an older backend. */
  unavailableReason?: AiUnavailableReason;
  /** `ai.starterOnOurKey`: the backend says whether the allowance is drawn on now. Wins when sent. */
  starterOnOurKey?: boolean;
}): AiSource => {
  if (ownKey) return 'own_key';
  // The API says no AI runs: never "AI included" (audit B3), on Free and paid plans alike.
  if (unavailableReason === 'admin_not_verified') return 'not_verified';
  if (unavailableReason === 'own_key_required') return 'ai_off';
  if (hasStarterAllowance && starterOnOurKey !== undefined) {
    return starterOnOurKey || starterPaused ? 'starter' : 'ai_off';
  }
  // The allowance runs only on our AI: in own-key mode with no provider, no AI runs at all.
  if (hasStarterAllowance && (!ourAiOff || starterPaused)) return 'starter';
  if (hasStarterAllowance) return 'ai_off';
  if (planName !== 'free' && notInPlan) return 'not_in_plan';
  // Our AI is off and no own provider is enabled (ownKey false): no AI runs, on any plan — e.g. a
  // paid workspace left on "own key" with no key after an upgrade (audit A-F8).
  if (ourAiOff) return 'ai_off';
  return planName !== 'free' ? 'included' : 'own_key';
};

/**
 * The one AI-source rule for every page that says where AI runs (Subscription, Usage Stats — audit
 * A-F5): the plan, the `ai` block of /api/usage/current and the provider settings.
 */
export const aiSourceFrom = (
  planName: string,
  ai: AiStatus | undefined,
  keyState: { ownKey: boolean; ourAiOff: boolean }
): AiSource =>
  aiSourceOf({
    planName,
    ownKey: keyState.ownKey,
    notInPlan: ai?.reason === 'not_in_plan',
    hasStarterAllowance: Boolean(ai?.starterAllowance),
    ourAiOff: keyState.ourAiOff,
    starterPaused: isStarterPaused(ai),
    unavailableReason: ai?.unavailableReason,
    starterOnOurKey: ai?.starterOnOurKey,
  });

/** The one line under the usage heading. AI is "included" only where the plan carries managed AI. */
export const MessagesSummary = ({
  limit,
  used,
  period,
  aiSource,
}: {
  limit: number;
  used: number;
  period?: UsagePeriod;
  aiSource: AiSource;
}) => (
  <p data-testid="messages-summary" className="mb-4 text-sm text-foreground/80">
    {messagesSummary(limit, used, period, aiSource === 'included')}
    {aiSourceSentence(aiSource, limit)}
  </p>
);
