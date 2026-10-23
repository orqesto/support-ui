import { useCallback, useEffect, useRef, useState } from 'react';
import { logger } from '@/lib/logger';
import { messageService } from '@/services/message.service';
import type { FilterState, SortingState } from '@/stores/messagesStore';
import { threadApiFilters } from './threadApiFilters';

const PAGE_SIZE = 50;
/**
 * A check that fails is asked again — twice, a few seconds apart. The event fires once per
 * arrival, so one failed check (staging 2026-10-23: a server error the second the mail landed)
 * otherwise hid the new mail until a reload: no bar, and the list does not re-read by itself.
 */
export const PROBE_RETRY_MS = 3_000;
const PROBE_RETRIES = 2;

/**
 * New threads wait behind a "N new messages — show" bar instead of shifting the list under the
 * agent's cursor (Messages list v4; the threads twin of `useNewTicketsBar`).
 *
 * `conversation:new` carries no id, so WHICH threads are new — and whether they belong in THIS
 * list (its filters, team scope, first page) — is asked of the server: page 1 is read with the
 * list's own request, and every thread on it that is not on screen waits. A thread already shown
 * never counts; one that the list shows after any other re-read leaves the count by itself.
 */
export const useNewThreadsBar = ({
  filters,
  sorting,
  shownIds,
  page,
}: {
  filters: FilterState;
  sorting: SortingState;
  /** The thread ids the list is drawing now. */
  shownIds: string[];
  /**
   * The page on screen. Part of the key: a check that answers after the agent moved to page 2
   * compared page 1's threads with page 2's ids and announced ~50 "new" (review of #712).
   */
  page: number;
}) => {
  const [pending, setPending] = useState<string[]>([]);
  const requestKey = JSON.stringify({ params: threadApiFilters(filters, false), sorting, page });
  const latest = useRef({ filters, sorting, requestKey, shownIds });
  latest.current = { filters, sorting, requestKey, shownIds };

  // Another filter or order is another list: what waited for the old one does not belong to it.
  useEffect(() => {
    setPending([]);
  }, [requestKey]);

  // Shown by some other re-read (a status change, a reply): no longer waiting.
  const shownKey = shownIds.join(',');
  useEffect(() => {
    setPending((prev) => {
      const shown = new Set(latest.current.shownIds);
      const left = prev.filter((id) => !shown.has(id));
      return left.length === prev.length ? prev : left;
    });
  }, [shownKey]);

  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelRetry = useCallback(() => {
    if (retryTimer.current) clearTimeout(retryTimer.current);
    retryTimer.current = null;
  }, []);
  // Unmounted: a check still in flight must not schedule a retry for a page that is gone.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  // A retry for a list nobody shows any more, or for an unmounted page, is dropped.
  useEffect(() => cancelRetry, [requestKey, cancelRetry]);

  const probe = useCallback(() => {
    const check = (attempt: number) => {
      const asked = latest.current;
      const params = threadApiFilters(asked.filters, false);
      const retry = (error?: unknown) => {
        if (!mounted.current || latest.current.requestKey !== asked.requestKey) return;
        if (attempt >= PROBE_RETRIES) {
          logger.error('Failed to check new threads against the list:', error);
          return;
        }
        cancelRetry();
        retryTimer.current = setTimeout(() => check(attempt + 1), PROBE_RETRY_MS);
      };
      messageService
        .getThreads(
          Object.keys(params).length > 0 ? params : undefined,
          1,
          PAGE_SIZE,
          asked.sorting.sortOrder,
          asked.sorting.sortBy
        )
        .then((response) => {
          // The list changed while this was in flight: the answer is for a list nobody shows.
          if (latest.current.requestKey !== asked.requestKey) return;
          if (!response.success) {
            retry(new Error('The thread list request did not succeed'));
            return;
          }
          const shown = new Set(latest.current.shownIds);
          const fresh = response.data
            .map((thread) => thread.threadId)
            .filter((id) => !shown.has(id));
          if (fresh.length > 0)
            setPending((prev) => [...prev, ...fresh.filter((id) => !prev.includes(id))]);
        })
        .catch(retry);
    };
    // A new arrival asks afresh; a retry still waiting for the last one is not needed.
    cancelRetry();
    check(0);
  }, [cancelRetry]);

  const reset = useCallback(() => setPending([]), []);

  return { count: pending.length, probe, reset };
};
