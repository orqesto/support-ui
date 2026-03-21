import { useEffect, useState, useCallback } from 'react';
import { Ticket, RefreshCw } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { TicketDetail } from '@/components/tickets/TicketDetail';
import { TicketFilters } from '@/components/tickets/TicketFilters';
import { TicketListItem } from '@/components/tickets/TicketListItem';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogClose,
  DialogContent,
  DialogFooter,
} from '@/components/ui/Dialog';
import { Drawer } from '@/components/ui/Drawer';
import { Pagination } from '@/components/ui/Pagination';
import { usePermissions } from '@/hooks/usePermissions';
import { PAGINATION } from '@/lib/constants';
import {
  getSocket,
  subscribeToEvent,
  unsubscribeFromEvent,
  releaseSocket,
} from '@/lib/socketManager';
import { integrationsService, type JiraIntegration } from '@/services/integrations.service';
import { ticketService, type PaginationMeta } from '@/services/ticket.service';
import { useTicketsStore } from '@/stores/ticketsStore';
import type { Ticket as TicketType } from '@/types';
import { Permission } from '@/types/roles';

export const TicketsPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState<number | null>(null);
  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [ticketToDelete, setTicketToDelete] = useState<TicketType | null>(null);
  const [syncDialogOpen, setSyncDialogOpen] = useState(false);
  const [jiraIntegrations, setJiraIntegrations] = useState<JiraIntegration[]>([]);
  const [selectedJiraId, setSelectedJiraId] = useState<number | undefined>(undefined);

  // Alert dialog state
  const [alertDialog, setAlertDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    variant: 'success' | 'error' | 'warning' | 'info';
  }>({ open: false, title: '', description: '', variant: 'info' });

  // Zustand stores
  const filters = useTicketsStore((state) => state.filters);
  const [pendingSearch, setPendingSearch] = useState(filters.search ?? '');
  const sorting = useTicketsStore((state) => state.sorting);
  const setFiltersStore = useTicketsStore((state) => state.setFilters);
  const setSortingStore = useTicketsStore((state) => state.setSorting);
  const clearFiltersStore = useTicketsStore((state) => state.clearFilters);
  const setTicketsCache = useTicketsStore((state) => state.setTickets);
  const getCached = useTicketsStore((state) => state.getCached);
  const clearCache = useTicketsStore((state) => state.clearCache);

  const { hasPermission, user } = usePermissions();

  // Local state for current view
  const [tickets, setTickets] = useState<TicketType[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta>({
    page: PAGINATION.DEFAULT_PAGE,
    limit: PAGINATION.DEFAULT_LIMIT,
    total: 0,
    totalPages: 0,
    hasMore: false,
  });
  const [deleting, setDeleting] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<TicketType | null>(null);

  // Sync URL parameters with filters on mount
  useEffect(() => {
    const urlStatus = searchParams.get('status');
    const urlPriority = searchParams.get('priority');
    const urlCategory = searchParams.get('category');
    const urlMessageSource = searchParams.get('source');
    const urlAssignee = searchParams.get('assignee');
    const urlJira = searchParams.get('jira');
    const urlSearch = searchParams.get('search');

    const urlFilters: Partial<typeof filters> = {};
    let hasUrlFilters = false;

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
      hasUrlFilters = true;
    }
    if (urlPriority && ['all', 'low', 'medium', 'high', 'critical'].includes(urlPriority)) {
      urlFilters.priority = urlPriority as 'all' | 'low' | 'medium' | 'high' | 'critical';
      hasUrlFilters = true;
    }
    if (urlCategory) {
      urlFilters.categoryId = urlCategory;
      hasUrlFilters = true;
    }
    if (urlMessageSource) {
      urlFilters.messageSourceId = urlMessageSource;
      hasUrlFilters = true;
    }
    if (urlAssignee) {
      urlFilters.assigneeId = urlAssignee;
      hasUrlFilters = true;
    }
    if (urlJira === 'true' || urlJira === 'false') {
      urlFilters.syncedToJira = urlJira === 'true';
      hasUrlFilters = true;
    }
    if (urlSearch) {
      urlFilters.search = urlSearch;
      hasUrlFilters = true;
    }

    // Apply URL filters to store if any exist
    if (hasUrlFilters) {
      setFiltersStore(urlFilters as typeof filters);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on mount

  // Sync filters to URL whenever they change
  useEffect(() => {
    const params = new URLSearchParams();

    // Preserve ticket ID if present
    const ticketIdParam = searchParams.get('id');
    if (ticketIdParam) {
      params.set('id', ticketIdParam);
    }

    // Add filters to URL (only non-default values)
    if (filters.status && filters.status !== 'all') {
      params.set('status', filters.status);
    }
    if (filters.priority && filters.priority !== 'all') {
      params.set('priority', filters.priority);
    }
    if (filters.categoryId && filters.categoryId !== 'all') {
      params.set('category', filters.categoryId);
    }
    if (filters.messageSourceId && filters.messageSourceId !== 'all') {
      params.set('source', filters.messageSourceId);
    }
    if (filters.assigneeId && filters.assigneeId !== 'all') {
      params.set('assignee', filters.assigneeId);
    }
    if (filters.syncedToJira !== undefined) {
      params.set('jira', filters.syncedToJira.toString());
    }
    if (filters.search) {
      params.set('search', filters.search);
    }

    // Update URL without triggering navigation
    setSearchParams(params, { replace: true });
  }, [filters, setSearchParams, searchParams]);

  // Auto-open ticket from query param
  useEffect(() => {
    const ticketIdParam = searchParams.get('id');
    const paramId = ticketIdParam ? parseInt(ticketIdParam) : null;

    // Only fetch if URL has an ID and it's different from the currently selected ticket
    if (paramId && selectedTicket?.id !== paramId) {
      const fetchAndOpenTicket = async () => {
        try {
          const response = await ticketService.getById(paramId);
          if (response.success && response.data) {
            setSelectedTicket(response.data);
          }
        } catch (error) {
          console.error('Failed to fetch ticket:', error);
        }
      };
      fetchAndOpenTicket().catch((error) => {
        console.error('Failed to fetch ticket:', error);
      });
    } else if (!paramId && selectedTicket) {
      // URL cleared but ticket still selected - clear selection
      setSelectedTicket(null);
    }
  }, [searchParams, selectedTicket]);

  const fetchTickets = useCallback(
    async (page = 1, force = false) => {
      // Check cache first
      if (!force) {
        const cached = getCached(page);
        if (cached) {
          setTickets(cached.tickets);
          setPagination(cached.pagination);
          setLoading(false); // ← FIX: Set loading to false on cache hit
          return;
        }
      }

      setLoading(true);
      try {
        // Build API filters - capture current filters
        const currentFilters = filters;
        const apiFilters: Record<string, string> = {};

        if (currentFilters.status !== 'all') {
          apiFilters.status = currentFilters.status;
        }
        if (currentFilters.priority !== 'all') {
          apiFilters.priority = currentFilters.priority;
        }
        if (currentFilters.categoryId !== 'all') {
          apiFilters.categoryId = currentFilters.categoryId;
        }
        if (currentFilters.messageSourceId && currentFilters.messageSourceId !== 'all') {
          apiFilters.messageSourceId = currentFilters.messageSourceId;
        }
        if (currentFilters.assigneeId && currentFilters.assigneeId !== 'all') {
          apiFilters.assigneeId =
            currentFilters.assigneeId === 'unassigned' ? '0' : currentFilters.assigneeId;
        }
        if (currentFilters.search?.trim()) {
          apiFilters.search = currentFilters.search.trim();
        }
        if (currentFilters.labelId) {
          apiFilters.labelId = currentFilters.labelId;
        }
        if (currentFilters.syncedToJira !== undefined) {
          apiFilters.syncedToJira = currentFilters.syncedToJira.toString();
        }

        const response = await ticketService.getAll(
          Object.keys(apiFilters).length > 0 ? apiFilters : undefined,
          page,
          PAGINATION.DEFAULT_LIMIT,
          sorting.sortBy,
          sorting.sortOrder
        );

        if (response.success && response.data) {
          // Update cache
          setTicketsCache(response.data, response.pagination);
          // Update local state
          setTickets(response.data);
          setPagination(response.pagination);

          // If current page exceeds total pages, reset to page 1
          if (page > response.pagination.totalPages && response.pagination.totalPages > 0) {
            fetchTickets(1).catch((error) => {
              console.error('Failed to fetch tickets:', error);
            });
          }
        }
      } catch (error) {
        console.error('Failed to fetch tickets:', error);
      } finally {
        setLoading(false);
      }
    },
    [filters, sorting, getCached, setTicketsCache]
  );

  useEffect(() => {
    fetchTickets(1).catch((error) => {
      console.error('Failed to fetch tickets:', error);
    });
  }, [fetchTickets]);

  useEffect(() => {
    const fetchJiraIntegrations = async () => {
      // Only fetch integrations if user has permission
      if (!hasPermission(Permission.VIEW_INTEGRATIONS)) {
        return;
      }

      try {
        const response = await integrationsService.getAll();
        if (response.success && response.data) {
          const jiras = response.data.filter(
            (i) => i.type === 'jira' && i.enabled
          ) as JiraIntegration[];
          setJiraIntegrations(jiras);
          // Auto-select if only one Jira instance
          if (jiras.length === 1) {
            setSelectedJiraId(jiras[0].id);
          }
        }
      } catch (error) {
        console.error('Failed to fetch Jira integrations:', error);
      }
    };
    fetchJiraIntegrations().catch((error) => {
      console.error('Failed to fetch Jira integrations:', error);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Listen for real-time ticket updates from Jira webhooks and new ticket creation
  useEffect(() => {
    getSocket(); // Initialize WebSocket connection

    const handleTicketUpdate = (data: unknown) => {
      const ticketUpdate = data as { ticketId: number; jiraKey: string; changedFields?: string[] };

      // Clear cache to ensure fresh data
      clearCache();

      // Refresh tickets to show latest data
      fetchTickets(pagination.page, true).catch((error) => {
        console.error('Failed to fetch tickets:', error);
      });

      // If the updated ticket is currently open, refresh it
      if (selectedTicket && selectedTicket.id === ticketUpdate.ticketId) {
        ticketService
          .getById(ticketUpdate.ticketId)
          .then((response) => {
            if (response.success && response.data) {
              setSelectedTicket(response.data);
            }
          })
          .catch((error) => {
            console.error('Failed to refresh ticket:', error);
          });
      }
    };

    const handleTicketCreated = (_data: unknown) => {

      // Clear cache to ensure fresh data
      clearCache();

      // Refresh tickets list to show the new ticket
      fetchTickets(pagination.page, true).catch((error) => {
        console.error('Failed to fetch tickets after creation:', error);
      });
    };

    subscribeToEvent('ticket:updated', handleTicketUpdate);
    subscribeToEvent('ticket:created', handleTicketCreated);

    return () => {
      unsubscribeFromEvent('ticket:updated', handleTicketUpdate);
      unsubscribeFromEvent('ticket:created', handleTicketCreated);
      releaseSocket();
    };
  }, [pagination.page, selectedTicket, fetchTickets, clearCache]);

  const handlePageChange = async (page: number) => {
    await fetchTickets(page);
  };

  const handleFilterChange = (key: string, value: string) => {
    if (key === 'search') {
      setPendingSearch(value);
      // If clearing search (empty value), immediately apply to show all results
      if (!value.trim()) {
        setFiltersStore({ ...filters, search: '' });
      }
    } else if (key === 'syncedToJira') {
      setFiltersStore({ ...filters, syncedToJira: value === 'true' || undefined });
    } else {
      setFiltersStore({ ...filters, [key]: value });
    }
  };

  const handleSearch = () => {
    // Trigger actual search when button clicked or Enter pressed
    setFiltersStore({ ...filters, search: pendingSearch });
  };

  const handleSearchBlur = () => {
    // If search is empty on blur, clear the search filter to show all data
    if (!pendingSearch.trim() && filters.search) {
      setFiltersStore({ ...filters, search: '' });
    }
  };

  const clearFilters = () => {
    clearFiltersStore();
    setPendingSearch('');
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchTickets(pagination.page, true); // Force refetch
    setRefreshing(false);
  };

  const handlePushToJira = async (ticketId: number) => {
    // Check if user has permission to manage tickets
    if (!hasPermission(Permission.MANAGE_TICKETS)) {
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
          console.error('Failed to fetch tickets:', error);
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
      console.error('Failed to push to Jira:', error);
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
    if (!hasPermission(Permission.MANAGE_TICKETS)) {
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
          console.error('Failed to fetch tickets:', error);
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
      console.error('Failed to sync tickets:', error);
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

  const handleDeleteClick = (ticket: TicketType) => {
    setTicketToDelete(ticket);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!ticketToDelete) {
      return;
    }

    setDeleting(true);
    try {
      await ticketService.delete(ticketToDelete.id);
      clearCache(); // Clear all cached data
      setSelectedTicket(null); // Close the drawer
      setDeleteDialogOpen(false);
      setTicketToDelete(null);
      await fetchTickets(1, true); // Force refresh
    } catch (error) {
      console.error('Failed to delete ticket:', error);
      setAlertDialog({
        open: true,
        title: 'Delete Failed',
        description: 'Failed to delete ticket',
        variant: 'error',
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Layout>
      <div className="px-4 mx-auto space-y-4 w-full max-w-7xl">
        {/* Header */}
        <div className="flex flex-col gap-4 justify-between items-start mb-6 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-2xl font-bold">Tickets</h2>
            <p className="text-sm text-muted-foreground">Manage and track support tickets</p>
          </div>
          <Button onClick={handleRefresh} disabled={refreshing} className="w-full sm:w-auto">
            <RefreshCw className={`mr-2 w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {/* Filters Card */}
        <TicketFilters
          filters={filters}
          sorting={sorting}
          pendingSearch={pendingSearch}
          pagination={pagination}
          jiraIntegrations={jiraIntegrations}
          selectedJiraId={selectedJiraId}
          isSyncingAll={isSyncingAll}
          hasManagePermission={hasPermission(Permission.MANAGE_TICKETS)}
          onFilterChange={handleFilterChange}
          onSearch={handleSearch}
          onSearchBlur={handleSearchBlur}
          onClearFilters={clearFilters}
          onSortingChange={setSortingStore}
          onJiraIdChange={setSelectedJiraId}
          onSyncAll={handleSyncAll}
          onPendingSearchChange={setPendingSearch}
        />

        {loading ? (
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              // Index key is safe: array is immutable (recreated from text split), no reordering
              // eslint-disable-next-line react/no-array-index-key
              <Card key={`ticket-skeleton-${i}`} className="animate-pulse">
                <CardContent className="p-6">
                  <div className="mb-4 w-3/4 h-4 bg-gray-200 rounded" />
                  <div className="w-1/2 h-4 bg-gray-200 rounded" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : tickets.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <Ticket className="mx-auto mb-4 w-12 h-12 text-muted-foreground" />
              <h3 className="mb-2 text-lg font-semibold">No tickets found</h3>
              <p className="text-muted-foreground">Create a ticket from unprocessed messages</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {tickets.map((ticket) => (
              <TicketListItem
                key={ticket.id}
                ticket={ticket}
                isSyncing={syncing === ticket.id}
                onOpen={(t) => {
                  setSelectedTicket(t);
                  setSearchParams({ id: t.id.toString() });
                }}
                onPushToJira={handlePushToJira}
                onDelete={handleDeleteClick}
              />
            ))}
          </div>
        )}

        {/* Pagination */}
        {!loading && tickets.length > 0 && (
          <Pagination
            currentPage={pagination.page}
            totalPages={pagination.totalPages}
            total={pagination.total}
            limit={pagination.limit}
            onPageChange={handlePageChange}
            loading={loading}
          />
        )}
      </div>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogHeader>
          <DialogTitle>Delete Ticket</DialogTitle>
          <DialogClose onClose={() => setDeleteDialogOpen(false)} />
        </DialogHeader>
        <DialogContent>
          <p>Are you sure you want to delete this ticket? This action cannot be undone.</p>
          {ticketToDelete && (
            <div className="p-3 mt-3 bg-gray-50 rounded-md border border-gray-200 dark:bg-gray-800 dark:border-gray-700">
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                {ticketToDelete.title}
              </p>
              <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                Status: <span className="font-medium">{ticketToDelete.status}</span> | Priority:{' '}
                <span className="font-medium">{ticketToDelete.priority}</span>
              </p>
            </div>
          )}
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" onClick={() => setDeleteDialogOpen(false)} disabled={deleting}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleDeleteConfirm} isLoading={deleting}>
            Delete
          </Button>
        </DialogFooter>
      </Dialog>

      {/* Sync All Confirmation Dialog */}
      <Dialog open={syncDialogOpen} onOpenChange={setSyncDialogOpen}>
        <DialogHeader>
          <DialogTitle>Sync All Tickets to Jira</DialogTitle>
          <DialogClose onClose={() => setSyncDialogOpen(false)} />
        </DialogHeader>
        <DialogContent>
          <p className="text-sm text-gray-700">
            Are you sure you want to sync all unsynced tickets to Jira?
          </p>
          <p className="mt-2 text-sm text-gray-500">
            This will create Jira issues for all tickets that haven&apos;t been synced yet.
          </p>
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" onClick={() => setSyncDialogOpen(false)}>
            Cancel
          </Button>
          <Button onClick={confirmSyncAll}>
            <RefreshCw className="mr-2 w-4 h-4" />
            Sync All
          </Button>
        </DialogFooter>
      </Dialog>

      {/* Ticket Detail Drawer */}
      {selectedTicket && (
        <Drawer
          open={!!selectedTicket}
          onClose={() => {
            setSearchParams({});
            setSelectedTicket(null);
          }}
          title="Ticket Details"
        >
          <TicketDetail
            ticket={selectedTicket}
            onPushToJira={
              hasPermission(Permission.MANAGE_TICKETS)
                ? async () => {
                    await handlePushToJira(selectedTicket.id);
                    // Refresh to get updated ticket data
                    await fetchTickets();
                    setSelectedTicket(null);
                  }
                : undefined
            }
            onDelete={
              hasPermission(Permission.MANAGE_TICKETS)
                ? () => {
                    setTicketToDelete(selectedTicket);
                    setSelectedTicket(null);
                    setDeleteDialogOpen(true);
                  }
                : undefined
            }
            onRefresh={async () => {
              // Clear cache to force fresh data
              clearCache();

              // Refresh the detail view
              const response = await ticketService.getById(selectedTicket.id);
              if (response.success && response.data) {
                setSelectedTicket(response.data);
              }

              // Refresh the list to show updated assignee
              await fetchTickets(pagination.page, true);
            }}
            isPushingToJira={syncing === selectedTicket.id}
          />
        </Drawer>
      )}

      {/* Alert Dialog */}
      <AlertDialog
        open={alertDialog.open}
        onOpenChange={(open) => setAlertDialog({ ...alertDialog, open })}
        title={alertDialog.title}
        description={alertDialog.description}
        variant={alertDialog.variant}
      />
    </Layout>
  );
};
