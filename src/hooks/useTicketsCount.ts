import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useDepartmentContextKey } from '@/hooks/useDepartmentContextKey';
import { readPersistedCount, writePersistedCount } from '@/lib/persistedCount';
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
 *
 * The count is seeded from the last known value for this exact scope, because the
 * sidebar has to render before the answer arrives and both guesses are visible: assuming
 * "has tickets" made the item appear and then vanish for orgs with none, and assuming
 * "none" makes it appear late for orgs that have them. Since the scope is part of the
 * queryKey, that guess was also re-made on every org and department switch, not just on
 * a cold load. `initialDataUpdatedAt: 0` marks the seed as already stale so it never
 * suppresses the refetch, and `placeholderData` keeps the previous scope's value on
 * screen while the new one loads instead of dropping back to `undefined`.
 */
export const useTicketsCount = () => {
  const orgId = useAuthStore(
    (state) => state.selectedOrganizationId ?? state.user?.organizationId ?? null
  );
  const deptKey = useDepartmentContextKey();
  const scopeKey = `tickets.${orgId ?? 'none'}.${deptKey}`;

  const query = useQuery<number>({
    queryKey: ['tickets-count', orgId, deptKey],
    queryFn: async () => {
      const res = await ticketService.getMetadata(undefined, 1);
      return res.data.total;
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
    enabled: orgId !== null,
    initialData: () => readPersistedCount(scopeKey),
    // Treat the seed as stale so the query still fetches immediately on mount.
    initialDataUpdatedAt: 0,
    placeholderData: (previous) => previous,
  });

  // Record the fetched value for this scope so the next mount / switch starts from the
  // real answer rather than a guess.
  const { data, isSuccess, isPlaceholderData } = query;
  useEffect(() => {
    if (isSuccess && !isPlaceholderData && typeof data === 'number') {
      writePersistedCount(scopeKey, data);
    }
  }, [isSuccess, isPlaceholderData, data, scopeKey]);

  return query;
};
