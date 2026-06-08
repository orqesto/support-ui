import { useQuery } from '@tanstack/react-query';
import { messageService } from '@/services/message.service';
import { useAuthStore } from '@/stores/authStore';

export const useNeedsRoutingCount = () => {
  // Key by current org so global admins switching orgs see the right count
  // instead of the previous org's cached value.
  const orgId = useAuthStore((state) => state.selectedOrganizationId ?? state.user?.organizationId ?? null);
  return useQuery<number>({
    queryKey: ['needs-routing-count', orgId],
    queryFn: messageService.getNeedsRoutingCount,
    refetchInterval: 60_000, // refresh every minute
    staleTime: 30_000,
    enabled: orgId !== null,
  });
};
