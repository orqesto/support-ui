import { useEffect, useRef } from 'react';
import type { MessageEvent } from '@/types';
import { deliveryStateOf } from '../deliveryState';

/** Waits between re-reads while a reply shows "Sending…": quick at first, then backing off. */
export const RECHECK_DELAYS_MS = [3_000, 6_000, 12_000, 24_000, 30_000] as const;
/** The backend gives a send up after 4 minutes; a minute's margin, then the re-reads stop. */
export const RECHECK_FOR_MS = 5 * 60_000;

/**
 * While a reply on screen shows "Sending…", re-read the thread's newest events on a bounded
 * schedule (review of #999, H2). The backend announces a reply (`message:replied`) when it is
 * saved, BEFORE the channel answers, and says nothing when the send succeeds — so a colleague (or
 * the sender's second tab) read "Sending…" at that moment and kept it on a delivered reply.
 *
 * One timer per open thread; none while no reply is sending; nothing read while the tab is hidden
 * (the schedule goes on, so a tab shown again reads at the next step); stopped by the bound, by
 * the last "Sending…" turning into a real state, and on unmount or a thread switch.
 */
export function useSendingRecheck(events: readonly MessageEvent[], recheck: () => void): void {
  const sending = events.some((event) => deliveryStateOf(event) === 'sending');
  const recheckRef = useRef(recheck);
  recheckRef.current = recheck;
  useEffect(() => {
    if (!sending) return undefined;
    const started = Date.now();
    let step = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      const delay = RECHECK_DELAYS_MS[Math.min(step, RECHECK_DELAYS_MS.length - 1)];
      step += 1;
      timer = setTimeout(() => {
        if (Date.now() - started > RECHECK_FOR_MS) return;
        if (document.visibilityState !== 'hidden') recheckRef.current();
        schedule();
      }, delay);
    };
    schedule();
    return () => clearTimeout(timer);
  }, [sending]);
}
