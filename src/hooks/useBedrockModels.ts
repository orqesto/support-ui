import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

/**
 * Live model list from the org's Bedrock-permissioned IAM role. Returns
 * `null` (not `undefined`) when discovery is unavailable so callers can
 * unambiguously distinguish "still loading" from "discovery failed, use
 * the static catalog".
 *
 * 30-min staleTime mirrors the BE cache TTL — the BE will return cached
 * results anyway, but this keeps refetches off the network in normal
 * card-toggle usage.
 *
 * Enabled only when `region` is non-empty: discovery needs a region to
 * AssumeRole into, and an admin who hasn't picked one yet should see the
 * static catalog only.
 */
export type DiscoveredModel = {
  id: string;
  name: string;
  type: 'chat' | 'embedding';
  description?: string;
  requiresInferenceProfile?: boolean;
  inferenceProfileArn?: string;
};

export type DiscoveryPayload = {
  models: DiscoveredModel[];
  source: 'live' | 'cache';
  fetchedAt: string;
};

export const useBedrockModels = (region: string | undefined) =>
  useQuery<DiscoveryPayload | null>({
    queryKey: ['bedrock-models', region ?? ''],
    queryFn: async () => {
      const params = region ? `?region=${encodeURIComponent(region)}` : '';
      const response = await apiClient.get<{ success: boolean; data: DiscoveryPayload | null }>(
        `/api/integrations/bedrock/models${params}`
      );
      return response.data.data;
    },
    enabled: !!region,
    staleTime: 30 * 60 * 1000, // 30 min — match BE cache
    gcTime: 60 * 60 * 1000,
    retry: 0, // discovery is best-effort; fall back to static on failure
  });
