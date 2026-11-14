import { useCallback, useState } from 'react';
import { useVisiblePolling } from './useVisiblePolling';

/**
 * The current time in ms, refreshed every `intervalMs` — for a clock drawn on screen that must keep
 * moving while nothing else about the component changes (an SLA chip on an open thread). Paused
 * while the tab is hidden, and refreshed at once when it comes back.
 */
export const useNow = (intervalMs: number): number => {
  const [now, setNow] = useState(() => Date.now());
  const refresh = useCallback(() => setNow(Date.now()), []);
  useVisiblePolling(refresh, true, intervalMs);
  return now;
};
