import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ticketService } from '@/services/ticket.service';
import { filtersFromParams, filtersToParams } from '@/components/tickets/list/ticketFilters';
import { DEFAULT_VIEW_FILTERS, filtersOfView } from '@/components/tickets/list/ticketViews';
import { useTicketsStore, defaultFilters } from '@/stores/ticketsStore';
import type { Ticket } from '@/types';
import { logger } from '@/lib/logger';

interface Options {
  displayMode: 'list' | 'kanban';
  setSelectedTicket: (t: Ticket | null) => void;
}

export function useTicketsUrlSync({
  displayMode,
  setSelectedTicket,
}: Options) {
  const [searchParams, setSearchParams] = useSearchParams();
  const searchParamsRef = useRef(searchParams);
  // Tracks which ticket ID was last fetched to prevent re-fetching when selectedTicket state changes
  const fetchedTicketIdRef = useRef<number | null>(null);
  const filters = useTicketsStore((state) => state.filters);
  const sorting = useTicketsStore((state) => state.sorting);
  const setFiltersStore = useTicketsStore((state) => state.setFilters);
  const setSortingStore = useTicketsStore((state) => state.setSorting);

  // Keep ref in sync with latest searchParams without adding it to effect dep arrays
  useEffect(() => {
    searchParamsRef.current = searchParams;
  });

  // Sync URL → filters on mount. A link with no filter at all opens on the "Needs us" view
  // (the tickets list's default); a link that names filters gets exactly those.
  useEffect(() => {
    const { filters: urlFilters, sorting: urlSorting, explicit: named } = filtersFromParams(searchParams);
    // Always start from defaults and layer URL params on top — prevents stale persisted filters
    // from bleeding in when the URL has no params.
    setFiltersStore(named ? { ...defaultFilters, ...urlFilters } : filtersOfView(DEFAULT_VIEW_FILTERS));
    if (urlSorting) setSortingStore(urlSorting);
  }, []); // Only run on mount

  // Sync filters → URL whenever filters/sort/displayMode change.
  // searchParams is intentionally read via searchParamsRef (not in the dep array)
  // to avoid an infinite loop: setSearchParams → searchParams changes → effect reruns.
  useEffect(() => {
    const params = new URLSearchParams();
    const ticketIdParam = searchParamsRef.current.get('id');
    if (ticketIdParam) params.set('id', ticketIdParam);
    if (displayMode === 'kanban') params.set('mode', 'kanban');
    filtersToParams(filters, sorting, params);
    setSearchParams(params, { replace: true });
  }, [filters, sorting, displayMode, setSearchParams]); // searchParams intentionally omitted — read via ref

  // Auto-open ticket from ?id= param.
  // selectedTicket is intentionally excluded from the dependency array — including it causes
  // an infinite loop: setSelectedTicket → selectedTicket changes → effect reruns → fetch again.
  // Instead we guard with fetchedTicketIdRef so we only fetch when the URL id actually changes.
  useEffect(() => {
    const ticketIdParam = searchParams.get('id');
    const parsed = ticketIdParam ? parseInt(ticketIdParam, 10) : null;
    const paramId = parsed !== null && !isNaN(parsed) ? parsed : null;

    if (paramId !== null) {
      // Skip if we already fetched this ticket ID
      if (paramId === fetchedTicketIdRef.current) return;
      fetchedTicketIdRef.current = paramId;

      ticketService
        .getById(paramId)
        .then((response) => {
          if (response.success && response.data) {
            setSelectedTicket(response.data);
          } else {
            fetchedTicketIdRef.current = null;
            setSearchParams(
              (prev) => {
                prev.delete('id');
                return prev;
              },
              { replace: true }
            );
          }
        })
        .catch((error) => {
          logger.error('Failed to fetch ticket:', error);
          fetchedTicketIdRef.current = null;
          setSearchParams(
            (prev) => {
              prev.delete('id');
              return prev;
            },
            { replace: true }
          );
        });
    } else {
      fetchedTicketIdRef.current = null;
      setSelectedTicket(null);
    }
  }, [searchParams, setSearchParams, setSelectedTicket]); // selectedTicket intentionally omitted — guarded by fetchedTicketIdRef
}
