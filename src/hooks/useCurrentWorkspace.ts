import { useQuery } from '@tanstack/react-query';
import { organizationService } from '@/services/organization.service';
import { useAuthStore } from '@/stores/authStore';

/**
 * The workspace whose rows this session is about to write — name and short code.
 *
 * Same query key as {@link useCurrentOrgCode} on purpose: both read
 * `/organizations/current`, and sharing the key means the banner costs no extra
 * request no matter how many list items are also rendering ids.
 */
export const useCurrentWorkspace = (): { id: number | null; name?: string; code?: string } => {
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

  return { id: orgId, name: data?.name, code: data?.code ?? undefined };
};
