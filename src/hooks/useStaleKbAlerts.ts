import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { getSocket, releaseSocket, subscribeToEvent, unsubscribeFromEvent } from '@/lib/socketManager';
import { useAuthStore } from '@/stores/authStore';
import type { Notification } from '@/types/api';

/**
 * "This document has not changed in six months" — the KB's only push surface.
 *
 * Everything else that reports KB freshness has to be asked: the Confluence card's
 * "Synced 42 pages · 3 months ago", the Uploaded/Last-used dates, the serving facet that
 * exists because four stale documents kept serving a customer-facing KB unnoticed. Each
 * answers accurately. None of them ever speaks first.
 *
 * 🪤 A Confluence space that stopped being maintained renders GREEN — `lastSyncStatus`
 * stays 'success' and `lastSyncedAt` advances every 6h, because the sync really did
 * succeed and simply found nothing new. The backend therefore measures
 * `documentation.updatedAt` (the content clock), not sync time.
 *
 * ⛔ Nothing is disabled by this and nothing should be. A document unchanged for a year may
 * be perfectly correct; only a human can tell. This says so and stops there.
 *
 * ⚠️ Mirrors `useAiProviderAlerts` deliberately, for the same reason it exists: the SLA
 * bell is fail-open, so a kind with no surface of its own renders there as an amber
 * "breach" with no breach fields. `NON_SLA_BELL_KINDS` excludes this kind and this hook
 * owns it instead.
 */
export const KB_DOCUMENT_STALE_KIND = 'kb_document_stale';

export type StaleKbAlert = {
  id: number;
  /** `documentation.id` — what the row drills into. */
  documentId: number;
  title: string;
  /** 'confluence' | 'uploaded' | another external source. */
  source: string;
  /** Whole days since the content last changed. */
  staleForDays: number;
  publicId: string | null;
};

type AlertDetails = {
  title?: string;
  source?: string;
  staleForDays?: number;
  publicId?: string | null;
};

const toAlert = (row: Notification): StaleKbAlert => {
  const details = (row.details ?? {}) as AlertDetails;
  return {
    id: row.id,
    documentId: row.entityId,
    title: details.title ?? 'Untitled document',
    source: details.source ?? 'uploaded',
    staleForDays: typeof details.staleForDays === 'number' ? details.staleForDays : 0,
    publicId: details.publicId ?? null,
  };
};

export type UseStaleKbAlertsResult = ReturnType<typeof useStaleKbAlerts>;

export const useStaleKbAlerts = () => {
  const [alerts, setAlerts] = useState<StaleKbAlert[]>([]);
  const orgKey = useAuthStore(
    (state) => state.selectedOrganizationId ?? state.user?.organizationId ?? null
  );

  const fetchAlerts = useCallback(() => {
    apiClient
      /**
       * ⛔ Name the kind. The unfiltered call serves the newest 20 rows across ALL kinds, so
       * this alert competes for slots with an SLA breach feed that never stops. Measured on
       * the taco client box 2026-09-10: CoreSarms held 165 notifications and the endpoint
       * returned 20, and that window spanned ~28 h — so a stale knowledge-base document drops off the
       * bell in about a day and reaches the user on zero surfaces.
       * `useIngestionGapAlerts` already fetches this way; this hook did not.
       *
       * The `.filter()` below stays: it is what keeps a backend that ignored `?kind=` from
       * rendering every other kind as this one.
       */
      .get('/api/notifications', { params: { kind: KB_DOCUMENT_STALE_KIND } })
      .then((res) => {
        const payload = (
          res.data as { data: { notifications: Notification[]; total: number } }
        ).data;
        setAlerts(
          payload.notifications
            .filter((row) => (row as { kind?: string }).kind === KB_DOCUMENT_STALE_KIND)
            .map(toAlert)
            // Oldest first: if the list is long, the ones most worth looking at are on top.
            .sort((left, right) => right.staleForDays - left.staleForDays)
        );
      })
      // A failed poll must not clear standing alerts — an empty list would read as "all
      // documents are fresh again", which is not what a fetch error means.
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts, orgKey]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const onNew = () => fetchAlerts();
    subscribeToEvent('notification:new', onNew);
    return () => {
      unsubscribeFromEvent('notification:new', onNew);
      releaseSocket();
    };
  }, [fetchAlerts]);

  /**
   * Dismiss one row. The daily scan re-raises it while the document is still stale — which
   * is correct: dismissing is "not now", not "this document is fine forever". Editing the
   * document is what actually clears it, because that moves `updatedAt`.
   */
  const dismiss = useCallback((id: number) => {
    setAlerts((current) => current.filter((alert) => alert.id !== id));
    apiClient.patch(`/api/notifications/${id}/dismiss`).catch(() => {});
  }, []);

  return { alerts, dismiss, refresh: fetchAlerts };
};
