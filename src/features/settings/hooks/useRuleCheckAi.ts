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

export const useRuleCheckAi = (): RuleCheckAi => {
  const query = useQuery({
    // Under the shared `ai-providers` prefix, so whatever invalidates the providers reaches it.
    queryKey: ['ai-providers', 'rule-check'],
    queryFn: async () => readRuleCheckAi((await aiService.getProviders()).data),
    staleTime: 0,
    refetchOnMount: 'always',
  });
  // While a re-read is on its way the previous answer may be the stale one: unknown until it lands.
  if (query.isFetching || query.isError) return 'unknown';
  return query.data ?? 'unknown';
};
