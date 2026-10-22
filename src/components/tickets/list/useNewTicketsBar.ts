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
export const useNewTicketsBar = (apiFilters: Record<string, string>, sorting: TicketSorting) => {
  const [pending, setPending] = useState<number[]>([]);
  const filtersKey = JSON.stringify(apiFilters);
  const latest = useRef({ apiFilters, sorting, filtersKey });
  latest.current = { apiFilters, sorting, filtersKey };

  // Another filter is another list: what was waiting for the old one does not belong to it.
  useEffect(() => {
    setPending([]);
  }, [filtersKey]);

  const onCreated = useCallback((ticketId: number) => {
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
        if (latest.current.filtersKey !== asked.filtersKey) return;
        if (response.success && response.data.some((ticket) => ticket.id === ticketId)) {
          setPending((prev) => (prev.includes(ticketId) ? prev : [...prev, ticketId]));
        }
      })
      .catch((error) => logger.error('Failed to check a new ticket against the list:', error));
  }, []);

  const reset = useCallback(() => setPending([]), []);

  return { count: pending.length, onCreated, reset };
};
