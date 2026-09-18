import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import {
  getSocket,
  releaseSocket,
  subscribeToEvent,
  unsubscribeFromEvent,
} from '@/lib/socketManager';
import { useAuthStore } from '@/stores/authStore';
import type { Notification } from '@/types/api';

/**
 * "This mailbox has stopped being polled" — a fault happening RIGHT NOW.
 *
 * ⛔ Why it exists. On 2026-09-17 a live client's Gmail poll died at 08:00:24Z and was still
 * dark 73 minutes later. Queues healthy, zero failed jobs, container healthy and never
 * restarted — and `/api/health/status` said "ingestion is not healthy … last polled 68 min
 * ago" in plain English the whole time. Nothing read it, and the outage was found because a
 * customer chased a refund. The backend now self-heals within 15 minutes AND announces, which
 * is the half that was missing: a signal only a human who thinks to curl an endpoint can see
 * is not an alert.
 *
 * ⚠️ NOT the same thing as `ingestion_gap`, and conflating them would mislead an operator.
 * `ingestion_gap` reports mail we do NOT have, from a window we can never go back for — a
 * historical fact that stays true after the cause is fixed, which is why dismissing it means
 * "I have checked that window". THIS one is a live condition that ends by itself the moment
 * polling resumes. Different sentence, different action, so: different surface.
 *
 * ⚠️ Mirrors `useIngestionGapAlerts` deliberately, including its two hard-won details:
 *   · `?kind=` on the request, never the shared 20-row page filtered client-side. On a
 *     workspace carrying 20 standing SLA breaches this alert would otherwise be absent from
 *     the payload entirely and the section would render NOTHING — reproducing the blackout it
 *     exists to end.
 *   · `NON_SLA_BELL_KINDS` must exclude this kind, or the fail-OPEN SLA bell renders it as an
 *     amber breach reading "nullm over". Observed on staging 2026-09-10 with `ingestion_gap`.
 *
 * 🔑 Keyed on the MESSAGE SOURCE: the subject is the mailbox itself, not any one thread.
 */
export const INGESTION_DARK_KIND = 'ingestion_dark';

export type IngestionDarkAlert = {
  id: number;
  /** `message_sources.id` — the mailbox that went quiet. */
  messageSourceId: number;
  mailbox: string;
  /**
   * Minutes since this source was last polled, or null when it has NEVER been polled.
   *
   * ⛔ Null is not zero, and the UI must not render it as "0 minutes". A source that has never
   * polled once has never worked at all — the case a newly connected integration hits — which
   * is why the backend files it as `critical` rather than as freshly dark.
   */
  minutesSince: number | null;
  neverPolled: boolean;
  /**
   * The mailbox is dark AND still holds its sync lock, so a previous run never released it.
   *
   * ⛔ This is the one case the automatic restart cannot fix: restarting polling does not
   * clear a lock another run holds, so the watchdog would restart it every 15 minutes for ever
   * while the mailbox stays dark. Surfacing it is the difference between "we are on it" and
   * "a human has to look".
   */
  locked: boolean;
  /** `warning` while newly dark, `critical` past the backend's threshold. */
  severity: string | null;
};

type AlertDetails = {
  sourceName?: string | null;
  minutesSince?: number | null;
  neverPolled?: boolean;
  locked?: boolean;
};

const toAlert = (row: Notification): IngestionDarkAlert => {
  const details = (row.details ?? {}) as AlertDetails;
  return {
    id: row.id,
    messageSourceId: row.entityId,
    mailbox: details.sourceName ?? 'this mailbox',
    // ⚠️ `typeof === 'number'`, not `?? null`: the distinction between "never polled" and
    // "polled recently" is the whole severity decision, and coercing either into the other
    // reports the worst case as the mildest.
    minutesSince: typeof details.minutesSince === 'number' ? details.minutesSince : null,
    neverPolled: details.neverPolled === true,
    locked: details.locked === true,
    severity: (row as { severity?: string | null }).severity ?? null,
  };
};

export type UseIngestionDarkAlertsResult = ReturnType<typeof useIngestionDarkAlerts>;

export const useIngestionDarkAlerts = () => {
  const [alerts, setAlerts] = useState<IngestionDarkAlert[]>([]);
  const orgKey = useAuthStore(
    (state) => state.selectedOrganizationId ?? state.user?.organizationId ?? null
  );

  const fetchAlerts = useCallback(() => {
    apiClient
      .get('/api/notifications', { params: { kind: INGESTION_DARK_KIND } })
      .then((res) => {
        const payload = (res.data as { data: { notifications: Notification[]; total: number } })
          .data;
        setAlerts(
          payload.notifications
            // Belt and braces: the server filters. A server that ignored the param would
            // otherwise hand this section every kind in the bell.
            .filter((row) => (row as { kind?: string }).kind === INGESTION_DARK_KIND)
            .map(toAlert)
            // Worst first. A mailbox that has NEVER polled outranks any elapsed time, because
            // it is not a delay — it has never worked.
            .sort((left, right) => {
              if (left.neverPolled !== right.neverPolled) return left.neverPolled ? -1 : 1;
              return (right.minutesSince ?? 0) - (left.minutesSince ?? 0);
            })
        );
      })
      // A failed poll must not clear standing alerts: an empty list would read as "polling
      // recovered", which is not what a network error means.
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
   * Dismiss one row.
   *
   * ⚠️ Dismissal here is genuinely "not now", NOT "I have checked it" — the opposite of the
   * gap alert's meaning. The condition may still be live when you dismiss it, and the backend
   * publishes this kind with a severity that ESCALATES (warning → critical past its
   * threshold), which re-surfaces a dismissed row. So a mailbox that stays dark comes back.
   * That is deliberate: `one_sided_outbound` has no such path, and four threads on taco sit
   * broken today with their alerts dismissed and nothing able to raise them again.
   */
  const dismiss = useCallback((id: number) => {
    setAlerts((current) => current.filter((alert) => alert.id !== id));
    apiClient.patch(`/api/notifications/${id}/dismiss`).catch(() => {});
  }, []);

  return { alerts, dismiss, refresh: fetchAlerts };
};
