import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

/**
 * Live model list from the saved custom-provider's /v1/models endpoint.
 * Mirrors useBedrockModels — returns null when discovery isn't available
 * so callers can unambiguously fall back to the manual model-id input.
 *
 * `enabled` controls when the hook fires. Caller passes false when the
 * form isn't open yet (no point hitting the API).
 */
export type CustomDiscoveredModel = {
  id: string;
  name: string;
  type: 'chat' | 'embedding';
  description?: string;
};

export type CustomDiscoveryPayload = {
  models: CustomDiscoveredModel[];
  source: 'live' | 'cache';
  fetchedAt: string;
};

export const useCustomProviderModels = (enabled: boolean) =>
  useQuery<CustomDiscoveryPayload | null>({
    queryKey: ['custom-provider-models'],
    queryFn: async () => {
      const response = await apiClient.get<{
        success: boolean;
        data: CustomDiscoveryPayload | null;
      }>('/api/integrations/custom/models');
      return response.data.data;
    },
    enabled,
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    retry: 0,
  });
