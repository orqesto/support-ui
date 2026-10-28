import { useCallback, useEffect, useRef } from 'react';

/**
 * How long refreshes triggered by OTHER people's activity wait and join each other.
 *
 * Every org-wide socket event (`conversation:updated`, `conv:status_changed`, `message:replied`,
 * `conversation:routed`, `ticket:updated`) used to re-read the list, the view counts and the whole
 * board AT ONCE — per event, per open tab. The board alone is 13 filtered queries, so on a busy
 * workspace each agent's board turned every event into a burst of full scans (a customer's
 * workspace, 2026-10: the database sat at its ceiling all working day, the top statements being
 * exactly these list and count reads). An agent's OWN action still refreshes immediately; only the
 * echo of someone else's change waits up to this long.
 */
export const SERVER_EVENT_REFRESH_MS = 5000;

/**
 * Returns a trigger that runs `refresh` once, `windowMs` after the first call; calls inside that
 * window join it.
 *
 * ⛔ COALESCED, not debounced — the same rule as `useConversationNewRefresh`. A trailing debounce
 * restarts on every call, so a steady stream of events (an import, a busy inbox) would never
 * refresh at all. Here a stream refreshes at most once per window.
 */
export const useCoalescedRefresh = (
  refresh: () => void,
  windowMs: number = SERVER_EVENT_REFRESH_MS
): (() => void) => {
  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * A window closed while the tab was hidden: nobody could see the refresh, so it waits for the
   * tab to come back and then runs ONCE — however many windows closed meanwhile. A background tab
   * on a busy workspace otherwise paid the full re-read (the board's lanes and counts) every window,
   * for every agent who left one open.
   */
  const pendingWhileHiddenRef = useRef(false);
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible' || !pendingWhileHiddenRef.current) return;
      pendingWhileHiddenRef.current = false;
      refreshRef.current();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = null;
    };
  }, []);

  return useCallback(() => {
    if (timerRef.current !== null) return;
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      if (document.visibilityState === 'hidden') {
        pendingWhileHiddenRef.current = true;
        return;
      }
      refreshRef.current();
    }, windowMs);
  }, [windowMs]);
};
