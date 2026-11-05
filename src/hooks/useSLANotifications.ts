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
import { invalidateSharedFetch, sharedFetch } from '@/lib/sharedFetch';
import { useAuthStore } from '@/stores/authStore';
import {
  NOTIFICATION_SETTINGS_CHANGED_EVENT,
  notificationPrefsFetchKey,
} from '@/hooks/notificationPrefsKey';
import { unreadBeyondPage } from '@/lib/notificationPageCounts';

import type { Notification } from '@/types/api';
import {
  fetchNotificationSettings,
  type NotificationSettings,
  type SettingsLine,
} from '@/services/notificationSettingsService';

export type SLABreachNotification = {
  id: number; // notifications.id from DB
  entityId: number; // message.id or ticket.id
  // The notification's entityType, from the generated API types (`npm run gen:types`).
  // `slack_connection` / `slack_channel_route`: kind `slack_connection_broken` (no breach fields),
  // shown in this list with its own label and a link to Settings › Slack notifications.
  type: Notification['entityType'];
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

export type UserPrefs = {
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

/** Bell prefs from the effective lines; a line that is absent keeps today's default. */
export const prefsFromLines = (lines: SettingsLine[]): UserPrefs => {
  const flag = (key: string, fallback: boolean): boolean => {
    const hit = lines.find((entry) => entry.key === key);
    return typeof hit?.value === 'boolean' ? hit.value : fallback;
  };
  const severity = lines.find((entry) => entry.key === 'slaMinSeverity')?.value;
  return {
    minSeverity: severity === 'critical' ? 'critical' : 'warning',
    notifyMessages: flag('kind:sla_message_breach', DEFAULT_PREFS.notifyMessages),
    notifyTicketFirstResponse: flag('kind:sla_ticket_first_response', true),
    notifyTicketResolution: flag('kind:sla_ticket_resolution', true),
    onlyAssignedToMe: flag('onlyAssignedToMe', false),
  };
};

export const matchesPrefs = (
  breach: Omit<SLABreachNotification, 'receivedAt'>,
  prefs: UserPrefs,
  lines?: SettingsLine[]
): boolean => {
  // Effective lines (new settings API): a kind switched OFF never matches. Absent lines (old
  // backend) leave the legacy flags below as the only rule.
  const kind =
    breach.type === 'message' || breach.type === 'conversation'
      ? 'sla_message_breach'
      : breach.type === 'ticket_first_response'
        ? 'sla_ticket_first_response'
        : breach.type === 'ticket_resolution'
          ? 'sla_ticket_resolution'
          : null;
  if (kind && lines?.some((entry) => entry.key === `kind:${kind}` && entry.value === false)) return false;
  if (prefs.minSeverity === 'critical' && breach.severity !== 'critical') return false;
  // A thread breach arrives as `message` or (newer backend) `conversation`; a ticket breach by its
  // kind, or as a plain `ticket` — muted only when both ticket kinds are off.
  const isThread = breach.type === 'message' || breach.type === 'conversation';
  if (isThread && !prefs.notifyMessages) return false;
  if (breach.type === 'ticket_first_response' && !prefs.notifyTicketFirstResponse) return false;
  if (breach.type === 'ticket_resolution' && !prefs.notifyTicketResolution) return false;
  if (breach.type === 'ticket' && !prefs.notifyTicketFirstResponse && !prefs.notifyTicketResolution)
    return false;
  return true;
};

// The REST row is the generated backend Notification contract.
type NotificationRow = Notification;

// P3 leak-guard: arrival kinds (suspicious/spam) live in the SAME notifications table
// but are NOT SLA breaches — they belong to the Suspicious/Spam Kanban badges (P2) and
// the unified Notification Center (P3), not this SLA bell. Both the REST list and the
// `sla_breach` WS event carry every kind, so without this guard an arrival row renders
// as an amber "breach" with no breach info. Exclude by kind. Fail-open: a missing/unknown
// kind still shows, so a real breach can never be hidden by this filter.
// `kb_document_stale` joins them for the same reason `ai_provider_down` did: it has its own
// surface (useStaleKbAlerts + the Knowledge base section) and is not a breach of anything,
// so leaving it to the fail-open filter would render it as an amber SLA row.
const NON_SLA_BELL_KINDS = new Set([
  'suspicious_arrival',
  'spam_arrival',
  'ai_provider_down',
  'kb_document_stale',
  // Both own their surface in useUnansweredOutboundAlerts. Without these two entries the
  // fail-open filter renders them as amber SLA breaches with no breach fields — the exact
  // failure this set was created for.
  'one_sided_outbound',
  'customer_reply_in_spam',
  // Same reason, and this one was OBSERVED failing on staging 2026-09-10: a real
  // `ingestion_gap` row rendered here as a generic amber "Notification" reading "nullm over",
  // because the kind carries no `minutesOverdue`. It owns its surface in useIngestionGapAlerts.
  'ingestion_gap',
  // Same reason again, and the same failure shape: this kind carries no `minutesOverdue`, so
  // the fail-open filter would render a dark mailbox as an amber SLA breach reading
  // "nullm over". It owns its surface in useIngestionDarkAlerts.
  'ingestion_dark',
  // A KB capture waiting for review: no breach fields, own surface in useKbReviewAlerts.
  'kb_review_pending',
  // KB merge proposals waiting for review (#873): no breach fields, own surface in
  // useKbReviewAlerts (the same hook as the capture reviews).
  'kb_consolidation_pending',
  // A daily AI token limit reached: no breach fields, own surface in useTokenLimitAlerts.
  'ai_token_limit_reached',
  // #957: addressed to one person (an assignment, new unassigned mail) with no breach fields; own
  // surface in useWorkAlerts + WorkAlertsSection.
  'conversation_assigned',
  'new_unassigned_message',
  'hold_recheck_due',
  'conversation_reopened',
  'customer_message_on_assigned',
]);
const isNonSlaBellKind = (kind: unknown): boolean =>
  typeof kind === 'string' && NON_SLA_BELL_KINDS.has(kind);
/**
 * Sent as `?excludeKinds=`: the server leaves these out of the rows, `total` and `unreadTotal`, so
 * the badge is EXACT (every unread row this section shows, not the unread rows that happened to
 * land on the 20-row page) and nothing another section counts is counted here too. An older
 * server ignores the parameter; the client filter above still applies and the page count stays.
 */
export const SLA_BELL_EXCLUDE_KINDS = [...NON_SLA_BELL_KINDS].join(',');
/** Socket-driven re-reads inside this window join one request. */
export const SLA_RECOUNT_MS = 500;

export type UseSLANotificationsResult = ReturnType<typeof useSLANotifications>;

export const useSLANotifications = () => {
  const [notifications, setNotifications] = useState<SLABreachNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [total, setTotal] = useState(0);
  const [onlyAssignedToMe, setOnlyAssignedToMeState] = useState(false);
  const [fetchError, setFetchError] = useState(false);
  // "Only mine" can be fixed by the admin (a locked line): the control is disabled, and a change
  // the server refuses anyway (409) is reverted with a notice instead of silently.
  const [onlyMineLocked, setOnlyMineLocked] = useState(false);
  const [onlyMineNotice, setOnlyMineNotice] = useState<string | null>(null);
  // Tracks the highest severity surfaced per notification id. The BE
  // deliberately re-delivers a warning→critical escalation reusing the SAME
  // notifications.id; deduping on id alone dropped it (bell stayed "warning",
  // unreadCount never bumped). Storing severity lets us detect the escalation.
  const seenSeverity = useRef<Map<number, 'warning' | 'critical'>>(new Map());
  // Synchronous mirror of `notifications` so the socket handler can read a
  // notification's current read-state without nesting setState calls.
  const notificationsRef = useRef<SLABreachNotification[]>([]);
  // Unread rows the server counted beyond the loaded page (its `unreadTotal` minus the page's
  // unread). A read or removal of a row NOT in the list can only be reflected by re-reading while
  // this is above zero; at zero the list holds every unread row and the live -1 is exact.
  const unreadBeyondRef = useRef(0);
  const prefsRef = useRef<UserPrefs>(DEFAULT_PREFS);
  const linesRef = useRef<SettingsLine[]>([]);
  // BE `notificationsController` honours X-Department-Context. Force callback
  // identity to change on dept toggle so consumer effects re-fetch in scope.
  const selectedDeptKey = useDepartmentContextKey();
  // Same for ORGANIZATION: the list is org-scoped server-side (X-Organization-Context,
  // set by apiClient from selectedOrganizationId). Without this trigger a global admin
  // switching orgs kept seeing the previous org's SLA breaches / arrivals — the react-query
  // counts hook re-keys on org, but this hook is plain useState and would go stale.
  const orgKey = useAuthStore(
    (state) => state.selectedOrganizationId ?? state.user?.organizationId ?? null
  );

  const fetchNotifications = useCallback(() => {
    apiClient
      .get('/api/notifications', { params: { excludeKinds: SLA_BELL_EXCLUDE_KINDS } })
      .then((res) => {
        const payload = (
          res.data as {
            data: { notifications: NotificationRow[]; total: number; unreadTotal?: number };
          }
        ).data;
        // Drop arrival kinds — this is the SLA bell, not the unified center (P3 guard).
        const rows = payload.notifications.filter(
          (row) => !isNonSlaBellKind((row as { kind?: string }).kind)
        );
        // total counts all kinds server-side; subtract the arrivals we filtered off this
        // page so the bell's count doesn't include them.
        const totalCount = payload.total - (payload.notifications.length - rows.length);
        const loaded: SLABreachNotification[] = rows.map((row) => ({
          id: row.id,
          entityId: row.entityId,
          type: row.entityType,
          organizationId: row.organizationId,
          // ⚠️ `notifications.severity` and `breachAmount` are NULLABLE in the database — the
          // column carries a value for SLA kinds only. This file's type said otherwise, and the
          // generated contract was stale enough to agree with it. Regenerating surfaced the
          // mismatch; a null severity now falls back to 'warning' rather than being asserted away,
          // which is the quieter of the two states and matches how the filter already treats it.
          severity: row.severity ?? 'warning',
          breachAmount: row.breachAmount ?? 0,
          details: row.details,
          createdAt: row.createdAt,
          receivedAt: Date.now(),
          isRead: row.isRead ?? false,
        }));
        seenSeverity.current = new Map(loaded.map((notif) => [notif.id, notif.severity]));
        notificationsRef.current = loaded;
        setNotifications(loaded);
        setTotal(totalCount);
        // Exact when the server sent `unreadTotal` (and honoured excludeKinds — no row dropped
        // above); otherwise the page's own count, as before.
        const unreadOnPage = loaded.filter((notif) => !notif.isRead).length;
        unreadBeyondRef.current = unreadBeyondPage(payload, rows.length, unreadOnPage);
        setUnreadCount(unreadOnPage + unreadBeyondRef.current);
        setFetchError(false);
      })
      .catch(() => {
        setFetchError(true);
      });
    // selectedDeptKey + orgKey are refresh triggers (both read via the axios
    // interceptor headers, not as args) — changing either re-fetches in the new scope.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDeptKey, orgKey]);

  const setOnlyMine = useCallback(
    (value: boolean) => {
      if (linesRef.current.some((line) => line.key === 'onlyAssignedToMe' && line.locked)) return;
      setOnlyMineNotice(null);
      const previousValue = prefsRef.current.onlyAssignedToMe;
      setOnlyAssignedToMeState(value);
      prefsRef.current = { ...prefsRef.current, onlyAssignedToMe: value };
      apiClient
        .put('/api/users/me/notification-preferences', { onlyAssignedToMe: value })
        .then(() => {
          invalidateSharedFetch(notificationPrefsFetchKey(orgKey));
          fetchNotifications();
        })
        .catch((err: unknown) => {
          // Roll back to last server-confirmed state, not the negation of the argument
          setOnlyAssignedToMeState(previousValue);
          prefsRef.current = { ...prefsRef.current, onlyAssignedToMe: previousValue };
          // The api-client interceptor rethrows an Error carrying `status`.
          const status = (err as { status?: number } | null)?.status;
          if (status === 409) {
            setOnlyMineLocked(true);
            linesRef.current = linesRef.current.map((line) =>
              line.key === 'onlyAssignedToMe' ? { ...line, locked: true } : line
            );
            setOnlyMineNotice('Set by your admin. This was not changed.');
          } else {
            setOnlyMineNotice('Could not save that change.');
          }
        });
    },
    [fetchNotifications, orgKey]
  );

  // Load user preferences
  useEffect(() => {
    // Shared and held for a minute: Layout mounts this on every navigation (see sharedFetch).
    let cancelled = false;
    setOnlyMineNotice(null);
    sharedFetch(
      notificationPrefsFetchKey(orgKey),
      () => fetchNotificationSettings(),
      60_000
    )
      .then((settings: NotificationSettings) => {
        if (cancelled) return;
        // Old backend: the service already fell back to the legacy GET (same fields as before).
        linesRef.current = settings.lines;
        setOnlyMineLocked(
          settings.lines.some((line) => line.key === 'onlyAssignedToMe' && line.locked)
        );
        prefsRef.current = prefsFromLines(settings.lines);
        setOnlyAssignedToMeState(prefsRef.current.onlyAssignedToMe);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [orgKey]);

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
  // A coalesced re-read: a bulk change sends many events, one request answers them all.
  const recountTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleRecount = useCallback(() => {
    if (recountTimer.current !== null) return;
    recountTimer.current = setTimeout(() => {
      recountTimer.current = null;
      fetchNotifications();
    }, SLA_RECOUNT_MS);
  }, [fetchNotifications]);
  useEffect(
    () => () => {
      if (recountTimer.current !== null) clearTimeout(recountTimer.current);
      recountTimer.current = null;
    },
    []
  );

  // Saved settings change which rows this section may count (a kind off, only mine): re-read.
  useEffect(() => {
    window.addEventListener(NOTIFICATION_SETTINGS_CHANGED_EVENT, fetchNotifications);
    return () => window.removeEventListener(NOTIFICATION_SETTINGS_CHANGED_EVENT, fetchNotifications);
  }, [fetchNotifications]);

  useEffect(() => {
    getSocket();

    const handleBreach = (data: unknown) => {
      // Arrival kinds also emit `sla_breach` (shared notify path) — ignore them here (P3 guard).
      if (isNonSlaBellKind((data as { kind?: string }).kind)) return;
      const breach = data as Omit<SLABreachNotification, 'receivedAt'>;
      if (!matchesPrefs(breach, prefsRef.current, linesRef.current)) return;

      const disposition = classifyBreach(seenSeverity.current.get(breach.id), breach.severity);
      if (disposition === 'duplicate') return;
      const existing = notificationsRef.current.find((notif) => notif.id === breach.id);
      // A row NOT in the list while the server counted unread rows beyond the page: it may be one
      // of them (an escalation keeps its id, and `seenSeverity` only knows the loaded page), and
      // then it is already in the count. Only the server can tell, so re-read instead of +1.
      const countUnknown = !existing && unreadBeyondRef.current > 0;
      if (countUnknown) scheduleRecount();
      if (disposition === 'escalation') {
        seenSeverity.current.set(breach.id, breach.severity);

        // Re-surface: update severity/breachAmount in place, mark unread, move
        // to top. Bump unreadCount only if it was previously read (or has since
        // been evicted from the list) so an already-unread item isn't counted twice.
        // The +1 is a guess: the server drops a row's read marks only for a NEW occurrence, not for
        // an escalation, so it may still count this row as read. Show the +1 at once, then settle to
        // the server's number with one coalesced re-read (no request unless a read row escalated).
        if (!countUnknown && (!existing || existing.isRead)) {
          setUnreadCount((prev) => prev + 1);
          scheduleRecount();
        }
        setNotifications((prev) => {
          const rest = prev.filter((notif) => notif.id !== breach.id);
          const updated: SLABreachNotification = existing
            ? {
                ...existing,
                severity: breach.severity,
                breachAmount: breach.breachAmount,
                receivedAt: Date.now(),
                isRead: false,
              }
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
      const notification: SLABreachNotification = {
        ...breach,
        receivedAt: Date.now(),
        isRead: false,
      };
      setNotifications((prev) => [notification, ...prev]);
      if (countUnknown) return; // the re-read above sets both counts
      setUnreadCount((prev) => prev + 1);
      // W2-M26: a genuinely-new breach is a new persisted notification row, so the
      // total count must grow alongside unreadCount (dismiss/clearAll already adjust
      // total). The escalation branch reuses an existing id → total is unchanged there.
      setTotal((prev) => prev + 1);
    };

    // Sync read state from another device/tab for the same user.
    // W1-L41: the BE emits notification:read to the WHOLE user room, INCLUDING the tab
    // that just made the /read request (which already decremented optimistically in
    // markRead). Decrement here only if the item was still unread in our state, so the
    // self-echo (and any duplicate echo) can't double-count. Mirrors dismiss()'s pattern.
    const handleNotificationRead = (data: unknown) => {
      const { notificationId, kind } = data as { notificationId: number; kind?: unknown };
      // A read of a kind this section never lists (arrival reads reach the whole workspace, a
      // work-alert read this user's tabs): not ours, and never a reason to re-read. A payload
      // without `kind` (older backend) falls through.
      if (isNonSlaBellKind(kind)) return;
      // A row beyond the loaded page: only the server knows whether it was an unread one of ours.
      if (
        unreadBeyondRef.current > 0 &&
        !notificationsRef.current.some((notif) => notif.id === notificationId)
      ) {
        scheduleRecount();
        return;
      }
      setNotifications((prev) => {
        const target = prev.find((notif) => notif.id === notificationId);
        if (target && !target.isRead) {
          setUnreadCount((count) => Math.max(0, count - 1));
        }
        return prev.map((notif) =>
          notif.id === notificationId ? { ...notif, isRead: true } : notif
        );
      });
    };

    // Mark-all-read from another device/tab for the same user — zero out locally too.
    // R23: a kind-filtered read-all (the personal work alerts) echoes `{ kind }`; it is not ours.
    const handleNotificationReadAll = (data?: unknown) => {
      if (isNonSlaBellKind((data as { kind?: unknown } | undefined)?.kind)) return;
      setNotifications((prev) => prev.map((notif) => ({ ...notif, isRead: true })));
      unreadBeyondRef.current = 0;
      setUnreadCount(0);
    };

    // A conversation was deleted → the BE dropped its SLA notification. Remove it from the
    // bell in realtime (previously it lingered until a reload/reconnect refetch).
    const handleNotificationRemoved = (data: unknown) => {
      const { conversationIds } = data as { conversationIds: number[] };
      if (!conversationIds?.length) return;
      // Removed rows may sit beyond the page too: re-read so the count drops for them as well.
      if (unreadBeyondRef.current > 0) scheduleRecount();
      const removedSet = new Set(conversationIds);
      const matches = (notif: SLABreachNotification) =>
        (notif.type === 'message' || notif.type === 'conversation') &&
        removedSet.has(notif.entityId);
      setNotifications((prev) => {
        const gone = prev.filter(matches);
        if (gone.length === 0) return prev;
        const unreadGone = gone.filter((notif) => !notif.isRead).length;
        if (unreadGone > 0) setUnreadCount((count) => Math.max(0, count - unreadGone));
        setTotal((count) => Math.max(0, count - gone.length));
        return prev.filter((notif) => !matches(notif));
      });
    };

    // Re-fetch on reconnect to recover notifications missed during the disconnection gap
    const handleReconnect = () => {
      fetchNotifications();
    };

    subscribeToEvent('sla_breach', handleBreach);
    subscribeToEvent('notification:read', handleNotificationRead);
    subscribeToEvent('notification:read-all', handleNotificationReadAll);
    subscribeToEvent('notification:removed', handleNotificationRemoved);
    subscribeToEvent('connect', handleReconnect);
    return () => {
      unsubscribeFromEvent('sla_breach', handleBreach);
      unsubscribeFromEvent('notification:read', handleNotificationRead);
      unsubscribeFromEvent('notification:read-all', handleNotificationReadAll);
      unsubscribeFromEvent('notification:removed', handleNotificationRemoved);
      unsubscribeFromEvent('connect', handleReconnect);
      releaseSocket();
    };
  }, [fetchNotifications, scheduleRecount]);

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

  // Settles once the server has answered, so a caller can re-read what dismiss-all touched.
  const clearAll = useCallback((): Promise<void> => {
    // Re-read once the server answered: "Clear all" leaves some rows standing (a KB review, the
    // token-limit notice, rows a non-admin may not dismiss), and they still count.
    const done = apiClient
      .patch('/api/notifications/dismiss-all')
      .then(() => {})
      .catch(() => {})
      .then(() => fetchNotifications());
    // Don't clear seenSeverity — dismissed IDs must stay tracked so re-broadcast
    // socket events don't re-add them immediately after dismiss-all.
    setNotifications([]);
    setTotal(0);
    unreadBeyondRef.current = 0;
    setUnreadCount(0);
    return done;
  }, [fetchNotifications]);

  const markRead = useCallback((id: number) => {
    apiClient.patch(`/api/notifications/${id}/read`).catch(() => {});
    setNotifications((prev) =>
      prev.map((notif) => (notif.id === id ? { ...notif, isRead: true } : notif))
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));
  }, []);

  const markAllRead = useCallback(() => {
    // W1-M43/L43: persist to the BE (was state-only, so a refresh resurrected the badge).
    // Optimistic update with rollback — don't swallow the failure and leave the UI lying.
    // Read-all marks every visible row, the ones beyond the page included: zero is exact.
    const snapshot = notificationsRef.current;
    const beyondSnapshot = unreadBeyondRef.current;
    setNotifications((prev) => prev.map((notif) => ({ ...notif, isRead: true })));
    unreadBeyondRef.current = 0;
    setUnreadCount(0);
    apiClient.patch('/api/notifications/read-all').catch(() => {
      setNotifications(snapshot);
      unreadBeyondRef.current = beyondSnapshot;
      setUnreadCount(snapshot.filter((notif) => !notif.isRead).length + beyondSnapshot);
    });
  }, []);

  return {
    notifications,
    total,
    unreadCount,
    fetchError,
    onlyAssignedToMe,
    setOnlyMine,
    onlyMineLocked,
    onlyMineNotice,
    clearAll,
    dismiss,
    markRead,
    markAllRead,
  };
};
