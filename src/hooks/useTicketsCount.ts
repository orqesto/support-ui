import { useQuery } from '@tanstack/react-query';
import { useDepartmentContextKey } from '@/hooks/useDepartmentContextKey';
import { ticketService } from '@/services/ticket.service';
import { useAuthStore } from '@/stores/authStore';

/**
 * Ticket count scoped to the user's current org + checkbox-driven dept selection.
 * Used by the sidebar to hide the Tickets nav item when the count is 0.
 *
 * Note: the BE `ticketController.getMetadata` honors `X-Department-Context`, so
 * picking a dept narrows this count. That means the sidebar can hide "Tickets"
 * when the user filters to a dept with no tickets even though other depts have
 * tickets — to see them, they switch back to "All Departments". Including the
 * dept key in the queryKey keeps the cache consistent with that scope.
 */
export const useTicketsCount = () => {
  const orgId = useAuthStore(
    (state) => state.selectedOrganizationId ?? state.user?.organizationId ?? null
  );
  const deptKey = useDepartmentContextKey();
  return useQuery<number>({
    queryKey: ['tickets-count', orgId, deptKey],
    queryFn: async () => {
      const res = await ticketService.getMetadata(undefined, 1);
      return res.data.total;
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
    enabled: orgId !== null,
  });
};
