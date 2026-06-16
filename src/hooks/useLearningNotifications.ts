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

export type UseLearningNotificationsResult = ReturnType<typeof useLearningNotifications>;

export const useLearningNotifications = () => {
  const [notifications, setNotifications] = useState<LearningNotification[]>([]);
  const [suggestions, setSuggestions] = useState<LearningSuggestion[]>([]);
  const [fetchError, setFetchError] = useState(false);
  const [acknowledgedAt, setAcknowledgedAt] = useState<number>(() => {
    // Surface only newly-arrived items as "unread" — agents who already opened
    // the bell shouldn't see the badge re-light on every re-fetch. Persist
    // per-user via localStorage so the threshold survives reload.
    const raw =
      typeof window !== 'undefined' ? window.localStorage.getItem('learnNotifAckAt') : null;
    const parsed = raw ? Number.parseInt(raw, 10) : 0;
    return Number.isFinite(parsed) ? parsed : 0;
  });

  // Admin-only — non-admin users see no items because /api/learning/notifications
  // returns admin-scoped rows and the inbox itself is admin-gated. Global
  // 'admin' covers system admins; 'org_admin' covers per-org admins.
  const user = useAuthStore((state) => state.user);
  const isOrgAdmin = user?.role === 'admin' || user?.organizationRole === 'org_admin';
  const selectedDeptKey = useDepartmentContextKey();
  const inFlightRef = useRef(false);

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
  }, [isOrgAdmin, selectedDeptKey]);

  useEffect(() => {
    if (!isOrgAdmin) return;
    void fetchAll();
    const id = window.setInterval(() => {
      void fetchAll();
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [fetchAll, isOrgAdmin]);

  const markAllRead = useCallback(() => {
    const now = Date.now();
    setAcknowledgedAt(now);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('learnNotifAckAt', String(now));
    }
  }, []);

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
