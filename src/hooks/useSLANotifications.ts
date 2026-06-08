import { useEffect, useState, useCallback, useRef } from 'react';
import { useDepartmentContextKey } from './useDepartmentContextKey';
import {
  getSocket,
  subscribeToEvent,
  unsubscribeFromEvent,
  releaseSocket,
} from '@/lib/socketManager';
import { apiClient } from '@/lib/api-client';

export type SLABreachNotification = {
  id: number; // notifications.id from DB
  entityId: number; // message.id or ticket.id
  type: 'message' | 'ticket_first_response' | 'ticket_resolution';
  organizationId: number;
  severity: 'warning' | 'critical';
  breachAmount: number;
  details: {
    channel?: string;
    priority?: string;
    sender: string;
    subject?: string;
    title?: string;
    targetMinutes?: number;
    actualMinutes?: number;
  };
  createdAt: string;
  receivedAt: number;
  isRead: boolean;
};

type UserPrefs = {
  minSeverity: 'warning' | 'critical';
  notifyMessages: boolean;
  notifyTicketFirstResponse: boolean;
  notifyTicketResolution: boolean;
  onlyAssignedToMe: boolean;
};

const DEFAULT_PREFS: UserPrefs = {
  minSeverity: 'warning',
  notifyMessages: true,
  notifyTicketFirstResponse: true,
  notifyTicketResolution: true,
  onlyAssignedToMe: false,
};

const matchesPrefs = (breach: Omit<SLABreachNotification, 'receivedAt'>, prefs: UserPrefs): boolean => {
  if (prefs.minSeverity === 'critical' && breach.severity !== 'critical') return false;
  if (breach.type === 'message' && !prefs.notifyMessages) return false;
  if (breach.type === 'ticket_first_response' && !prefs.notifyTicketFirstResponse) return false;
  if (breach.type === 'ticket_resolution' && !prefs.notifyTicketResolution) return false;
  return true;
};

type NotificationRow = {
  id: number;
  entityId: number;
  entityType: string;
  organizationId: number;
  severity: string;
  breachAmount: number;
  details: SLABreachNotification['details'];
  createdAt: string;
  isRead?: boolean;
};

export type UseSLANotificationsResult = ReturnType<typeof useSLANotifications>;

