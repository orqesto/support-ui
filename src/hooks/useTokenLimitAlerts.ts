import { useCallback, useEffect, useRef, useState } from 'react';
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
 * "Daily AI limit reached" — a workspace used its daily AI token allowance for KB processing or
 * for regular work (backend `tokenBudgetAlerts`, admins only). Told once per workspace, limit and
 * UTC day for a given enforcement state and limit value: a limit RAISED and reached again the same
 * day, or own-key enforcement switched on, is told again (its claim key carries both).
 *
 * ⛔ Its own surface, like every non-SLA kind: the SLA bell is fail-OPEN, so a kind without one
 * renders there as an amber "breach" reading "nullm over" (observed with `ingestion_gap`,
 * staging 2026-09-10). `NON_SLA_BELL_KINDS` excludes this kind and this hook owns it.
 *
 * Asked for by `?kind=` so a crowd of SLA rows cannot push it out of the shared 20-row page.
 */
export const TOKEN_LIMIT_REACHED_KIND = 'ai_token_limit_reached';

/**
 * Dispatched on `window` after a limit save succeeded in this tab: a save may release paused work
 * and rewrite a notice, and the bell re-reads at once even when the socket that would announce it
 * is down.
 */
export const TOKEN_LIMITS_SAVED_EVENT = 'token-limits:saved';

export type TokenLimitAlert = {
  id: number;
  /** 'kb' | 'regular' from a current backend; kept a string so a newer one still renders. */
  bucket: string;
  title: string | null;
  spent: number | null;
  limit: number | null;
  /** True when reaching it stopped work; false when it is only measured (own key). */
  enforced: boolean;
  /** When the limit resets (ISO), or null when the backend did not say. */
  resetsAt: string | null;
  /** The backend's sentence for what stopped — rendered, not re-derived. */
  effect: string | null;
  /**
   * When a limit save released the work this notice says was paused (ISO), or null. A released
   * notice is a record, not a current pause — whatever its day. Absent from an older backend.
   */
  releasedAt: string | null;
  /**
   * BE R18: when the release was CHECKED (ISO) — the time the backend's own "(checked at …)"
   * names; `releasedAt` is taken after the promotes. Written with every `releasedAt`.
   */
  checkedAt: string | null;
  /**
   * On a released KB notice: true when some paused work may still wait for the reset (a bounded
   * scan or a failed promote), false when it did not. Null on a regular notice and on a row not
   * released; the backend writes it with every KB `releasedAt`. Only `true` keeps a released
   * notice in force (isNoLongerInForce) — FE audit pass 11, NIT.
   */
  releasePartial: boolean | null;
  /**
   * On a released notice: 'mining' when paused KB mining was queued to continue, 'notice_only'
   * when nothing was parked (only the notice changed). Null on a regular notice.
   */
  releaseKind: 'mining' | 'notice_only' | null;
  /**
   * Why a released notice was released (BE round 13 regular rows; BE R16 KB rows too):
   * 'limit_setting' — the settings
   * from before a save stopped the workspace and that save released it; 'no_longer_enforced' — the
   * workspace was found not stopped, by the gate's own re-check OR (BE R15) by a save whose
   * previous settings did not stop it or could not be read (a setting may then have changed), so
   * no cause is known. Absent (older rows, KB rows before BE R16) ⇒ 'limit_setting', as the
   * backend reads it.
   */
  releaseCause: 'limit_setting' | 'no_longer_enforced';
};

type AlertDetails = {
  title?: unknown;
  bucket?: unknown;
  spent?: unknown;
  limit?: unknown;
  enforced?: unknown;
  resetsAt?: unknown;
  effect?: unknown;
  releasedAt?: unknown;
  checkedAt?: unknown;
  partial?: unknown;
  releaseKind?: unknown;
  releaseCause?: unknown;
};

/**
 * A notice whose limit has already reset (it is from an earlier UTC day). It stays listed until
 * dismissed, but in the past tense and without a badge: nothing it says is stopping work now.
 * A notice without a reset time is taken as current — it cannot be shown to be over.
 */
export const isPastReset = (alert: TokenLimitAlert, now: number = Date.now()): boolean => {
  if (!alert.resetsAt) return false;
  const at = new Date(alert.resetsAt).getTime();
  return !Number.isNaN(at) && at <= now;
};

/**
 * Nothing in the notice is stopping work now: its limit has reset, or a limit save released the
 * paused work (all of it — a partial release stays badged). Such a notice is never badged.
 */
export const isNoLongerInForce = (alert: TokenLimitAlert, now: number = Date.now()): boolean =>
  // A PARTIAL release may leave work waiting for the reset: still in force until then.
  (alert.releasedAt !== null && alert.releasePartial !== true) || isPastReset(alert, now);

const toAlert = (row: Notification): TokenLimitAlert => {
  const details = (row.details ?? {}) as AlertDetails;
  return {
    id: row.id,
    // Each field read by its type: a wrongly typed one is unknown, never rendered as is (an
    // object as a React child throws) — FE audit pass 9, NIT.
    bucket: typeof details.bucket === 'string' ? details.bucket : 'unknown',
    title: typeof details.title === 'string' ? details.title : null,
    spent: typeof details.spent === 'number' ? details.spent : null,
    limit: typeof details.limit === 'number' ? details.limit : null,
    enforced: details.enforced === true,
    resetsAt: typeof details.resetsAt === 'string' ? details.resetsAt : null,
    effect: typeof details.effect === 'string' ? details.effect : null,
    releasedAt:
      typeof details.releasedAt === 'string' &&
      !Number.isNaN(new Date(details.releasedAt).getTime())
        ? details.releasedAt
        : null,
    checkedAt:
      typeof details.checkedAt === 'string' && !Number.isNaN(new Date(details.checkedAt).getTime())
        ? details.checkedAt
        : null,
    releasePartial: typeof details.partial === 'boolean' ? details.partial : null,
    releaseKind:
      details.releaseKind === 'mining' || details.releaseKind === 'notice_only'
        ? details.releaseKind
        : null,
    releaseCause:
      details.releaseCause === 'no_longer_enforced' ? 'no_longer_enforced' : 'limit_setting',
  };
};

