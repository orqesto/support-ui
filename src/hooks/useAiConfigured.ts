import { useQuery } from '@tanstack/react-query';
import { aiService } from '@/services/ai.service';

/**
 * Whether the current org has at least one AI provider enabled.
 *
 * Used by the message-processing widget to suppress the "Missing AI" gap
 * indicator when no provider is configured — in that mode every batch
 * trivially has zero analysis, which is the *expected* state, not a gap.
 *
 * Returns:
 *   - `data`:    `true` if any provider is enabled (default to `true` while
 *                loading to avoid a flicker that hides the gap badge on a
 *                healthy-but-still-fetching first render)
 *   - `isLoading` for callers that want to wait
 */
export const useAiConfigured = () => {
  const query = useQuery({
    queryKey: ['ai-providers', 'enabled-status'],
    queryFn: async () => {
      // aiService.getProviders returns the API envelope { success, data: { enabled, available } }
      const envelope = await aiService.getProviders();
      return envelope.data.enabled.length > 0;
    },
    staleTime: 5 * 60 * 1000, // 5 min — provider config changes are rare
  });

  return {
    aiConfigured: query.data ?? true, // optimistic default
    isLoading: query.isLoading,
  };
};
