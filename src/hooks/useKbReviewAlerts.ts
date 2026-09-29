import { useCallback, useEffect, useRef, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { getApiErrorMessage } from '@/lib/errorMessages';
import { KB_CONSOLIDATION_DECIDED_EVENT } from '@/lib/kbConsolidation';
import {
  getSocket,
  releaseSocket,
  subscribeToEvent,
  unsubscribeFromEvent,
} from '@/lib/socketManager';
import { learningService } from '@/services/learning.service';
import { useAuthStore } from '@/stores/authStore';
import type { Notification } from '@/types/api';

/**
 * "Support saved this thread to the knowledge base — approve or reject it."
 *
 * The backend raises one `kb_review_pending` row per capture (a "Resolve & Save to KB", or a
 * promote by someone who may not approve) and shows it ONLY to members who may review the KB,
 * scoped to the thread's department. Before this, a capture was stored unapproved and nobody was
 * told, so the AI never used it.
 *
 * Approve / Reject act on the REVIEW (a learning suggestion), not on one entry: one capture is
 * one decision. The backend retires the row either way and says so on `notification:resolved`.
 *
 * ⚠️ Mirrors `useStaleKbAlerts`: the SLA bell is fail-open, so this kind is listed in
 * `NON_SLA_BELL_KINDS` and this hook owns it.
 */
export const KB_REVIEW_KIND = 'kb_review_pending';

/**
 * KB consolidation (#873): ONE standing row per department summarising the merge proposals
 * still pending there (`details.pending`). The backend hides it from anyone without
 * manage_knowledge_base and retires it when the last proposal is decided. Unlike a capture,
 * it is not decided from the bell — a merge needs the side-by-side review.
 */
export const KB_CONSOLIDATION_KIND = 'kb_consolidation_pending';

export type KbConsolidationAlert = {
  /** notifications.id */
  id: number;
  departmentId: number | null;
  suggestionIds: number[];
  pending: number;
};

/**
 * The backend writes ONE bell row per active department for an org-wide proposal, so the same
 * set of proposals can arrive several times. Show it once — not tied to any one department —
 * so an org admin does not see N identical rows and a +N badge.
 */
const dedupeBySuggestions = (rows: KbConsolidationAlert[]): KbConsolidationAlert[] => {
  const bySet = new Map<string, KbConsolidationAlert>();
  for (const row of rows) {
    const key = row.suggestionIds.length ? row.suggestionIds.join(',') : `row:${row.id}`;
    const seen = bySet.get(key);
    if (!seen) bySet.set(key, row);
    else if (seen.departmentId !== row.departmentId)
      bySet.set(key, { ...seen, departmentId: null });
  }
  return [...bySet.values()];
};

const toConsolidationAlert = (row: Notification): KbConsolidationAlert => {
  const details = (row.details ?? {}) as { suggestionIds?: unknown; pending?: unknown };
  const suggestionIds = Array.isArray(details.suggestionIds)
    ? details.suggestionIds
        .filter((value): value is number => typeof value === 'number')
        .sort((left, right) => left - right)
    : [];
  return {
    id: row.id,
    departmentId: row.departmentId ?? null,
    suggestionIds,
    pending: typeof details.pending === 'number' ? details.pending : suggestionIds.length,
  };
};

export type KbReviewAlert = {
  /** notifications.id */
  id: number;
  /** learning_suggestions.id — what Approve / Reject act on. */
  suggestionId: number;
  conversationId: number | null;
  conversationPublicId: string | null;
  subject: string | null;
  entryCount: number;
  capturedVia: 'resolve' | 'manual_promote' | null;
};

type AlertDetails = {
  suggestionId?: number;
  conversationId?: number;
  conversationPublicId?: string | null;
  subject?: string | null;
  entryCount?: number;
  capturedVia?: 'resolve' | 'manual_promote';
};

const toAlert = (row: Notification): KbReviewAlert => {
  const details = (row.details ?? {}) as AlertDetails;
  return {
    id: row.id,
    suggestionId: typeof details.suggestionId === 'number' ? details.suggestionId : row.entityId,
    conversationId: typeof details.conversationId === 'number' ? details.conversationId : null,
    conversationPublicId: details.conversationPublicId ?? null,
    subject: details.subject ?? null,
    entryCount: typeof details.entryCount === 'number' ? details.entryCount : 1,
    capturedVia: details.capturedVia ?? null,
  };
};

export type UseKbReviewAlertsResult = ReturnType<typeof useKbReviewAlerts>;

export const useKbReviewAlerts = () => {
  const [alerts, setAlerts] = useState<KbReviewAlert[]>([]);
  const [consolidations, setConsolidations] = useState<KbConsolidationAlert[]>([]);
  const [actingId, setActingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const orgKey = useAuthStore(
    (state) => state.selectedOrganizationId ?? state.user?.organizationId ?? null
  );

  // Only the newest request of each list may write: a slow reply for the workspace just left
  // must not land on the one switched to.
  const reviewsRequest = useRef(0);
  const consolidationsRequest = useRef(0);

  const fetchReviews = useCallback(() => {
    const requestId = ++reviewsRequest.current;
    apiClient
      // Name the kind: the unfiltered list is the newest 20 rows across ALL kinds, and an SLA
      // feed would push a review off the bell within a day (see useStaleKbAlerts).
      .get('/api/notifications', { params: { kind: KB_REVIEW_KIND } })
      .then((res) => {
        if (requestId !== reviewsRequest.current) return;
        const payload = (res.data as { data: { notifications: Notification[] } }).data;
        setAlerts(
          payload.notifications
            .filter((row) => (row as { kind?: string }).kind === KB_REVIEW_KIND)
            .map(toAlert)
        );
      })
      // A failed poll must not clear standing reviews — empty would read as "nothing to review".
      .catch(() => {});
  }, []);

  const fetchConsolidations = useCallback(() => {
    const requestId = ++consolidationsRequest.current;
    apiClient
      .get('/api/notifications', { params: { kind: KB_CONSOLIDATION_KIND } })
      .then((res) => {
        if (requestId !== consolidationsRequest.current) return;
        const payload = (res.data as { data: { notifications: Notification[] } }).data;
        setConsolidations(
          dedupeBySuggestions(
            payload.notifications
              .filter((row) => (row as { kind?: string }).kind === KB_CONSOLIDATION_KIND)
              .map(toConsolidationAlert)
              // A row that says nothing is pending is not a request to anyone.
              .filter((alert) => alert.pending > 0)
          )
        );
      })
      .catch(() => {});
  }, []);

  const fetchAlerts = useCallback(() => {
    fetchReviews();
    fetchConsolidations();
  }, [fetchReviews, fetchConsolidations]);

  // A workspace switch: the other workspace's rows go at once, not when the new reply lands.
  useEffect(() => {
    setAlerts([]);
    setConsolidations([]);
    fetchAlerts();
  }, [fetchAlerts, orgKey]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    // Every backend emit of these events names its kind (notifyProcessor, notificationBus). Re-read
    // only the list it concerns: one request per event, none for the SLA / arrival traffic that
    // makes up most of the stream — and none for an event that names no kind.
    // `notification:updated` = a standing row changed in place (the merge row re-counted).
    const onChange = (data: unknown) => {
      const kind = (data as { kind?: unknown } | null)?.kind;
      if (kind === KB_REVIEW_KIND) fetchReviews();
      else if (kind === KB_CONSOLIDATION_KIND) fetchConsolidations();
    };
    const events = ['notification:new', 'notification:resolved', 'notification:updated'];
    for (const event of events) subscribeToEvent(event, onChange);
    return () => {
      for (const event of events) unsubscribeFromEvent(event, onChange);
      releaseSocket();
    };
  }, [fetchAlerts, fetchReviews, fetchConsolidations]);

  // A merge decided in this tab (the merges page, the settings inbox) re-counts at once, even
  // when the socket that would carry the server's own announcement is down.
  useEffect(() => {
    window.addEventListener(KB_CONSOLIDATION_DECIDED_EVENT, fetchConsolidations);
    return () => window.removeEventListener(KB_CONSOLIDATION_DECIDED_EVENT, fetchConsolidations);
  }, [fetchConsolidations]);

  /**
   * Approve = the AI may quote these entries. Reject = hidden now, deleted after 90 days. The
   * row leaves the list only once the server has taken the decision; on a failure it stays,
   * with the reason, rather than vanishing as if it had worked.
   */
  const decide = useCallback(async (alert: KbReviewAlert, decision: 'approve' | 'reject') => {
    setActingId(alert.id);
    setError(null);
    try {
      if (decision === 'approve') await learningService.acceptSuggestion(alert.suggestionId);
      else await learningService.declineSuggestion(alert.suggestionId);
      setAlerts((current) => current.filter((row) => row.id !== alert.id));
    } catch (err) {
      setError(
        getApiErrorMessage(err) ??
          (decision === 'approve'
            ? 'Could not approve — try again.'
            : 'Could not reject — try again.')
      );
    } finally {
      setActingId(null);
    }
  }, []);

  // What the bell counts: one per capture review, one per department's merge summary row.
  const rowCount = alerts.length + consolidations.length;

  return { alerts, consolidations, rowCount, decide, actingId, error, refresh: fetchAlerts };
};
