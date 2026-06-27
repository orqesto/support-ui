import { useEffect, useState, useCallback, useRef } from 'react';
import { useDepartmentContextKey } from './useDepartmentContextKey';
import { useAuthStore } from '@/stores/authStore';
import {
  learningService,
  type LearningNotification,
  type LearningSuggestion,
} from '@/services/learning.service';
import { logger } from '@/lib/logger';

// Polls the learning notifications + pending suggestions endpoints. No BE
// WebSocket emit exists today; 60s poll is fine — the engine cron runs every
// 5 min, so anything more frequent is wasted RTT. Re-fetches on dept-context
// change so multi-dept admins see scope-correct counts immediately.
const POLL_MS = 60_000;

/** localStorage key for the "I've seen everything up to this timestamp" cursor.
 *  Scoped per (userId, orgId) so org-switch on the same browser, or two users
 *  sharing a browser, don't read each other's ack cursor. */
const ackStorageKey = (userId: number | string, orgId: number | string): string =>
  `learnNotifAckAt:${userId}:${orgId}`;

const readAckAt = (
  userId: number | string | undefined,
  orgId: number | string | undefined
): number => {
  if (typeof window === 'undefined' || userId === undefined || orgId === undefined) return 0;
  const raw = window.localStorage.getItem(ackStorageKey(userId, orgId));
  const parsed = raw ? Number.parseInt(raw, 10) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
};

export type UseLearningNotificationsResult = ReturnType<typeof useLearningNotifications>;

export const useLearningNotifications = () => {
  const [notifications, setNotifications] = useState<LearningNotification[]>([]);
  const [suggestions, setSuggestions] = useState<LearningSuggestion[]>([]);
  const [fetchError, setFetchError] = useState(false);

  // Admin-only — non-admin users see no items because /api/learning/notifications
  // returns admin-scoped rows and the inbox itself is admin-gated. Global
  // 'admin' covers system admins; 'org_admin' covers per-org admins.
  const user = useAuthStore((state) => state.user);
  const orgId = useAuthStore((state) => state.selectedOrganizationId) ?? user?.organizationId;
  const isOrgAdmin = user?.role === 'admin' || user?.organizationRole === 'org_admin';
  const selectedDeptKey = useDepartmentContextKey();
  const inFlightRef = useRef(false);

  const [acknowledgedAt, setAcknowledgedAt] = useState<number>(() => readAckAt(user?.id, orgId));

  // Re-load the ack cursor when the user or org context changes — otherwise
  // we'd read userA/orgX's value for userB or for the same user in orgY.
  useEffect(() => {
    setAcknowledgedAt(readAckAt(user?.id, orgId));
  }, [user?.id, orgId]);

  const fetchAll = useCallback(async () => {
    if (!isOrgAdmin || inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const [notifs, sugs] = await Promise.all([
        learningService.listNotifications(),
        learningService.listSuggestions(),
      ]);
      setNotifications(notifs);
      setSuggestions(sugs.filter((sug) => sug.status === 'pending'));
      setFetchError(false);
    } catch (err) {
      logger.debug('useLearningNotifications fetch failed', { err });
      setFetchError(true);
    } finally {
      inFlightRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOrgAdmin, selectedDeptKey, orgId]);

  useEffect(() => {
    if (!isOrgAdmin) return;
    void fetchAll();

    // Pause polling when the tab is hidden — modern browsers throttle background
    // setInterval but don't pause it; this drops the cost to zero and refreshes
    // on visibility-return so the badge is current when the agent comes back.
    let intervalId: number | null = null;
    const start = () => {
      if (intervalId !== null) return;
      intervalId = window.setInterval(() => {
        void fetchAll();
      }, POLL_MS);
    };
    const stop = () => {
      if (intervalId === null) return;
      window.clearInterval(intervalId);
      intervalId = null;
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        void fetchAll();
        start();
      } else {
        stop();
      }
    };
    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      stop();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [fetchAll, isOrgAdmin]);

  const markAllRead = useCallback(() => {
    const now = Date.now();
    setAcknowledgedAt(now);
    if (typeof window !== 'undefined' && user?.id !== undefined && orgId !== undefined) {
      window.localStorage.setItem(ackStorageKey(user.id, orgId), String(now));
    }
  }, [user?.id, orgId]);

  // Refresh after admin actions so the bell updates without waiting for poll.
  const refresh = useCallback(() => {
    void fetchAll();
  }, [fetchAll]);

  const unreadCount =
    notifications.filter((row) => new Date(row.createdAt).getTime() > acknowledgedAt).length +
    suggestions.filter((row) => new Date(row.createdAt).getTime() > acknowledgedAt).length;

  return {
    notifications,
    suggestions,
    unreadCount,
    fetchError,
    isOrgAdmin,
    markAllRead,
    refresh,
  };
};
