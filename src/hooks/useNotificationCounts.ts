import { useCallback, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useDepartmentContextKey } from './useDepartmentContextKey';
import { apiClient } from '@/lib/api-client';
import {
  getSocket,
  subscribeToEvent,
  unsubscribeFromEvent,
  releaseSocket,
} from '@/lib/socketManager';
import { useAuthStore } from '@/stores/authStore';

/** Notification kinds that surface as arrival badges (Notification Center P2). */
export type ArrivalKind = 'suspicious_arrival' | 'spam_arrival';

type CountsMap = Record<string, number>;

// Kinds whose creation should live-refresh the badge counts. Other kinds (SLA) are
// delivered on the same `notification:new` ping but don't move these badges.
const ARRIVAL_KINDS = new Set<string>(['suspicious_arrival', 'spam_arrival']);

/**
 * Per-kind UNREAD notification counts for the current org + department scope, used to
 * badge the Suspicious/Spam Kanban column headers. Backed by `GET /api/notifications/counts`
 * (dept-scoped server-side via the X-Department-Context header). Live-refreshes on the
 * `notification:new` WS ping and polls every 60s as a fallback.
 *
 * `clearKind` marks that kind read for the current user (`PATCH /read-all?kind=`) — the
 * per-user "reviewed → badge clears" action.
 */
export const useNotificationCounts = () => {
  const orgId = useAuthStore(
    (state) => state.selectedOrganizationId ?? state.user?.organizationId ?? null
  );
  const deptKey = useDepartmentContextKey();
  const queryClient = useQueryClient();
  const queryKey = ['notification-counts', orgId, deptKey] as const;

  const query = useQuery<CountsMap>({
    queryKey,
    queryFn: async () => {
      const res = await apiClient.get('/api/notifications/counts');
      return (res.data as { data?: CountsMap }).data ?? {};
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
    enabled: orgId !== null,
  });

  // Live refresh: when an arrival notification is created anywhere in the org, refetch
  // our own (dept-scoped) counts. The ping is content-free — the server does the scoping.
  useEffect(() => {
    getSocket();
    const handleNew = (data: unknown) => {
      const kind = (data as { kind?: string } | null)?.kind;
      if (kind && ARRIVAL_KINDS.has(kind)) {
        queryClient
          .invalidateQueries({ queryKey: ['notification-counts', orgId, deptKey] })
          .catch(() => {});
      }
    };
    subscribeToEvent('notification:new', handleNew);
    return () => {
      unsubscribeFromEvent('notification:new', handleNew);
      releaseSocket();
    };
  }, [queryClient, orgId, deptKey]);

  const clearKind = useCallback(
    async (kind: ArrivalKind): Promise<void> => {
      const key = ['notification-counts', orgId, deptKey];
      // Optimistically zero the pill so it disappears immediately on click.
      queryClient.setQueryData<CountsMap>(key, (prev) => (prev ? { ...prev, [kind]: 0 } : prev));
      try {
        await apiClient.patch(`/api/notifications/read-all?kind=${encodeURIComponent(kind)}`);
      } catch {
        // Ignore — the optimistic zero stands; the next poll / WS ping reconciles truth.
      } finally {
        await queryClient.invalidateQueries({ queryKey: key });
      }
    },
    [queryClient, orgId, deptKey]
  );

  return { counts: query.data ?? {}, clearKind };
};
