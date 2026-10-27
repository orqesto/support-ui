// src/hooks/useWorkAlerts.ts
import { useCallback, useEffect, useRef, useState } from 'react';
import { useDepartmentContextKey } from '@/hooks/useDepartmentContextKey';
import { apiClient } from '@/lib/api-client';
import {
  getSocket,
  releaseSocket,
  subscribeToEvent,
  unsubscribeFromEvent,
} from '@/lib/socketManager';
import { useAuthStore } from '@/stores/authStore';
import type { Notification } from '@/types/api';
import { fetchNotificationsOfKind } from '@/services/notificationsByKind.service';

/**
 * #957 — the two notification kinds addressed to ONE person: "assigned to you" and "new unassigned
 * message" in your department. The backend lists, delivers and dismisses them per user, and returns
 * them ONLY when asked for by name (R18); this hook only renders what it is given. Excluded from the
 * SLA bell (NON_SLA_BELL_KINDS), owned here.
 */
export const CONVERSATION_ASSIGNED_KIND = 'conversation_assigned';
export const NEW_UNASSIGNED_MESSAGE_KIND = 'new_unassigned_message';
/** An On-hold thread reached its recheck date — to its owner (contingency page, 2026-10-19). */
export const HOLD_RECHECK_KIND = 'hold_recheck_due';
/** Socket-driven refetches inside this window join one request (a bulk assignment sends N pings — R15). */
export const WORK_ALERTS_REFRESH_MS = 500;
export type WorkAlertKind =
  | typeof CONVERSATION_ASSIGNED_KIND
  | typeof NEW_UNASSIGNED_MESSAGE_KIND
  | typeof HOLD_RECHECK_KIND;
const KINDS: WorkAlertKind[] = [
  CONVERSATION_ASSIGNED_KIND,
  NEW_UNASSIGNED_MESSAGE_KIND,
  HOLD_RECHECK_KIND,
];

export type WorkAlert = {
  id: number;
  kind: WorkAlertKind;
  entityType: 'conversation' | 'ticket';
  entityId: number;
  subject: string;
  actorLabel: string | null;
  departmentName: string | null;
  /** hold_recheck_due: why it was on hold. */
  holdReason: string | null;
  isRead: boolean;
  createdAt: string;
};

type WorkDetails = {
  subject?: string;
  actor?: { label?: string };
  departmentName?: string | null;
  holdReason?: string | null;
};

export const toWorkAlert = (row: Notification): WorkAlert => {
  const details = (row.details ?? {}) as WorkDetails;
  const entityType =
    (row as { entityType?: string }).entityType === 'ticket' ? 'ticket' : 'conversation';
  return {
    id: row.id,
    kind: (row as { kind?: string }).kind as WorkAlertKind,
    entityType,
    entityId: row.entityId,
    subject: details.subject && details.subject.trim() !== '' ? details.subject : '(no subject)',
    actorLabel: details.actor?.label ?? null,
    departmentName: details.departmentName ?? null,
    holdReason:
      typeof details.holdReason === 'string' && details.holdReason.trim() !== ''
        ? details.holdReason
        : null,
    isRead: row.isRead ?? false,
    createdAt: (row as { createdAt?: string }).createdAt ?? '',
  };
};

export const workAlertText = (alert: WorkAlert): string => {
  if (alert.kind === CONVERSATION_ASSIGNED_KIND)
    return `Assigned to you by ${alert.actorLabel ?? 'a colleague'} — ${alert.subject}`;
  if (alert.kind === HOLD_RECHECK_KIND)
    return `Recheck${alert.holdReason ? `: ${alert.holdReason}` : ' — its hold ended'} — ${alert.subject}`;
  return `New unassigned thread in ${alert.departmentName ?? 'Needs routing'} — ${alert.subject}`;
};

export const workAlertHref = (alert: WorkAlert): string =>
  alert.entityType === 'ticket' ? `/tickets/${alert.entityId}` : `/threads/${alert.entityId}`;

export const workAlertTypeLabel = (kind: WorkAlertKind): string =>
  kind === CONVERSATION_ASSIGNED_KIND
    ? 'Assigned to you'
    : kind === HOLD_RECHECK_KIND
      ? 'Recheck'
      : 'New unassigned';

export type UseWorkAlertsResult = ReturnType<typeof useWorkAlerts>;

