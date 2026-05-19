import { useEffect, useState, useCallback, useRef } from 'react';
import { Ticket, RefreshCw, Send } from 'lucide-react';
import { TicketDeleteDialog, TicketSyncAllDialog } from '@/components/tickets/TicketsJiraDialogs';
import { TicketsViewToggle } from '@/components/tickets/TicketsViewToggle';
import { useTicketsUrlSync } from '@/hooks/useTicketsUrlSync';
import { useTicketsRealtime } from '@/hooks/useTicketsRealtime';
import { useSearchParams } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { TicketDetail } from '@/components/tickets/TicketDetail';
import { TicketFilters } from '@/components/tickets/TicketFilters';
import { TicketListItem } from '@/components/tickets/TicketListItem';
import { TicketsKanbanView } from '@/components/tickets/TicketsKanbanView';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { Button } from '@/components/ui/Button';
import { ReactSelect } from '@/components/ui/ReactSelect';
import { Card, CardContent } from '@/components/ui/Card';
import { Drawer } from '@/components/ui/Drawer';
import { Pagination } from '@/components/ui/Pagination';
import { usePermissions } from '@/hooks/usePermissions';
import { PAGINATION } from '@/lib/constants';
import { type JiraIntegration } from '@/services/integrations.service';
import { ticketService, type PaginationMeta } from '@/services/ticket.service';
import { useTicketsStore } from '@/stores/ticketsStore';
import type { Ticket as TicketType } from '@/types';
import { Permission } from '@/types/roles';
import { logger } from '@/lib/logger';

