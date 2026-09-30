import { useEffect, useRef } from 'react';

/**
 * Runs `tick` now and every `intervalMs` while `enabled`, paused while the tab is hidden and run
 * once more when it comes back. A hidden tab polling every 15 s for hours helps nobody.
 *
 * "Now" means when polling starts or `tick` changes (a new thing to ask) — NOT when only the
 * interval changes: a panel moving between its on-screen and off-screen pace asked twice in a row
 * every time (FE audit pass 4, L2).
 */
export const useVisiblePolling = (tick: () => void, enabled: boolean, intervalMs: number) => {
  const last = useRef<{ tick: (() => void) | null; enabled: boolean }>({
    tick: null,
    enabled: false,
  });
  useEffect(() => {
    const askNow = last.current.tick !== tick || !last.current.enabled;
    last.current = { tick, enabled };
    if (!enabled) return;
    if (askNow && document.visibilityState === 'visible') tick();
    let intervalId: number | null = null;
    const startPolling = () => {
      if (intervalId !== null) return;
      intervalId = window.setInterval(tick, intervalMs);
    };
    const stopPolling = () => {
      if (intervalId === null) return;
      window.clearInterval(intervalId);
      intervalId = null;
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        tick();
        startPolling();
      } else {
        stopPolling();
      }
    };
    if (document.visibilityState === 'visible') startPolling();
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      stopPolling();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [tick, enabled, intervalMs]);
};
