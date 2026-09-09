import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { getSocket, releaseSocket, subscribeToEvent, unsubscribeFromEvent } from '@/lib/socketManager';
import { useAuthStore } from '@/stores/authStore';
import type { Notification } from '@/types/api';

/**
 * Two kinds that both mean "a message did not reach the person who should have seen it".
 *
 * `one_sided_outbound` — we sent mail and there is NO customer message in the thread, and
 * nobody picked it up in the app. These USED to be hidden in a global-admin-only lens, and
 * that is exactly how a chargeback negotiation and a delivery claim sat unowned for two days
 * on a live workspace. They are visible in the queue now, but visibility alone was never the
 * fix: a surface you must remember to look at does not get looked at — the KB review queue in
 * this product has been used 0 times out of 204. So they announce themselves here.
 *
 * `customer_reply_in_spam` — Google filed a reply as spam on a thread we already hold, and
 * the backend pulled it back in. Keyed on the MAILBOX, because the actionable fact is "this
 * mailbox's spam filter is eating customer replies", which is fixed in Google, not here.
 *
 * ⚠️ Mirrors `useStaleKbAlerts` deliberately, for the reason that hook gives: the SLA bell is
 * fail-OPEN, so any kind without a surface of its own renders there as an amber "breach" with
 * no breach fields. `NON_SLA_BELL_KINDS` excludes these two and this hook owns them.
 *
 * ⛔ Neither is a failure. One-sided outbound is frequently legitimate — proactive outreach, an
 * order confirmation. This says "nobody owns this / a reply was nearly lost" and stops there.
 */
export const ONE_SIDED_OUTBOUND_KIND = 'one_sided_outbound';
export const CUSTOMER_REPLY_IN_SPAM_KIND = 'customer_reply_in_spam';

export type UnansweredOutboundAlert = {
  id: number;
  kind: typeof ONE_SIDED_OUTBOUND_KIND | typeof CUSTOMER_REPLY_IN_SPAM_KIND;
  /** A conversation id for one-sided outbound; a message-source id for spam recovery. */
  entityId: number;
  /** Spam recovery only — how many replies were pulled back this sweep. */
  recovered: number | null;
};

type AlertDetails = { recovered?: number };

const toAlert = (row: Notification): UnansweredOutboundAlert => {
  const details = (row.details ?? {}) as AlertDetails;
  return {
    id: row.id,
    kind: (row as { kind?: string }).kind as UnansweredOutboundAlert['kind'],
    entityId: row.entityId,
    recovered: typeof details.recovered === 'number' ? details.recovered : null,
  };
};

export type UseUnansweredOutboundAlertsResult = ReturnType<typeof useUnansweredOutboundAlerts>;

export const useUnansweredOutboundAlerts = () => {
  const [alerts, setAlerts] = useState<UnansweredOutboundAlert[]>([]);
  const orgKey = useAuthStore(
    (state) => state.selectedOrganizationId ?? state.user?.organizationId ?? null
  );

  const fetchAlerts = useCallback(() => {
    apiClient
      .get('/api/notifications')
      .then((res) => {
        const payload = (
          res.data as { data: { notifications: Notification[]; total: number } }
        ).data;
        setAlerts(
          payload.notifications
            .filter((row) => {
              const kind = (row as { kind?: string }).kind;
              return kind === ONE_SIDED_OUTBOUND_KIND || kind === CUSTOMER_REPLY_IN_SPAM_KIND;
            })
            .map(toAlert)
        );
      })
      // A failed poll must not clear standing alerts — an empty list would read as "nothing
      // is unowned any more", which is not what a fetch error means.
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
    // ⛔ `resolved` too, not just `new`. The backend RETIRES a one_sided_outbound alert the
    // moment a real inbound arrives (clearOneSidedOutboundMarks), and without this the row
    // sits on screen pointing at a thread that is no longer one-sided until the reader
    // happens to reload — the same defect useAiProviderAlerts documents for a fixed provider.
    subscribeToEvent('notification:resolved', onChange);
    return () => {
      unsubscribeFromEvent('notification:new', onChange);
      unsubscribeFromEvent('notification:resolved', onChange);
      releaseSocket();
    };
  }, [fetchAlerts]);

  /** Dismiss one row. "Not now" — the thread itself is unchanged and stays in the queue. */
  const dismiss = useCallback((id: number) => {
    setAlerts((current) => current.filter((alert) => alert.id !== id));
    apiClient.patch(`/api/notifications/${id}/dismiss`).catch(() => {});
  }, []);

  return { alerts, dismiss, refresh: fetchAlerts };
};
