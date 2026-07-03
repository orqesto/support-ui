import { useEffect, useState, useCallback, useRef } from 'react';
import { useDepartmentContextKey } from './useDepartmentContextKey';
import { classifyBreach } from './slaBreachDisposition';
import {
  getSocket,
  subscribeToEvent,
  unsubscribeFromEvent,
  releaseSocket,
} from '@/lib/socketManager';
import { apiClient } from '@/lib/api-client';
import type { Notification } from '@/types/api';

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
    // Optional: message breaches omit sender (the BE only sends it for ticket breaches).
    sender?: string;
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

// The REST row is the generated backend Notification contract.
type NotificationRow = Notification;

export type UseSLANotificationsResult = ReturnType<typeof useSLANotifications>;

export const useSLANotifications = () => {
  const [notifications, setNotifications] = useState<SLABreachNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [total, setTotal] = useState(0);
  const [onlyAssignedToMe, setOnlyAssignedToMeState] = useState(false);
  const [fetchError, setFetchError] = useState(false);
  // Tracks the highest severity surfaced per notification id. The BE
  // deliberately re-delivers a warning→critical escalation reusing the SAME
  // notifications.id; deduping on id alone dropped it (bell stayed "warning",
  // unreadCount never bumped). Storing severity lets us detect the escalation.
  const seenSeverity = useRef<Map<number, 'warning' | 'critical'>>(new Map());
  // Synchronous mirror of `notifications` so the socket handler can read a
  // notification's current read-state without nesting setState calls.
  const notificationsRef = useRef<SLABreachNotification[]>([]);
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
          type: row.entityType,
          organizationId: row.organizationId,
          severity: row.severity,
          breachAmount: row.breachAmount,
          details: row.details,
          createdAt: row.createdAt,
          receivedAt: Date.now(),
          isRead: row.isRead ?? false,
        }));
        seenSeverity.current = new Map(loaded.map((notif) => [notif.id, notif.severity]));
        notificationsRef.current = loaded;
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

  // Keep the ref mirror in sync for the socket handler's read-state lookups.
  useEffect(() => {
    notificationsRef.current = notifications;
  }, [notifications]);

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
      if (!matchesPrefs(breach, prefsRef.current)) return;

      const disposition = classifyBreach(seenSeverity.current.get(breach.id), breach.severity);
      if (disposition === 'duplicate') return;
      if (disposition === 'escalation') {
        seenSeverity.current.set(breach.id, breach.severity);

        // Re-surface: update severity/breachAmount in place, mark unread, move
        // to top. Bump unreadCount only if it was previously read (or has since
        // been evicted from the list) so an already-unread item isn't counted twice.
        const existing = notificationsRef.current.find((notif) => notif.id === breach.id);
        if (!existing || existing.isRead) {
          setUnreadCount((prev) => prev + 1);
        }
        setNotifications((prev) => {
          const rest = prev.filter((notif) => notif.id !== breach.id);
          const updated: SLABreachNotification = existing
            ? { ...existing, severity: breach.severity, breachAmount: breach.breachAmount, receivedAt: Date.now(), isRead: false }
            : { ...breach, receivedAt: Date.now(), isRead: false };
          return [updated, ...rest];
        });
        return;
      }

      seenSeverity.current.set(breach.id, breach.severity);
      if (seenSeverity.current.size > 500) {
        const oldest = seenSeverity.current.keys().next().value as number;
        seenSeverity.current.delete(oldest);
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
    // Keep id in seenSeverity so a re-broadcast doesn't re-add it
  }, []);

  const clearAll = useCallback(() => {
    apiClient.patch('/api/notifications/dismiss-all').catch(() => {});
    // Don't clear seenSeverity — dismissed IDs must stay tracked so re-broadcast
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