export const TicketsPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [displayMode, setDisplayMode] = useState<'list' | 'kanban'>(() => {
    const mode = searchParams.get('mode');
    if (mode === 'kanban') return 'kanban';
    const stored = localStorage.getItem('tickets_view_mode');
    if (stored === 'kanban') return 'kanban';
    return 'list';
  });
  const displayModeSyncedRef = useRef(false);
  useEffect(() => {
    if (!displayModeSyncedRef.current) {
      displayModeSyncedRef.current = true;
      return;
    }
    if (searchParams.get('mode') === 'kanban') setDisplayMode('kanban');
  }, [searchParams]);
  useEffect(() => {
    localStorage.setItem('tickets_view_mode', displayMode);
  }, [displayMode]);
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

  const { hasPermission } = usePermissions();

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

  useTicketsUrlSync({ displayMode, selectedTicket, setSelectedTicket });

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
        if (currentFilters.linked === 'synced_to_jira') {
          apiFilters.syncedToJira = 'true';
        } else if (currentFilters.linked === 'not_synced') {
          apiFilters.syncedToJira = 'false';
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
              logger.error('Failed to fetch tickets:', error);
            });
          }
        }
      } catch (error) {
        logger.error('Failed to fetch tickets:', error);
      } finally {
        setLoading(false);
      }
    },
    [filters, sorting, getCached, setTicketsCache]
  );

  useEffect(() => {
    fetchTickets(1).catch((error) => {
      logger.error('Failed to fetch tickets:', error);
    });
  }, [fetchTickets]);

  useTicketsRealtime({
    paginationPage: pagination.page,
    selectedTicket,
    setSelectedTicket,
    setJiraIntegrations,
    setSelectedJiraId,
    clearCache,
    fetchTickets,
  });

  const handlePageChange = async (page: number) => {
    await fetchTickets(page);
  };

  const handleApplyPreset = (presetName: string) => {
    switch (presetName) {
      case 'urgent':
        setFiltersStore({ ...filters, status: 'open', priority: 'critical' });
        break;
      case 'in-progress':
        setFiltersStore({ ...filters, status: 'in_progress', priority: 'all' });
        break;
      case 'pending':
        setFiltersStore({ ...filters, status: 'pending', priority: 'all' });
        break;
      case 'recent':
        setFiltersStore({ ...filters, status: 'resolved', priority: 'all' });
        setSortingStore({ sortBy: 'updatedAt', sortOrder: 'desc' });
        break;
    }
  };

  const handleFilterChange = (key: string, value: string) => {
    if (key === 'search') {
      setPendingSearch(value);
      // If clearing search (empty value), immediately apply to show all results
      if (!value.trim()) {
        setFiltersStore({ ...filters, search: '' });
      }
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
      logger.error('Failed to delete ticket:', error);
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

  const activeFilterCount =
    (filters.status && filters.status !== 'all' ? 1 : 0) +
    (filters.priority && filters.priority !== 'all' ? 1 : 0) +
    (filters.categoryId && filters.categoryId !== 'all' ? 1 : 0) +
    (filters.messageSourceId && filters.messageSourceId !== 'all' ? 1 : 0) +
    (filters.assigneeId && filters.assigneeId !== 'all' ? 1 : 0) +
    (filters.labelId && filters.labelId !== 'all' ? 1 : 0) +
    (filters.linked && filters.linked !== 'all' ? 1 : 0) +
    (filters.search?.trim() ? 1 : 0);

  return (
    <Layout>
      <div className="px-4 mx-auto space-y-4 w-full max-w-7xl">
        {/* Header */}
        <div className="flex flex-col gap-4 justify-between items-start mb-6 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-2xl font-bold">Tickets</h2>
            <p className="text-sm text-muted-foreground">Manage and track support tickets</p>
          </div>
          <div className="flex flex-wrap gap-2 items-center w-full sm:w-auto">
            {jiraIntegrations.length > 1 && (
              <ReactSelect
                value={selectedJiraId?.toString() ?? ''}
                onChange={(value) => setSelectedJiraId(value ? Number(value) : undefined)}
                options={[
                  { value: '', label: 'All Jira' },
                  ...jiraIntegrations.map((jira) => ({ value: jira.id.toString(), label: jira.name })),
                ]}
                className="w-40"
              />
            )}
            {jiraIntegrations.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleSyncAll}
                disabled={!hasPermission(Permission.MANAGE_TICKETS) || isSyncingAll || (jiraIntegrations.length > 1 && !selectedJiraId)}
                isLoading={isSyncingAll}
                className="flex-1 sm:flex-none"
              >
                <Send className="mr-2 w-4 h-4" />
                Sync to Jira
              </Button>
            )}
            <Button onClick={handleRefresh} disabled={refreshing} className="flex-1 sm:flex-none">
              <RefreshCw className={`mr-2 w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Filters Card */}
        <TicketFilters
          filters={filters}
          sorting={sorting}
          pendingSearch={pendingSearch}
          pagination={pagination}
          activeFilterCount={activeFilterCount}
          onFilterChange={handleFilterChange}
          onApplyPreset={handleApplyPreset}
          onSearch={handleSearch}
          onSearchBlur={handleSearchBlur}
          onClearFilters={clearFilters}
          onSortingChange={setSortingStore}
          onPendingSearchChange={setPendingSearch}
        />

        {/* Display mode toggle */}
        <TicketsViewToggle displayMode={displayMode} onModeChange={setDisplayMode} />

        {displayMode === 'kanban' ? (
          <TicketsKanbanView
            filters={filters}
            onOpen={(ticket) => {
              setSelectedTicket(ticket);
              setSearchParams((params) => { params.set('id', ticket.id.toString()); return params; });
            }}
          />
        ) : loading ? (
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, idx) => (
              // Index key is safe: array is immutable (recreated from text split), no reordering
              // eslint-disable-next-line react/no-array-index-key
              <Card key={`ticket-skeleton-${idx}`} className="animate-pulse">
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
                onOpen={(ticket) => {
                  setSelectedTicket(ticket);
                  setSearchParams((params) => { params.set('id', ticket.id.toString()); return params; });
                }}
                onPushToJira={handlePushToJira}
                onDelete={handleDeleteClick}
              />
            ))}
          </div>
        )}

        {/* Pagination */}
        {!loading && tickets.length > 0 && displayMode !== 'kanban' && (
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

      <TicketDeleteDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        ticketToDelete={ticketToDelete}
        deleting={deleting}
        onCancel={() => setDeleteDialogOpen(false)}
        onConfirm={handleDeleteConfirm}
      />

      <TicketSyncAllDialog
        open={syncDialogOpen}
        onOpenChange={setSyncDialogOpen}
        onCancel={() => setSyncDialogOpen(false)}
        onConfirm={confirmSyncAll}
      />

      {/* Ticket Detail Drawer */}
      {selectedTicket && (
        <Drawer
          open={!!selectedTicket}
          onClose={() => {
            setSearchParams((params) => { params.delete('id'); return params; });
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
