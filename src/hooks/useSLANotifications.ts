import { useEffect, useState, useCallback, useRef } from 'react';
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

const LAST_READ_KEY = 'sla_notifications_last_read';

export const useSLANotifications = () => {
  const [notifications, setNotifications] = useState<SLABreachNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [total, setTotal] = useState(0);
  const [onlyAssignedToMe, setOnlyAssignedToMeState] = useState(false);
  const seenIds = useRef<Set<number>>(new Set());
  const prefsRef = useRef<UserPrefs>(DEFAULT_PREFS);

  const fetchNotifications = useCallback(() => {
    apiClient
      .get('/api/notifications')
      .then((r) => {
        type Row = { id: number; entityId: number; entityType: string; organizationId: number; severity: string; breachAmount: number; details: SLABreachNotification['details']; createdAt: string };
        type Payload = { notifications?: Row[]; total?: number } | Row[];
        const raw = (r.data as { data?: Payload }).data;
        const rows: Row[] = Array.isArray(raw)
          ? (raw as Row[])
          : ((raw as { notifications?: Row[] })?.notifications ?? []);
        const totalCount: number = Array.isArray(raw)
          ? rows.length
          : ((raw as { total?: number })?.total ?? rows.length);
        const lastRead = Number(localStorage.getItem(LAST_READ_KEY) ?? 0);
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
        }));
        seenIds.current = new Set(loaded.map((n) => n.id));
        setNotifications(loaded);
        setTotal(totalCount);
        const unread = loaded.filter((n) => new Date(n.createdAt).getTime() > lastRead).length;
        setUnreadCount(unread);
      })
      .catch(() => {});
  }, []);

  const setOnlyMine = useCallback((value: boolean) => {
    setOnlyAssignedToMeState(value);
    prefsRef.current = { ...prefsRef.current, onlyAssignedToMe: value };
    apiClient
      .put('/api/users/me/notification-preferences', { onlyAssignedToMe: value })
      .then(() => fetchNotifications())
      .catch(() => {});
  }, [fetchNotifications]);

  // Load user preferences
  useEffect(() => {
    apiClient
      .get('/api/users/me/notification-preferences')
      .then((r) => {
        const data = (r.data as { data?: Partial<UserPrefs> }).data;
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

  // Real-time WebSocket delivery
  useEffect(() => {
    getSocket();

    const handleBreach = (data: unknown) => {
      const breach = data as Omit<SLABreachNotification, 'receivedAt'>;
      if (seenIds.current.has(breach.id)) return;
      if (!matchesPrefs(breach, prefsRef.current)) return;
      seenIds.current.add(breach.id);
      const notification: SLABreachNotification = { ...breach, receivedAt: Date.now() };
      setNotifications((prev) => [notification, ...prev]);
      setUnreadCount((prev) => prev + 1);
    };

    subscribeToEvent('sla_breach', handleBreach);
    return () => {
      unsubscribeFromEvent('sla_breach', handleBreach);
      releaseSocket();
    };
  }, []);

  const dismiss = useCallback((id: number) => {
    apiClient.patch(`/api/notifications/${id}/dismiss`).catch(() => {});
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    setUnreadCount((prev) => Math.max(0, prev - 1));
    // Keep id in seenIds so a re-broadcast doesn't re-add it
  }, []);

  const clearAll = useCallback(() => {
    apiClient.patch('/api/notifications/dismiss-all').catch(() => {});
    setNotifications([]);
    setTotal(0);
    setUnreadCount(0);
    localStorage.setItem(LAST_READ_KEY, String(Date.now()));
    seenIds.current.clear();
  }, []);

  const markAllRead = useCallback(() => {
    setUnreadCount(0);
    localStorage.setItem(LAST_READ_KEY, String(Date.now()));
  }, []);

  return { notifications, total, unreadCount, onlyAssignedToMe, setOnlyMine, clearAll, dismiss, markAllRead };
};
