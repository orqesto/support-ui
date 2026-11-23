import { useQuery } from '@tanstack/react-query';
import { aiService } from '@/services/ai.service';

/**
 * Whether the workspace has AI at all (a provider of its own, or platform AI): what the app's AI
 * buttons and the message-processing widget ask. `aiConfigured` is `true` while the answer is
 * loading or could not be read, so nothing flickers or hides on an unknown.
 *
 * It does NOT say whether that AI can actually be used right now: the keyword-rules screen asks
 * that through `useRuleCheckAi` (settings feature), which reads the backend's own `usable` answer.
 */
/**
 * Does this org have AI at all — from either source?
 *
 * `enabled` lists BYO providers. An org running on PLATFORM AI (`settings.aiMode =
 * 'managed'`) has no provider rows of its own, so asking only `enabled` reports "no AI" for
 * an org whose AI works. On a live deployment that hid the AI button for the one workspace
 * whose AI came solely from managed mode; two other managed orgs were masked because they
 * happened to also carry a BYO row.
 *
 * `platform` is absent on BE < v1.1.248, so the optional chain is load-bearing during a
 * deploy window rather than defensive habit — this bundle is served against both.
 */
export const aiIsConfigured = (data: {
  enabled: unknown[];
  platform?: { active: boolean };
}): boolean => data.enabled.length > 0 || data.platform?.active === true;

export const useAiConfigured = () => {
  const query = useQuery({
    queryKey: ['ai-providers', 'enabled-status'],
    queryFn: async () => {
      // aiService.getProviders returns { success, data: { enabled, available, platform? } }.
      //
      // `enabled` is BYO providers only. An org running on PLATFORM AI
      // (`settings.aiMode = 'managed'`) has no provider rows of its own, so asking only
      // `enabled` reported "no AI" for an org whose AI works — on a live deployment the AI
      // button was hidden for the one workspace whose AI came solely from managed mode, while
      // two other managed orgs were masked because they happened to also carry a BYO row.
      //
      // `platform` is absent on BE < v1.1.248, so the optional chain is load-bearing during a
      // deploy window, not defensive habit.
      const envelope = await aiService.getProviders();
      return aiIsConfigured(envelope.data);
    },
    staleTime: 5 * 60 * 1000, // 5 min — provider config changes are rare
  });

  return {
    aiConfigured: query.data ?? true, // optimistic default
    isLoading: query.isLoading,
  };
};
