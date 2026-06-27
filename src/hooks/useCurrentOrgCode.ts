import { useQuery } from '@tanstack/react-query';
import { organizationService } from '@/services/organization.service';
import { useAuthStore } from '@/stores/authStore';

/**
 * The current organization's short display code (e.g. 'ACM'), used to render
 * org-scoped public ids as `ACM-SUP-42`. Returns `undefined` until loaded or
 * when the org has no code yet (pre-backfill) — callers then show the bare
 * publicId (`SUP-42`).
 *
 * Sourced from `/organizations/current` (NOT the admin-only org list), so it
 * works for every user type. Keyed on the selected org id so it refetches when
 * a global admin switches orgs; cached 5 min and deduped across all the list
 * items that render an id.
 */
export const useCurrentOrgCode = (): string | undefined => {
  const orgId = useAuthStore(
    (state) => state.selectedOrganizationId ?? state.user?.organizationId ?? null
  );

  const { data } = useQuery({
    queryKey: ['current-org-code', orgId],
    queryFn: () => organizationService.getCurrent(),
    enabled: orgId !== null,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  return data?.code ?? undefined;
};
