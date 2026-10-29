import { useEffect, useMemo, useState } from 'react';
import { logger } from '@/lib/logger';
import { counterTotal, type Count } from '@/lib/listTotals';
import { messageService } from '@/services/message.service';
import type { FilterState } from '@/stores/messagesStore';
import { threadApiFilters } from './threadApiFilters';
import { useDepartmentContextKey } from './useDepartmentContextKey';

/** One count to take: the filters a click lands on, under a name to read it back by. */
export type ThreadCountRequest = { key: string; filters: FilterState };

/** Several pills change together (a filter edit); their counts are asked for once, a beat later. */
const COUNT_DEBOUNCE_MS = 250;

/**
 * How many threads each view pill would show (Threads v4).
 *
 * ⛔ A count is the `pagination.total` of the SAME request the list makes when the pill is
 * clicked — `threadApiFilters` on the filters the click lands on, at `limit=1`, the way the
 * dashboard and the board already count. A separate count query would drift from the list it
 * names; this one cannot, so a pill never says 12 over a list of 9 (team scope included: the
 * request carries the same department header as the list).
 *
 * `undefined` while a count is unknown (loading, failed, cut short by the time limit) — the pill
 * then shows no number rather than a wrong one. A search counted to the backend's cap comes back
 * `{ atLeast }` and the pill says `10,000+` (owner 2026-10-29).
 */
export const useThreadViewCounts = (
  requests: ThreadCountRequest[],
  /** Bumped whenever the list itself is re-read (new mail, a refresh), so the counts follow. */
  refreshKey: unknown,
  enabled = true
): Record<string, Count | undefined> => {
  const deptKey = useDepartmentContextKey();
  const [counts, setCounts] = useState<Record<string, Count | undefined>>({});
  // The requests as API parameters — what is actually asked, and what decides re-asking.
  const asked = useMemo(
    () =>
      requests.map((request) => ({
        key: request.key,
        params: threadApiFilters(request.filters, false),
      })),
    [requests]
  );
  const askedKey = JSON.stringify(asked);

  useEffect(() => {
    if (!enabled || asked.length === 0) return undefined;
    let cancelled = false;
    const timer = setTimeout(() => {
      void Promise.all(
        asked.map(async ({ key, params }) => {
          try {
            const response = await messageService.getThreads(
              Object.keys(params).length > 0 ? params : undefined,
              1,
              1
            );
            // A cut-short total is not a count to print on a pill; a capped one is "at least".
            return [key, response.success ? counterTotal(response.pagination) : undefined] as const;
          } catch (error) {
            logger.error(`Failed to count the "${key}" view:`, error);
            return [key, undefined] as const;
          }
        })
      ).then((entries) => {
        if (!cancelled) setCounts(Object.fromEntries(entries));
      });
    }, COUNT_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // `asked` is read through its key: a new array with the same requests must not re-ask.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [askedKey, refreshKey, deptKey, enabled]);

  return counts;
};
