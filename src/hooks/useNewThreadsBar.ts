import { useCallback, useEffect, useRef, useState } from 'react';
import { logger } from '@/lib/logger';
import { messageService } from '@/services/message.service';
import type { FilterState, SortingState } from '@/stores/messagesStore';
import { threadApiFilters } from './threadApiFilters';

const PAGE_SIZE = 50;

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
}: {
  filters: FilterState;
  sorting: SortingState;
  /** The thread ids the list is drawing now. */
  shownIds: string[];
}) => {
  const [pending, setPending] = useState<string[]>([]);
  const requestKey = JSON.stringify({ params: threadApiFilters(filters, false), sorting });
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

  const probe = useCallback(() => {
    const asked = latest.current;
    const params = threadApiFilters(asked.filters, false);
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
        if (!response.success || latest.current.requestKey !== asked.requestKey) return;
        const shown = new Set(latest.current.shownIds);
        const fresh = response.data.map((thread) => thread.threadId).filter((id) => !shown.has(id));
        if (fresh.length > 0)
          setPending((prev) => [...prev, ...fresh.filter((id) => !prev.includes(id))]);
      })
      .catch((error) => logger.error('Failed to check new threads against the list:', error));
  }, []);

  const reset = useCallback(() => setPending([]), []);

  return { count: pending.length, probe, reset };
};