export const useWorkAlerts = () => {
  const [alerts, setAlerts] = useState<WorkAlert[]>([]);
  // The server's per-kind totals (LIMIT 20 per kind): "+N more" counts these, not the loaded rows.
  const [serverTotal, setServerTotal] = useState(0);
  // Only the newest request may write: an answer from before an org / department switch, or a refetch
  // started before a dismiss, must not overwrite newer state.
  const requestSeq = useRef(0);
  const orgKey = useAuthStore(
    (state) => state.selectedOrganizationId ?? state.user?.organizationId ?? null
  );
  // The backend narrows "new unassigned" by X-Department-Context (A6): re-fetch on a switch, as useSLANotifications does.
  const deptKey = useDepartmentContextKey();

  const refresh = useCallback(() => {
    // By name, one request per kind — the unfiltered list never carries these (BE R18).
    // Promise.all: a partial answer must not read as "nothing for you" — a failed poll keeps what is shown.
    requestSeq.current += 1;
    const seq = requestSeq.current;
    Promise.all(KINDS.map((kind) => fetchNotificationsOfKind(kind)))
      .then((responses) => {
        if (seq !== requestSeq.current) return;
        setServerTotal(
          responses.reduce(
            (sum, res) => sum + ((res.data as { data?: { total?: number } }).data?.total ?? 0),
            0
          )
        );
        const rows = responses.flatMap(
          (res) => (res.data as { data: { notifications: Notification[] } }).data.notifications
        );
        const seen = new Set<number>();
        setAlerts(
          rows
            .filter((row) => KINDS.includes((row as { kind?: string }).kind as WorkAlertKind))
            .filter((row) => (seen.has(row.id) ? false : (seen.add(row.id), true)))
            .map(toWorkAlert)
            .sort(
              // The backend reuses a row's id on re-raise / reassignment and only bumps createdAt.
              (left, right) =>
                Date.parse(right.createdAt) - Date.parse(left.createdAt) || right.id - left.id
            )
        );
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh, orgKey, deptKey]);

  // Coalesced like the inbox refresh (R15): the first ping schedules one refetch, later ones join it.
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const onChange = (data?: unknown) => {
      // The payloads of new / resolved / read-all carry the kind: another kind's ping is not ours.
      const kind = (data as { kind?: unknown } | undefined)?.kind;
      if (typeof kind === 'string' && !KINDS.includes(kind as WorkAlertKind)) return;
      if (pending.current !== null) return;
      pending.current = setTimeout(() => {
        pending.current = null;
        refresh();
      }, WORK_ALERTS_REFRESH_MS);
    };
    // `new` arrives in this user's room only (BE R13); resolved/updated/removed are content-free org pings, plus the
    // previous assignee's room on a reassignment (BE R17); read/read-all echo this user's other tabs; a route or
    // transfer moves "new unassigned" between departments (BE R8 superseded); `connect` re-syncs after a drop.
    const events = [
      'notification:new',
      'notification:resolved',
      'notification:updated',
      'notification:removed',
      'notification:read',
      'notification:read-all',
      'conversation:routed',
      'connect',
    ];
    for (const event of events) subscribeToEvent(event, onChange);
    return () => {
      for (const event of events) unsubscribeFromEvent(event, onChange);
      if (pending.current !== null) clearTimeout(pending.current);
      pending.current = null;
      releaseSocket();
    };
  }, [refresh]);

  const dismiss = useCallback(
    (id: number) => {
      requestSeq.current += 1; // a refetch already in flight predates this dismiss: drop its answer
      setAlerts((current) => current.filter((alert) => alert.id !== id));
      setServerTotal((current) => Math.max(0, current - 1));
      apiClient
        .patch(`/api/notifications/${id}/dismiss`)
        .then(() => refresh()) // the server now agrees; picks up what a dropped in-flight refetch carried
        .catch(() => {
          // A repeat dismiss of a personal row answers 404 (BE): already gone, so a success. Either way
          // re-read: on a failure the row comes back, on a 404 the server confirms it is gone.
          refresh();
        });
    },
    [refresh]
  );

  const open = useCallback(
    (alert: WorkAlert) => {
      setAlerts((current) =>
        current.map((item) => (item.id === alert.id ? { ...item, isRead: true } : item))
      );
      apiClient.patch(`/api/notifications/${alert.id}/read`).catch(refresh);
    },
    [refresh]
  );

  /** The bell's "Clear all": per user, by kind (BE R18 — the unfiltered dismiss-all never touches these). */
  const clearAll = useCallback(async (): Promise<void> => {
    requestSeq.current += 1;
    setAlerts([]);
    setServerTotal(0);
    await Promise.all(
      KINDS.map((kind) =>
        apiClient
          .patch('/api/notifications/dismiss-all', undefined, { params: { kind } })
          .catch(() => false as const)
      )
    ).then((results) => {
      // A failed write leaves rows on the server: put the list back to what it holds.
      if (results.includes(false)) refresh();
    });
  }, [refresh]);

  /** Opening the bell marks these read, by kind (BE R18 — the unfiltered read-all no longer reaches them). */
  const markAllRead = useCallback(() => {
    setAlerts((current) => current.map((item) => ({ ...item, isRead: true })));
    for (const kind of KINDS) {
      apiClient
        .patch('/api/notifications/read-all', undefined, { params: { kind } })
        .catch(refresh);
    }
  }, [refresh]);

  return {
    alerts,
    total: Math.max(serverTotal, alerts.length),
    unread: alerts.filter((alert) => !alert.isRead).length,
    dismiss,
    open,
    refresh,
    clearAll,
    markAllRead,
  };
};
