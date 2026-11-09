import { useQuery } from '@tanstack/react-query';
import {
  fetchWorkspaceBedrockModels,
  type BedrockDiscovery,
} from '@/services/bedrockDiscovery.service';

export type {
  BedrockDiscovery,
  DiscoveredModel,
  DiscoveryPayload,
  DiscoveryUnavailable,
} from '@/services/bedrockDiscovery.service';

/**
 * Live model list from the org's Bedrock credentials — the same identity real calls use, in any
 * of the three credential modes. `payload` is null when discovery is unavailable, with `reason`
 * saying why, so the card can keep the static catalog AND tell the admin what to fix.
 *
 * 30-min staleTime mirrors the BE cache TTL — the BE will return cached
 * results anyway, but this keeps refetches off the network in normal
 * card-toggle usage.
 *
 * Enabled only when `region` is non-empty: an admin who hasn't picked one yet should see the
 * static catalog only.
 */
export const useBedrockModels = (region: string | undefined) =>
  useQuery<BedrockDiscovery>({
    queryKey: ['bedrock-models', region ?? ''],
    queryFn: () => fetchWorkspaceBedrockModels(region ?? ''),
    enabled: !!region,
    // 30 min — match BE cache — but only for a LIST. A "no list" answer (not saved yet, permission
    // missing) is stale at once, so reopening the form after saving or fixing the role asks again.
    staleTime: (query) => (query.state.data?.payload ? 30 * 60 * 1000 : 0),
    gcTime: 60 * 60 * 1000,
    retry: 0, // discovery is best-effort; fall back to static on failure
  });