export const useSLANotifications = () => {
  const [notifications, setNotifications] = useState<SLABreachNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [total, setTotal] = useState(0);
  const [onlyAssignedToMe, setOnlyAssignedToMeState] = useState(false);
  const [fetchError, setFetchError] = useState(false);
  const seenIds = useRef<Set<number>>(new Set());
  const prefsRef = useRef<UserPrefs>(DEFAULT_PREFS);
  // BE `notificationsController` honours X-Department-Context. Force callback
  // identity to change on dept toggle so consumer effects re-fetch in scope.
  const selectedDeptKey = useDepartmentContextKey();

  const fetchNotifications = useCallback(() => {
    apiClient
      .get('/api/notifications')
      .then((res) => {
        const payload = (res.data as { data: { notifications: NotificationRow[]; total: number } }).data;
        const rows = payload.notifications;
        const totalCount = payload.total;
        const loaded: SLABreachNotification[] = rows.map((row) => ({
          id: row.id,
          entityId: row.entityId,
          type: row.entityType as SLABreachNotification['type'],
          organizationId: row.organizationId,
          severity: row.severity as 'warning' | 'critical',
          breachAmount: row.breachAmount,
          details: row.details,
          createdAt: row.createdAt,
          receivedAt: Date.now(),
          isRead: row.isRead ?? false,
        }));
        seenIds.current = new Set(loaded.map((notif) => notif.id));
        setNotifications(loaded);
        setTotal(totalCount);
        setUnreadCount(loaded.filter((notif) => !notif.isRead).length);
        setFetchError(false);
      })
      .catch(() => {
        setFetchError(true);
      });
  // selectedDeptKey is a refresh trigger (read via axios interceptor).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDeptKey]);

  const setOnlyMine = useCallback((value: boolean) => {
    const previousValue = prefsRef.current.onlyAssignedToMe;
    setOnlyAssignedToMeState(value);
    prefsRef.current = { ...prefsRef.current, onlyAssignedToMe: value };
    apiClient
      .put('/api/users/me/notification-preferences', { onlyAssignedToMe: value })
      .then(() => fetchNotifications())
      .catch(() => {
        // Roll back to last server-confirmed state, not the negation of the argument
        setOnlyAssignedToMeState(previousValue);
        prefsRef.current = { ...prefsRef.current, onlyAssignedToMe: previousValue };
      });
  }, [fetchNotifications]);

  // Load user preferences
  useEffect(() => {
    apiClient
      .get('/api/users/me/notification-preferences')
      .then((res) => {
        const data = (res.data as { data?: Partial<UserPrefs> }).data;
        if (data) {
          prefsRef.current = { ...DEFAULT_PREFS, ...data };
          setOnlyAssignedToMeState(data.onlyAssignedToMe ?? false);
        }
      })
      .catch(() => {});
  }, []);

  // Load persisted notifications on mount
  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Real-time WebSocket delivery.
  // Depends on Layout.tsx having already called joinOrganizationRoom() so the socket
  // is subscribed to `org-<id>` before sla_breach events arrive.
  useEffect(() => {
    getSocket();

    const handleBreach = (data: unknown) => {
      const breach = data as Omit<SLABreachNotification, 'receivedAt'>;
      if (seenIds.current.has(breach.id)) return;
      if (!matchesPrefs(breach, prefsRef.current)) return;
      seenIds.current.add(breach.id);
      if (seenIds.current.size > 500) {
        const oldest = seenIds.current.values().next().value as number;
        seenIds.current.delete(oldest);
      }
      const notification: SLABreachNotification = { ...breach, receivedAt: Date.now(), isRead: false };
      setNotifications((prev) => [notification, ...prev]);
      setUnreadCount((prev) => prev + 1);
    };

    // Sync read state from another device/tab for the same user
    const handleNotificationRead = (data: unknown) => {
      const { notificationId } = data as { notificationId: number };
      setNotifications((prev) =>
        prev.map((notif) =>
          notif.id === notificationId ? { ...notif, isRead: true } : notif
        )
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    };

    // Re-fetch on reconnect to recover notifications missed during the disconnection gap
    const handleReconnect = () => { fetchNotifications(); };

    subscribeToEvent('sla_breach', handleBreach);
    subscribeToEvent('notification:read', handleNotificationRead);
    subscribeToEvent('connect', handleReconnect);
    return () => {
      unsubscribeFromEvent('sla_breach', handleBreach);
      unsubscribeFromEvent('notification:read', handleNotificationRead);
      unsubscribeFromEvent('connect', handleReconnect);
      releaseSocket();
    };
  }, [fetchNotifications]);

  const dismiss = useCallback((id: number) => {
    apiClient.patch(`/api/notifications/${id}/dismiss`).catch(() => {});
    setNotifications((prev) => {
      const target = prev.find((notif) => notif.id === id);
      if (target && !target.isRead) {
        setUnreadCount((count) => Math.max(0, count - 1));
      }
      setTotal((prev) => Math.max(0, prev - 1));
      return prev.filter((notif) => notif.id !== id);
    });
    // Keep id in seenIds so a re-broadcast doesn't re-add it
  }, []);

  const clearAll = useCallback(() => {
    apiClient.patch('/api/notifications/dismiss-all').catch(() => {});
    // Don't clear seenIds — dismissed IDs must stay tracked so re-broadcast
    // socket events don't re-add them immediately after dismiss-all.
    setNotifications([]);
    setTotal(0);
    setUnreadCount(0);
  }, []);

  const markRead = useCallback((id: number) => {
    apiClient.patch(`/api/notifications/${id}/read`).catch(() => {});
    setNotifications((prev) =>
      prev.map((notif) => (notif.id === id ? { ...notif, isRead: true } : notif))
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));
  }, []);

  const markAllRead = useCallback(() => {
    setNotifications((prev) => prev.map((notif) => ({ ...notif, isRead: true })));
    setUnreadCount(0);
  }, []);

  return { notifications, total, unreadCount, fetchError, onlyAssignedToMe, setOnlyMine, clearAll, dismiss, markRead, markAllRead };
};
