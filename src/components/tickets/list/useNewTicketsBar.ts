import { useCallback, useEffect, useRef, useState } from 'react';
import { PAGINATION } from '@/lib/constants';
import { logger } from '@/lib/logger';
import { ticketService } from '@/services/ticket.service';
import type { TicketSorting } from '@/stores/ticketsStore';

/**
 * New tickets wait behind a "N new tickets — show" bar instead of shifting the list under the
 * agent's cursor. The created event carries only an id, so whether the ticket belongs in THIS list
 * (its filters, department scope, top page) is asked of the server: the first page is fetched
 * with the current filters and the ticket counts only if it is on it.
 */
const PROBE_DEBOUNCE_MS = 400;

export const useNewTicketsBar = (apiFilters: Record<string, string>, sorting: TicketSorting) => {
  const [pending, setPending] = useState<number[]>([]);
  const filtersKey = JSON.stringify(apiFilters);
  const latest = useRef({ apiFilters, sorting, filtersKey });
  latest.current = { apiFilters, sorting, filtersKey };

  // Another filter is another list: what was waiting for the old one does not belong to it.
  useEffect(() => {
    setPending([]);
  }, [filtersKey]);

  // New tickets arriving together (an import) are checked with ONE request, not one each.
  const waiting = useRef<Set<number>>(new Set());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  const probe = useCallback(() => {
    timer.current = null;
    const ids = [...waiting.current];
    waiting.current = new Set();
    const asked = latest.current;
    ticketService
      .getAll(
        Object.keys(asked.apiFilters).length ? asked.apiFilters : undefined,
        1,
        PAGINATION.DEFAULT_LIMIT,
        asked.sorting.sortBy,
        asked.sorting.sortOrder
      )
      .then((response) => {
        // The filters changed while this was in flight: the answer is for a list nobody shows.
        if (latest.current.filtersKey !== asked.filtersKey || !response.success) return;
        const onPage = new Set(response.data.map((ticket) => ticket.id));
        const belong = ids.filter((id) => onPage.has(id));
        if (belong.length)
          setPending((prev) => [...prev, ...belong.filter((id) => !prev.includes(id))]);
      })
      .catch((error) => logger.error('Failed to check new tickets against the list:', error));
  }, []);

  const onCreated = useCallback(
    (ticketId: number) => {
      waiting.current.add(ticketId);
      if (!timer.current) timer.current = setTimeout(probe, PROBE_DEBOUNCE_MS);
    },
    [probe]
  );

  const reset = useCallback(() => setPending([]), []);

  return { count: pending.length, onCreated, reset };
};
