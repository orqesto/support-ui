import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ticketService } from '@/services/ticket.service';
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
  const setFiltersStore = useTicketsStore((state) => state.setFilters);

  // Keep ref in sync with latest searchParams without adding it to effect dep arrays
  useEffect(() => {
    searchParamsRef.current = searchParams;
  });

  // Sync URL → filters on mount
  useEffect(() => {
    const urlStatus = searchParams.get('status');
    const urlPriority = searchParams.get('priority');
    const urlCategory = searchParams.get('category');
    const urlMessageSource = searchParams.get('source');
    const urlAssignee = searchParams.get('assignee');
    const urlSearch = searchParams.get('search');
    const urlLinked = searchParams.get('linked');

    const urlFilters: Partial<typeof filters> = {};

    if (
      urlStatus &&
      ['all', 'pending', 'open', 'in_progress', 'resolved', 'closed'].includes(urlStatus)
    ) {
      urlFilters.status = urlStatus as
        | 'all'
        | 'pending'
        | 'open'
        | 'in_progress'
        | 'resolved'
        | 'closed';
    }
    if (urlPriority && ['all', 'low', 'medium', 'high', 'critical'].includes(urlPriority)) {
      urlFilters.priority = urlPriority as 'all' | 'low' | 'medium' | 'high' | 'critical';
    }
    if (urlCategory) urlFilters.categoryId = urlCategory;
    if (urlMessageSource) urlFilters.messageSourceId = urlMessageSource;
    if (urlAssignee) urlFilters.assigneeId = urlAssignee;
    if (urlLinked && ['all', 'synced_to_jira', 'not_synced'].includes(urlLinked)) {
      urlFilters.linked = urlLinked as 'all' | 'synced_to_jira' | 'not_synced';
    }
    if (urlSearch) urlFilters.search = urlSearch;

    // Always start from defaults and layer URL params on top — prevents stale persisted filters
    // from bleeding in when the URL has no params.
    setFiltersStore({ ...defaultFilters, ...urlFilters });
  }, []); // Only run on mount

  // Sync filters → URL whenever filters/displayMode change.
  // searchParams is intentionally read via searchParamsRef (not in the dep array)
  // to avoid an infinite loop: setSearchParams → searchParams changes → effect reruns.
  useEffect(() => {
    const params = new URLSearchParams();
    const ticketIdParam = searchParamsRef.current.get('id');
    if (ticketIdParam) params.set('id', ticketIdParam);
    if (displayMode === 'kanban') params.set('mode', 'kanban');
    if (filters.status && filters.status !== 'all') params.set('status', filters.status);
    if (filters.priority && filters.priority !== 'all') params.set('priority', filters.priority);
    if (filters.categoryId && filters.categoryId !== 'all')
      params.set('category', filters.categoryId);
    if (filters.messageSourceId && filters.messageSourceId !== 'all')
      params.set('source', filters.messageSourceId);
    if (filters.assigneeId && filters.assigneeId !== 'all')
      params.set('assignee', filters.assigneeId);
    if (filters.linked && filters.linked !== 'all') params.set('linked', filters.linked);
    if (filters.search) params.set('search', filters.search);
    setSearchParams(params, { replace: true });
  }, [filters, displayMode, setSearchParams]); // searchParams intentionally omitted — read via ref

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
