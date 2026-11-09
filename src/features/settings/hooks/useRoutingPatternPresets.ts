import { useQuery } from '@tanstack/react-query';
import { organizationService } from '@/services/organization.service';
import { useAuthStore } from '@/stores/authStore';
import type { SkillPatternPreset } from '@/types/skillRouting';

export const ROUTING_PATTERN_PRESETS_KEY = 'routing-pattern-presets';

/**
 * The ready-made text patterns this workspace may tick (BE 2026-11-09), fetched once per page and
 * shared by every value's editor — not once per value. Keyed on the workspace: switching must not
 * carry the list over. An older backend (404) answers with the v1.1.325 list in the service.
 *
 * `presets` is null while loading and after a failed read (`failed`): the editor then still shows
 * the stored presets by id, without calling them unavailable.
 */
export function useRoutingPatternPresets(): {
  presets: SkillPatternPreset[] | null;
  failed: boolean;
} {
  const orgId = useAuthStore(
    (state) => state.selectedOrganizationId ?? state.user?.organizationId ?? null
  );
  const query = useQuery({
    queryKey: [ROUTING_PATTERN_PRESETS_KEY, orgId],
    queryFn: () => organizationService.getRoutingPatternPresets(),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  return { presets: query.data ?? null, failed: query.isError };
}
