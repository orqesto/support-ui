import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { getApiErrorMessage } from '@/lib/errorMessages';
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
  const [actingId, setActingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const orgKey = useAuthStore(
    (state) => state.selectedOrganizationId ?? state.user?.organizationId ?? null
  );

  const fetchAlerts = useCallback(() => {
    apiClient
      // Name the kind: the unfiltered list is the newest 20 rows across ALL kinds, and an SLA
      // feed would push a review off the bell within a day (see useStaleKbAlerts).
      .get('/api/notifications', { params: { kind: KB_REVIEW_KIND } })
      .then((res) => {
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

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts, orgKey]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const onChange = () => fetchAlerts();
    subscribeToEvent('notification:new', onChange);
    subscribeToEvent('notification:resolved', onChange);
    return () => {
      unsubscribeFromEvent('notification:new', onChange);
      unsubscribeFromEvent('notification:resolved', onChange);
      releaseSocket();
    };
  }, [fetchAlerts]);

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

  return { alerts, decide, actingId, error, refresh: fetchAlerts };
};
