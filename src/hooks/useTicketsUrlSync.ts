import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ticketService } from '@/services/ticket.service';
import { useTicketsStore } from '@/stores/ticketsStore';
import type { Ticket } from '@/types';
import { logger } from '@/lib/logger';

interface Options {
  displayMode: 'list' | 'kanban';
  selectedTicket: Ticket | null;
  setSelectedTicket: (t: Ticket | null) => void;
}

export function useTicketsUrlSync({ displayMode, selectedTicket, setSelectedTicket }: Options) {
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = useTicketsStore((state) => state.filters);
  const setFiltersStore = useTicketsStore((state) => state.setFilters);

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

    if (urlStatus && ['all', 'pending', 'open', 'in_progress', 'resolved', 'closed'].includes(urlStatus)) {
      urlFilters.status = urlStatus as 'all' | 'pending' | 'open' | 'in_progress' | 'resolved' | 'closed';
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

    if (Object.keys(urlFilters).length > 0) {
      setFiltersStore({ ...filters, ...urlFilters });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on mount

  // Sync filters → URL whenever filters/displayMode change
  useEffect(() => {
    const params = new URLSearchParams();
    const ticketIdParam = searchParams.get('id');
    if (ticketIdParam) params.set('id', ticketIdParam);
    if (displayMode === 'kanban') params.set('mode', 'kanban');
    if (filters.status && filters.status !== 'all') params.set('status', filters.status);
    if (filters.priority && filters.priority !== 'all') params.set('priority', filters.priority);
    if (filters.categoryId && filters.categoryId !== 'all') params.set('category', filters.categoryId);
    if (filters.messageSourceId && filters.messageSourceId !== 'all') params.set('source', filters.messageSourceId);
    if (filters.assigneeId && filters.assigneeId !== 'all') params.set('assignee', filters.assigneeId);
    if (filters.linked && filters.linked !== 'all') params.set('linked', filters.linked);
    if (filters.search) params.set('search', filters.search);
    setSearchParams(params, { replace: true });
  }, [filters, displayMode, setSearchParams, searchParams]);

  // Auto-open ticket from query param
  useEffect(() => {
    const ticketIdParam = searchParams.get('id');
    const paramId = ticketIdParam ? parseInt(ticketIdParam) : null;
    if (paramId && selectedTicket?.id !== paramId) {
      ticketService.getById(paramId)
        .then((response) => {
          if (response.success && response.data) setSelectedTicket(response.data);
        })
        .catch((error) => { logger.error('Failed to fetch ticket:', error); });
    } else if (!paramId && selectedTicket) {
      setSelectedTicket(null);
    }
  }, [searchParams, selectedTicket, setSelectedTicket]);
}
