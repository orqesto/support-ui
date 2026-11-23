import { useQuery } from '@tanstack/react-query';
import { aiIsConfigured } from '@/hooks/useAiConfigured';
import { aiService } from '@/services/ai.service';

/**
 * Can the AI that checks every keyword rule reply run for this workspace?
 *
 *  - `usable`    it can.
 *  - `none`      no provider is set up: every rule reply is held.
 *  - `unusable`  a provider is switched on, but its key or settings cannot be read: every rule
 *                reply is held just the same.
 *  - `unknown`   not known — still loading, the request failed, or the backend could not tell.
 *                Nothing is claimed on an unknown.
 *
 * The backend's own answer (`usable`) is what the check itself resolves, so the two cannot
 * disagree. A backend that does not send it yet is read the old way: a provider row, or platform AI.
 *
 * Asked again every time the screen opens (no stale time): an admin who has just added a
 * provider must not come back to a warning that says there is none.
 */
export type RuleCheckAi = 'usable' | 'none' | 'unusable' | 'unknown';

export const readRuleCheckAi = (data: {
  enabled: unknown[];
  platform?: { active: boolean };
  usable?: boolean | null;
}): RuleCheckAi => {
  if (data.usable === true) return 'usable';
  if (data.usable === null) return 'unknown';
  if (data.usable === false) return data.enabled.length > 0 ? 'unusable' : 'none';
  return aiIsConfigured(data) ? 'usable' : 'none';
};

/**
 * With a usable AI, is the check itself refused for the workspace as a STANDING state (the
 * backend's `ruleChecks`: trial ended, allowance used up, AI not in the plan, a budget or limit
 * reached)? The reason code when it is ('' when the backend names none); null when it is not, or
 * when that is not known — an older backend, a failed read on the server, or an AI that is not
 * `usable` (that state has its own warning, and the two never show together).
 *
 * A check that fails once (a provider error, a timeout) is not a standing state: the backend
 * reports nothing for it, and nothing is shown.
 */
export const readRuleCheckHeld = (data: {
  usable?: boolean | null;
  ruleChecks?: { held: boolean; reason: string | null } | null;
}): string | null => {
  if (data.usable !== true || data.ruleChecks?.held !== true) return null;
  return data.ruleChecks.reason ?? '';
};

export type RuleCheck = {
  ai: RuleCheckAi;
  /** Why every rule reply is held although the AI is usable; null = not held, or not known. */
  heldReason: string | null;
};

const UNKNOWN: RuleCheck = { ai: 'unknown', heldReason: null };

export const useRuleCheckAi = (): RuleCheck => {
  const query = useQuery({
    // Under the shared `ai-providers` prefix, so whatever invalidates the providers reaches it.
    queryKey: ['ai-providers', 'rule-check'],
    queryFn: async (): Promise<RuleCheck> => {
      const { data } = await aiService.getProviders();
      return { ai: readRuleCheckAi(data), heldReason: readRuleCheckHeld(data) };
    },
    staleTime: 0,
    refetchOnMount: 'always',
  });
  // While a re-read is on its way the previous answer may be the stale one: unknown until it lands.
  if (query.isFetching || query.isError) return UNKNOWN;
  return query.data ?? UNKNOWN;
};
