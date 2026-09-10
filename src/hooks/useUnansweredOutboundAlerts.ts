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

/**
 * Two requests, one list. A notification carries exactly ONE kind, so the kind-scoped calls
 * below cannot legitimately return the same row twice — but "cannot" is doing a lot of work
 * there. If a backend ignored `?kind=` (or a kind were ever served under two names), both
 * responses would be the SAME full list, and every alert would render twice under a duplicate
 * React key. The `.filter()` on kind does not catch that: the kinds are right, the rows are
 * doubled. Cheaper to be idempotent than to trust the query parameter.
 */
const dedupeById = (rows: Notification[]): Notification[] => {
  const seen = new Set<number>();
  return rows.filter((row) => (seen.has(row.id) ? false : (seen.add(row.id), true)));
};

export const useUnansweredOutboundAlerts = () => {
  const [alerts, setAlerts] = useState<UnansweredOutboundAlert[]>([]);
  /**
   * One of THESE kinds returned more rows than it sent, so `alerts` is a subset and any count
   * derived from it is a floor, not a total.
   *
   * ⛔ This is not a detail. `GET /api/notifications` serves the newest 20 rows and reports
   * `hasMore`. Ignoring that let the panel state "+7 more not shown" when 25 were, and let the
   * sort below claim it promotes the urgent kind into view when the urgent row may not be in
   * the payload at all. The count is hedged rather than asserted.
   *
   * ⚠️ Since the fetch below names its kinds, `hasMore` is now per-kind — 20 outbound rows,
   * not 20 rows of anything. That is a far higher bar than the unfiltered call cleared, and
   * the reason this flag almost never fires now is that it is measuring the right thing.
   */
  const [truncated, setTruncated] = useState(false);
  const orgKey = useAuthStore(
    (state) => state.selectedOrganizationId ?? state.user?.organizationId ?? null
  );

  const fetchAlerts = useCallback(() => {
    /**
     * ⛔ ASK FOR THESE KINDS BY NAME. The unfiltered call serves the newest 20 rows across
     * ALL kinds, so these two compete for slots with a breach feed that never stops.
     *
     * Measured on the taco client box, 2026-09-10: CoreSarms held 165 notifications; the
     * three one-sided alerts raised at 12:03Z sat at positions 2-4 of the newest 20, and a
     * fresh SLA breach landed at 12:38Z. Roughly seventeen more and those alerts fall out of
     * the payload, `alerts` empties, `UnansweredOutboundSection` returns null, and the rows
     * this whole feature exists for reach the user on ZERO surfaces — the exact failure this
     * file's header describes, arriving a few hours late instead of never.
     *
     * `?kind=` is applied to `total` and `hasMore` as well, so each kind gets its own 20.
     *
     * ⚠️ `Promise.all`, NOT `allSettled`, and the `.catch()` below keeps standing alerts.
     * A partial failure resolving to "just the kind that answered" would silently drop the
     * other kind's rows — a false all-clear, which is the one outcome this hook must never
     * produce. Either both kinds refresh or nothing does.
     */
    Promise.all(
      [ONE_SIDED_OUTBOUND_KIND, CUSTOMER_REPLY_IN_SPAM_KIND].map((kind) =>
        apiClient.get('/api/notifications', { params: { kind } })
      )
    )
      .then((responses) => {
        const payloads = responses.map(
          (res) =>
            (
              res.data as {
                data: { notifications: Notification[]; total: number; hasMore?: boolean };
              }
            ).data
        );
        setTruncated(payloads.some((payload) => payload.hasMore === true));
        setAlerts(
          dedupeById(payloads.flatMap((payload) => payload.notifications))
            // Kept even though the request names its kinds: if a backend ever ignored
            // `?kind=` this would silently become the unfiltered call again, and the bell
            // would fill with breach rows rendered as outbound alerts.
            .filter((row) => {
              const kind = (row as { kind?: string }).kind;
              return kind === ONE_SIDED_OUTBOUND_KIND || kind === CUSTOMER_REPLY_IN_SPAM_KIND;
            })
            .map(toAlert)
            // Fault first, then by id descending.
            //
            // Why sort at all: the panel shows only the first PANEL_PEEK_LIMIT rows, so
            // ordering decides what is seen. An urgent `customer_reply_in_spam` — a live
            // mailbox filter eating customer replies — must not sit below one-sided rows from
            // this morning's sweep, counted in the bell and rendered nowhere.
            //
            // ⚠️ Two honest limits, neither of which the ordering can fix:
            //   - It can only order what the payload CONTAINS. Each kind is fetched with
            //     its own `?kind=` request now, so a spam alert is no longer crowded out by
            //     breach rows — but 20 is still a cap PER KIND, and `truncated` above is what
            //     the UI uses to stop over-claiming when one of them hits it.
            //   - "then newest" is approximate for the spam kind. `publishNotification`
            //     upserts and refreshes neither `id` nor `createdAt`, so a July alert that
            //     RESURFACES today still sorts as July. The kind key dominates, so this only
            //     reorders spam alerts among themselves.
            .sort((left, right) => {
              const leftFault = left.kind === CUSTOMER_REPLY_IN_SPAM_KIND ? 0 : 1;
              const rightFault = right.kind === CUSTOMER_REPLY_IN_SPAM_KIND ? 0 : 1;
              if (leftFault !== rightFault) return leftFault - rightFault;
              return right.id - left.id;
            })
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

  return { alerts, truncated, dismiss, refresh: fetchAlerts };
};
