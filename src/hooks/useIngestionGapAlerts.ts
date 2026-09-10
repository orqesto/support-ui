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
 * "Mail may be missing" — the ONLY signal in the product that reports mail we do NOT have.
 *
 * ⛔ Why it needs a surface of its own, and why that is not a nicety. On taco, 2026-09-08, a
 * sender's `Date:` header carried the Gmail checkpoint 25 hours into the future; every later
 * poll asked Gmail for mail newer than a day that had not happened, and nine hours of a live
 * client mailbox — a customer's refund request among it — fell outside every query. It ran
 * for fourteen hours and NOTHING showed it, because every other ingestion signal (queue depth,
 * failure counts, connection state, `last_check_at`) describes mail we DID take. They all read
 * healthy throughout.
 *
 * ⚠️ Mirrors `useStaleKbAlerts` deliberately, for the reason that hook gives: the SLA bell is
 * fail-OPEN, so any kind without a surface of its own renders there as an amber "breach" with
 * no breach fields. Verified on staging 2026-09-10 before this hook existed — a real
 * `ingestion_gap` row rendered under SLA BREACHES as a generic "Notification" reading
 * **"nullm over"**, because `minutesOverdue` is absent on it. `NON_SLA_BELL_KINDS` excludes
 * this kind and this hook owns it.
 *
 * 🔑 Keyed on the MESSAGE SOURCE, not a conversation: the subject is the mailbox, and there is
 * by definition no conversation to point at — the whole point is the mail we never received.
 */
export const INGESTION_GAP_KIND = 'ingestion_gap';

export type IngestionGapAlert = {
  id: number;
  /** `message_sources.id` — the mailbox with the hole in it. */
  messageSourceId: number;
  mailbox: string;
  /** 'checkpoint_ahead' | 'source_stopped_polling' | another cause the backend names. */
  cause: string;
  /** How far ahead the stored checkpoint was, in minutes. Null when the cause is not skew. */
  minutesAhead: number | null;
  /** Human-readable blind window, e.g. "2026-09-10T07:58Z → 2026-09-11T08:58Z". */
  window: string | null;
  /** What the backend is already doing about it, in its own words. */
  recovery: string | null;
};

type AlertDetails = {
  mailbox?: string;
  cause?: string;
  minutesAhead?: number;
  window?: string;
  recovery?: string;
};

const toAlert = (row: Notification): IngestionGapAlert => {
  const details = (row.details ?? {}) as AlertDetails;
  return {
    id: row.id,
    messageSourceId: row.entityId,
    mailbox: details.mailbox ?? 'this mailbox',
    cause: details.cause ?? 'unknown',
    // ⚠️ `typeof === 'number'`, not `?? null`: 0 is a legitimate value (a gap detected with no
    // measurable skew) and must not be rewritten to null, which the UI renders as "unknown".
    minutesAhead: typeof details.minutesAhead === 'number' ? details.minutesAhead : null,
    window: details.window ?? null,
    recovery: details.recovery ?? null,
  };
};

export type UseIngestionGapAlertsResult = ReturnType<typeof useIngestionGapAlerts>;

export const useIngestionGapAlerts = () => {
  const [alerts, setAlerts] = useState<IngestionGapAlert[]>([]);
  const orgKey = useAuthStore(
    (state) => state.selectedOrganizationId ?? state.user?.organizationId ?? null
  );

  const fetchAlerts = useCallback(() => {
    // ⛔ `?kind=` — NOT the shared page filtered client-side, which is what every sibling hook
    // does and what this hook did first. `GET /api/notifications` serves the newest 20 rows
    // across ALL kinds: on a workspace carrying 20 standing SLA breaches, an ingestion gap is
    // absent from the payload entirely and this section renders NOTHING. `useUnansweredOutbound
    // Alerts` lives with that and exposes `truncated` so the UI does not over-claim, a fair
    // trade for a thread still sitting in the queue. It is not a fair trade here: this is the
    // one alert about mail we do NOT have, and a silent one reproduces the exact fourteen-hour
    // blackout it exists to end. notificationsController takes `?kind=` (it applies to list,
    // counts and read-all), so ask for the one kind and the crowd-out cannot happen.
    apiClient
      .get('/api/notifications', { params: { kind: INGESTION_GAP_KIND } })
      .then((res) => {
        const payload = (res.data as { data: { notifications: Notification[]; total: number } })
          .data;
        setAlerts(
          payload.notifications
            // Belt and braces: the server filters. A server that ignored the param would
            // otherwise hand this section every kind in the bell.
            .filter((row) => (row as { kind?: string }).kind === INGESTION_GAP_KIND)
            .map(toAlert)
            // Worst skew first — the biggest hole is the one to act on.
            .sort((left, right) => (right.minutesAhead ?? 0) - (left.minutesAhead ?? 0))
        );
      })
      // A failed poll must not clear standing alerts: an empty list would read as "no mail is
      // missing any more", which is not what a network error means.
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
   * Dismiss one row. The backend re-raises while the condition persists, so this is "not now",
   * not "the mail is accounted for". Only the checkpoint healing actually clears it.
   */
  const dismiss = useCallback((id: number) => {
    setAlerts((current) => current.filter((alert) => alert.id !== id));
    apiClient.patch(`/api/notifications/${id}/dismiss`).catch(() => {});
  }, []);

  return { alerts, dismiss, refresh: fetchAlerts };
};
