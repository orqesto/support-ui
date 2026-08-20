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

/**
 * LIVE queue-depth keys the server folds into `/counts` (org-wide `needs_routing`,
 * dept-scoped `suspicious_queue`). These are NOT per-user arrival ping kinds — they
 * don't arrive on `notification:new`; they refresh whenever any arrival ping (or the
 * 60s poll) refetches the whole counts map. Documenting them here keeps the FE↔BE key
 * contract in one place. (Audit BE-H2.)
 */
export type QueueDepthKind = 'needs_routing' | 'suspicious_queue';

type CountsMap = Partial<Record<ArrivalKind | QueueDepthKind, number>> & Record<string, number>;

// Kinds whose creation should live-refresh the badge counts. Other kinds (SLA) are
// delivered on the same `notification:new` ping but don't move these badges.
const ARRIVAL_KINDS = new Set<string>(['suspicious_arrival', 'spam_arrival']);

/**
 * Per-kind UNREAD notification counts for the current org + department scope, used to
 * badge the Suspicious/Spam Kanban column headers. Backed by `GET /api/notifications/counts`
 * (dept-scoped server-side via the X-Department-Context header). Live-refreshes on the
 * `notification:new` WS ping and polls every 60s as a fallback.
 *
 * `clearKind` marks that kind read (`PATCH /read-all?kind=`) — the "reviewed → badge
 * clears" action. For the two ARRIVAL kinds the server treats that read as shared, so
 * it clears the badge for the whole team, not just the clicking agent.
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
    // Org/dept are part of the queryKey, so a switch otherwise drops every count back to
    // `undefined`: badges blink out and the Needs Routing nav item (gated on
    // `needs_routing > 0`) disappears and reappears. Holding the previous scope's values
    // for the moment the new ones are in flight avoids that churn.
    //
    // Deliberately NOT persisted to localStorage, unlike the tickets *visibility* count:
    // these numbers are rendered to the user, and a stale count is wrong information —
    // worse than one that arrives a moment late.
    placeholderData: (previous) => previous,
  });

  // Live refresh: when an arrival notification is created anywhere in the org, refetch
  // our own (dept-scoped) counts. The ping is content-free — the server does the scoping.
  useEffect(() => {
    getSocket();
    const invalidate = (): void => {
      void queryClient
        .invalidateQueries({ queryKey: ['notification-counts', orgId, deptKey] })
        .catch(() => {});
    };
    const handleNew = (data: unknown) => {
      const kind = (data as { kind?: string } | null)?.kind;
      if (kind && ARRIVAL_KINDS.has(kind)) invalidate();
    };
    // A conversation was removed (deleted / routed out of needs_routing / reclassified)
    // → its live queue counts (needs_routing depth, spam/suspicious arrivals) may drop.
    // Without this the badge lingered until the 60s poll — the "I removed messages but
    // the count didn't clear" symptom.
    const handleRemoved = () => invalidate();
    // A notification was marked read — from the notification panel OR (server-side)
    // when its conversation is marked read. Arrival reads are SHARED: the server
    // broadcasts them to the whole `org-<id>` room, so one agent handling a thread
    // drops the badge for every agent, not just their own sessions. Without this,
    // "Mark as read" cleared the per-thread dot but the count stuck until the 60s
    // poll (client-reported).
    const handleRead = () => invalidate();
    // The mirror image: marking a thread unread restores its arrival notification for
    // the team, so the badge has to come back just as promptly as it went away.
    const handleUnread = () => invalidate();
    subscribeToEvent('notification:new', handleNew);
    subscribeToEvent('notification:removed', handleRemoved);
    subscribeToEvent('notification:read', handleRead);
    subscribeToEvent('notification:unread', handleUnread);
    return () => {
      unsubscribeFromEvent('notification:new', handleNew);
      unsubscribeFromEvent('notification:removed', handleRemoved);
      unsubscribeFromEvent('notification:read', handleRead);
      unsubscribeFromEvent('notification:unread', handleUnread);
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
