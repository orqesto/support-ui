import { useState } from 'react';
import { logger } from '@/lib/logger';
import type { JiraIntegration } from '@/services/integrations.service';
import { ticketService } from '@/services/ticket.service';

export type TicketAlert = {
  open: boolean;
  title: string;
  description: string;
  variant: 'success' | 'error' | 'warning' | 'info';
};

type Options = {
  canManage: boolean;
  jiraIntegrations: JiraIntegration[];
  selectedJiraId: number | undefined;
  setAlertDialog: (alert: TicketAlert) => void;
  clearCache: () => void;
  fetchTickets: (page?: number, force?: boolean) => Promise<void>;
};

/** Push one ticket to Jira, or sync every ticket not in Jira yet — with the page's alerts. */
export const useTicketJiraActions = ({
  canManage,
  jiraIntegrations,
  selectedJiraId,
  setAlertDialog,
  clearCache,
  fetchTickets,
}: Options) => {
  const [syncing, setSyncing] = useState<number | null>(null);
  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const [syncDialogOpen, setSyncDialogOpen] = useState(false);

  const handlePushToJira = async (ticketId: number) => {
    // Check if user has permission to manage tickets
    if (!canManage) {
      setAlertDialog({
        open: true,
        title: 'Permission Denied',
        description: 'You do not have permission to push tickets to Jira.',
        variant: 'warning',
      });
      return;
    }

    if (jiraIntegrations.length === 0) {
      setAlertDialog({
        open: true,
        title: 'No Jira Integration',
        description: 'No Jira integrations configured. Please add a Jira integration in Settings.',
        variant: 'warning',
      });
      return;
    }

    if (jiraIntegrations.length > 1 && !selectedJiraId) {
      setAlertDialog({
        open: true,
        title: 'Select Jira Instance',
        description: 'Please select a Jira instance first.',
        variant: 'info',
      });
      return;
    }

    setSyncing(ticketId);
    try {
      const response = await ticketService.pushToJira(ticketId, selectedJiraId);
      if (response.success) {
        setAlertDialog({
          open: true,
          title: 'Success',
          description: `Ticket pushed to Jira: ${response.data?.jiraKey}`,
          variant: 'success',
        });
        clearCache(); // Clear all cached data
        fetchTickets(1, true).catch((error) => {
          logger.error('Failed to fetch tickets:', error);
        });
      } else {
        setAlertDialog({
          open: true,
          title: 'Push Failed',
          description: `Failed to push to Jira: ${response.error ?? 'Unknown error'}`,
          variant: 'error',
        });
      }
    } catch (error) {
      logger.error('Failed to push to Jira:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setAlertDialog({
        open: true,
        title: 'Push Failed',
        description: `Failed to push ticket to Jira: ${errorMessage}`,
        variant: 'error',
      });
    } finally {
      setSyncing(null);
    }
  };

  const handleSyncAll = () => {
    // Check if user has permission to manage tickets
    if (!canManage) {
      setAlertDialog({
        open: true,
        title: 'Permission Denied',
        description: 'You do not have permission to sync tickets to Jira.',
        variant: 'warning',
      });
      return;
    }

    if (jiraIntegrations.length === 0) {
      setAlertDialog({
        open: true,
        title: 'No Jira Integration',
        description: 'No Jira integrations configured. Please add a Jira integration in Settings.',
        variant: 'warning',
      });
      return;
    }

    if (jiraIntegrations.length > 1 && !selectedJiraId) {
      setAlertDialog({
        open: true,
        title: 'Select Jira Instance',
        description: 'Please select a Jira instance first.',
        variant: 'info',
      });
      return;
    }

    setSyncDialogOpen(true);
  };

  const confirmSyncAll = async () => {
    setSyncDialogOpen(false);
    setIsSyncingAll(true);
    try {
      const response = await ticketService.syncAllToJira(selectedJiraId);
      if (response.success) {
        setAlertDialog({
          open: true,
          title: 'Sync Complete',
          description: response.message ?? 'Sync completed',
          variant: 'success',
        });
        fetchTickets(1, true).catch((error) => {
          logger.error('Failed to fetch tickets:', error);
        });
      } else {
        setAlertDialog({
          open: true,
          title: 'Sync Failed',
          description: `Sync failed: ${response.error ?? 'Unknown error'}`,
          variant: 'error',
        });
      }
    } catch (error) {
      logger.error('Failed to sync tickets:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setAlertDialog({
        open: true,
        title: 'Sync Failed',
        description: `Failed to sync tickets to Jira: ${errorMessage}`,
        variant: 'error',
      });
    } finally {
      setIsSyncingAll(false);
    }
  };

  return {
    syncing,
    isSyncingAll,
    syncDialogOpen,
    setSyncDialogOpen,
    handlePushToJira,
    handleSyncAll,
    confirmSyncAll,
  };
};
