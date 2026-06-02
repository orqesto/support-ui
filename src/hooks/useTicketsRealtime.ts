import { useEffect, useRef } from 'react';
import {
  getSocket,
  subscribeToEvent,
  unsubscribeFromEvent,
  releaseSocket,
} from '@/lib/socketManager';
import { integrationsService, type JiraIntegration } from '@/services/integrations.service';
import { ticketService } from '@/services/ticket.service';
import { usePermissions } from '@/hooks/usePermissions';
import { Permission } from '@/types/roles';
import type { Ticket } from '@/types';
import { logger } from '@/lib/logger';

interface Options {
  paginationPage: number;
  selectedTicket: Ticket | null;
  setSelectedTicket: (t: Ticket | null) => void;
  setJiraIntegrations: (jiras: JiraIntegration[]) => void;
  setSelectedJiraId: (id: number | undefined) => void;
  clearCache: () => void;
  fetchTickets: (page?: number, force?: boolean) => Promise<void>;
}

export function useTicketsRealtime({
  paginationPage,
  selectedTicket,
  setSelectedTicket,
  setJiraIntegrations,
  setSelectedJiraId,
  clearCache,
  fetchTickets,
}: Options) {
  const { hasPermission, user } = usePermissions();
  const fetchTicketsRef = useRef(fetchTickets);
  fetchTicketsRef.current = fetchTickets;

  // Fetch Jira integrations
  useEffect(() => {
    if (!hasPermission(Permission.VIEW_INTEGRATIONS)) return;
    integrationsService
      .getAll()
      .then((response) => {
        if (response.success && response.data) {
          const jiras = response.data.filter(
            (intg) => intg.type === 'jira' && intg.enabled
          ) as JiraIntegration[];
          setJiraIntegrations(jiras);
          if (jiras.length === 1) setSelectedJiraId(jiras[0].id);
        }
      })
      .catch((error) => {
        logger.error('Failed to fetch Jira integrations:', error);
      });
  }, [user?.id]);

  const selectedTicketRef = useRef(selectedTicket);
  selectedTicketRef.current = selectedTicket;

  const setSelectedTicketRef = useRef(setSelectedTicket);
  setSelectedTicketRef.current = setSelectedTicket;

  const paginationPageRef = useRef(paginationPage);
  paginationPageRef.current = paginationPage;

  // WebSocket real-time updates
  useEffect(() => {
    getSocket();

    const handleTicketUpdate = (data: unknown) => {
      const ticketUpdate = data as { ticketId: number; jiraKey: string; changedFields?: string[] };
      clearCache();
      fetchTicketsRef.current(paginationPageRef.current, true).catch((error) => {
        logger.error('Failed to fetch tickets:', error);
      });
      if (selectedTicketRef.current && selectedTicketRef.current.id === ticketUpdate.ticketId) {
        ticketService
          .getById(ticketUpdate.ticketId)
          .then((response) => {
            if (response.success && response.data) setSelectedTicketRef.current(response.data);
          })
          .catch((error) => {
            logger.error('Failed to refresh ticket:', error);
          });
      }
    };

    const handleTicketCreated = (_data: unknown) => {
      clearCache();
      fetchTicketsRef.current(paginationPageRef.current, true).catch((error) => {
        logger.error('Failed to fetch tickets after creation:', error);
      });
    };

    subscribeToEvent('ticket:updated', handleTicketUpdate);
    subscribeToEvent('ticket:created', handleTicketCreated);

    return () => {
      unsubscribeFromEvent('ticket:updated', handleTicketUpdate);
      unsubscribeFromEvent('ticket:created', handleTicketCreated);
      releaseSocket();
    };
  }, [clearCache]);
}