/** Longest delay a browser timer honours (about 24.8 days); a later reset is re-armed on render. */
const MAX_TIMER_MS = 2_147_483_647;

export const useTokenLimitAlerts = () => {
  const [alerts, setAlerts] = useState<TokenLimitAlert[]>([]);
  // Re-rendered at a reset so a notice turns past-tense and leaves the badge without a poll.
  const [now, setNow] = useState(() => Date.now());
  const orgKey = useAuthStore(
    (state) => state.selectedOrganizationId ?? state.user?.organizationId ?? null
  );
  // Only the newest request may write: an answer for the previous workspace, or one overtaken
  // by a later poll, is dropped rather than shown under the workspace now selected.
  const latest = useRef(0);
  // Notices whose dismiss is still on its way: a read answered meanwhile (another dismiss's
  // re-read) still carries them, and must not put them back for a moment (FE audit pass 9, NIT).
  const dismissing = useRef(new Set<number>());

  const fetchAlerts = useCallback(() => {
    const request = ++latest.current;
    apiClient
      .get('/api/notifications', { params: { kind: TOKEN_LIMIT_REACHED_KIND } })
      .then((res) => {
        if (request !== latest.current) return;
        const payload = (res.data as { data: { notifications: Notification[] } }).data;
        setAlerts(
          payload.notifications
            .filter((row) => (row as { kind?: string }).kind === TOKEN_LIMIT_REACHED_KIND)
            .filter((row) => !dismissing.current.has(row.id))
            .map(toAlert)
            // What stopped work first.
            .sort((left, right) => Number(right.enforced) - Number(left.enforced))
        );
        setNow(Date.now());
      })
      // A failed poll keeps what is shown: an empty list would read as "the limit is fine".
      .catch(() => {});
  }, []);

  useEffect(() => {
    // Another workspace: the previous one's notices are not this one's, even if the fetch fails.
    setAlerts([]);
    fetchAlerts();
  }, [fetchAlerts, orgKey]);

  // One timer, at the earliest reset still ahead; cleared when the list changes or on unmount.
  useEffect(() => {
    const ahead = alerts
      .map((alert) => (alert.resetsAt ? new Date(alert.resetsAt).getTime() : Number.NaN))
      .filter((at) => !Number.isNaN(at) && at > now);
    if (ahead.length === 0) return;
    const delay = Math.min(Math.min(...ahead) - Date.now(), MAX_TIMER_MS);
    const timer = setTimeout(() => setNow(Date.now()), Math.max(0, delay));
    return () => clearTimeout(timer);
  }, [alerts, now]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    // Mirrors useKbReviewAlerts: every backend emit names its kind. `notification:updated` = a
    // notice rewritten in place (a limit save released the paused work, or a new limit value);
    // `notification:resolved` = a notice retired. Without them an open bell keeps saying "paused".
    const onChange = (data: unknown) => {
      if ((data as { kind?: unknown } | null)?.kind === TOKEN_LIMIT_REACHED_KIND) fetchAlerts();
    };
    const events = ['notification:new', 'notification:resolved', 'notification:updated'];
    for (const event of events) subscribeToEvent(event, onChange);
    // A reconnect re-reads: whatever was emitted while the socket was down was missed (mirrors
    // useSLANotifications; FE audit pass 8, F8-3).
    subscribeToEvent('connect', fetchAlerts);
    return () => {
      for (const event of events) unsubscribeFromEvent(event, onChange);
      unsubscribeFromEvent('connect', fetchAlerts);
      releaseSocket();
    };
  }, [fetchAlerts]);

  useEffect(() => {
    window.addEventListener(TOKEN_LIMITS_SAVED_EVENT, fetchAlerts);
    return () => window.removeEventListener(TOKEN_LIMITS_SAVED_EVENT, fetchAlerts);
  }, [fetchAlerts]);

  /**
   * "Seen": the notice hides until a new occurrence — the next day, or the same day when the limit
   * is reached again after a save released it (the backend then re-sends the SAME row as
   * `notification:new`; the list is re-read, so it is replaced by id, never added twice).
   */
  const dismiss = useCallback(
    (id: number) => {
      // A read already in flight was answered before the dismiss: its rows would put the notice
      // back. It is dropped, and the list is read again once the dismiss is through (FE audit
      // pass 8, LOW).
      latest.current += 1;
      dismissing.current.add(id);
      setAlerts((current) => current.filter((alert) => alert.id !== id));
      apiClient
        .patch(`/api/notifications/${id}/dismiss`)
        .catch(() => {})
        .finally(() => {
          dismissing.current.delete(id);
          fetchAlerts();
        });
    },
    [fetchAlerts]
  );

  // Only a notice still in force counts on the bell's badge.
  const badged = alerts.filter((alert) => !isNoLongerInForce(alert, now)).length;

  return { alerts, badged, now, dismiss, refresh: fetchAlerts };
};
