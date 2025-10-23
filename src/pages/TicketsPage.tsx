import { useEffect, useState, useCallback } from 'react';
import {
  Ticket,
  ExternalLink as ExternalLinkIcon,
  Send,
  RefreshCw,
  Edit2,
  Trash2,
  Filter,
  X,
} from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { PermissionGuard } from '@/components/auth/PermissionGuard';
import { Layout } from '@/components/layout/Layout';
import { TicketDetail } from '@/components/TicketDetail';
import { Badge } from '@/components/ui/Badge';
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
import { ExternalLink } from '@/components/ui/ExternalLink';
import { ListCard } from '@/components/ui/ListCard';
import { Pagination } from '@/components/ui/Pagination';
import { SearchInput } from '@/components/ui/SearchInput';
import { usePermissions } from '@/hooks/usePermissions';
import { PAGINATION } from '@/lib/constants';
import {
  getSocket,
  subscribeToEvent,
  unsubscribeFromEvent,
  releaseSocket,
} from '@/lib/socketManager';
import { formatDate } from '@/lib/utils';
import { integrationsService, type JiraIntegration } from '@/services/integrations.service';
import { ticketService, type PaginationMeta } from '@/services/ticket.service';
import { useTicketsStore } from '@/stores/ticketsStore';
import type { Ticket as TicketType, TicketStatus, TicketPriority } from '@/types';
import { Permission } from '@/types/roles';

const statusColors: Record<
  TicketStatus,
  'default' | 'success' | 'warning' | 'danger' | 'secondary'
> = {
  pending: 'warning',
  open: 'default',
  in_progress: 'default',
  resolved: 'success',
  closed: 'secondary',
};

const priorityColors: Record<TicketPriority, 'default' | 'success' | 'warning' | 'danger'> = {
  low: 'success',
  medium: 'default',
  high: 'warning',
  critical: 'danger',
};

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

  // Zustand stores
  const filters = useTicketsStore((state) => state.filters);
  const [pendingSearch, setPendingSearch] = useState(filters.search || '');
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

  // Auto-open ticket from query param
  useEffect(() => {
    const ticketIdParam = searchParams.get('id');
    if (ticketIdParam && !selectedTicket) {
      const fetchAndOpenTicket = async () => {
        try {
          const response = await ticketService.getById(parseInt(ticketIdParam));
          if (response.success && response.data) {
            setSelectedTicket(response.data);
            const newParams = new URLSearchParams(searchParams);
            newParams.delete('id');
            setSearchParams(newParams);
          }
        } catch (error) {
          console.error('Failed to fetch ticket:', error);
        }
      };
      fetchAndOpenTicket();
    }
  }, [searchParams, selectedTicket, setSearchParams]);

  const fetchTickets = useCallback(
    async (page = 1, force = false) => {
      // Check cache first
      if (!force) {
        const cached = getCached(page);
        if (cached) {
          console.log('✅ Using cached tickets for page', page);
          setTickets(cached.tickets);
          setPagination(cached.pagination);
          setLoading(false); // ← FIX: Set loading to false on cache hit
          return;
        }
      }

      console.log('🔄 Fetching tickets from API for page', page);
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
        if (currentFilters.search?.trim()) {
          apiFilters.search = currentFilters.search.trim();
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
            fetchTickets(1);
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
    fetchTickets(1);
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
    fetchJiraIntegrations();
  }, [hasPermission]);

  // Listen for real-time ticket updates from Jira webhooks
  useEffect(() => {
    getSocket(); // Initialize WebSocket connection

    const handleTicketUpdate = (data: unknown) => {
      const ticketUpdate = data as { ticketId: number; jiraKey: string; changedFields?: string[] };
      console.log('🔄 Ticket updated from Jira:', ticketUpdate);

      // Show notification
      const fields = ticketUpdate.changedFields?.join(', ') || 'fields';
      console.log(`✅ ${ticketUpdate.jiraKey} synced from Jira (updated: ${fields})`);

      // Clear cache to ensure fresh data
      clearCache();

      // Refresh tickets to show latest data
      fetchTickets(pagination.page, true);

      // If the updated ticket is currently open, refresh it
      if (selectedTicket && selectedTicket.id === ticketUpdate.ticketId) {
        ticketService.getById(ticketUpdate.ticketId).then((response) => {
          if (response.success && response.data) {
            setSelectedTicket(response.data);
          }
        });
      }
    };

    subscribeToEvent('ticket:updated', handleTicketUpdate);

    return () => {
      unsubscribeFromEvent('ticket:updated', handleTicketUpdate);
      releaseSocket();
    };
  }, [pagination.page, selectedTicket, fetchTickets]);

  const handlePageChange = (page: number) => {
    fetchTickets(page);
  };

  const handleFilterChange = (key: string, value: string) => {
    if (key === 'search') {
      // Don't trigger auto-fetch for search, just update local state
      setPendingSearch(value);
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
      alert('⚠️ You do not have permission to push tickets to Jira.');
      return;
    }

    if (jiraIntegrations.length === 0) {
      alert('No Jira integrations configured. Please add a Jira integration in Settings.');
      return;
    }

    if (jiraIntegrations.length > 1 && !selectedJiraId) {
      alert('Please select a Jira instance first.');
      return;
    }

    setSyncing(ticketId);
    try {
      const response = await ticketService.pushToJira(ticketId, selectedJiraId);
      if (response.success) {
        alert(`✅ Ticket pushed to Jira: ${response.data?.jiraKey}`);
        clearCache(); // Clear all cached data
        fetchTickets(1, true);
      } else {
        alert(`❌ Failed to push to Jira: ${response.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Failed to push to Jira:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      alert(`❌ Failed to push ticket to Jira: ${errorMessage}`);
    } finally {
      setSyncing(null);
    }
  };

  const handleSyncAll = async () => {
    // Check if user has permission to manage tickets
    if (!hasPermission(Permission.MANAGE_TICKETS)) {
      alert('⚠️ You do not have permission to sync tickets to Jira.');
      return;
    }

    if (jiraIntegrations.length === 0) {
      alert('No Jira integrations configured. Please add a Jira integration in Settings.');
      return;
    }

    if (jiraIntegrations.length > 1 && !selectedJiraId) {
      alert('Please select a Jira instance first.');
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
        alert(response.message || 'Sync completed');
        fetchTickets(1, true);
      } else {
        alert(`Sync failed: ${response.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Failed to sync tickets:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      alert(`Failed to sync tickets to Jira: ${errorMessage}`);
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
      fetchTickets(1, true); // Force refresh
    } catch (error) {
      console.error('Failed to delete ticket:', error);
      alert('Failed to delete ticket');
    } finally {
      setDeleting(false);
    }
  };

  const activeFilterCount =
    (filters.status !== 'all' ? 1 : 0) +
    (filters.priority !== 'all' ? 1 : 0) +
    (filters.categoryId !== 'all' ? 1 : 0) +
    (filters.search?.trim() ? 1 : 0);

  return (
    <Layout>
      <div className="max-w-7xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex flex-col gap-4 justify-between items-start sm:flex-row sm:items-center mb-6">
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
        <Card>
          <CardContent className="p-4">
            <div className="space-y-3">
              {/* Header */}
              <div className="flex flex-wrap gap-2 justify-between items-center min-h-[32px]">
                <div className="flex flex-wrap gap-2 items-center">
                  <div className="flex gap-2 items-center">
                    <Filter className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Filters</span>
                    <Badge variant="default" className="text-xs">
                      {activeFilterCount}
                    </Badge>
                  </div>
                  {pagination.total > 0 && (
                    <span className="text-xs whitespace-nowrap text-muted-foreground">
                      {(pagination.page - 1) * pagination.limit + 1}-
                      {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
                      {pagination.total}
                    </span>
                  )}
                </div>
                {activeFilterCount > 0 && (
                  <Button variant="ghost" size="sm" onClick={clearFilters} className="shrink-0">
                    <X className="mr-1 w-3 h-3" />
                    Clear
                  </Button>
                )}
              </div>

              {/* Filter Controls */}
              <div className="flex flex-wrap gap-3 items-center">
                {/* Search Input */}
                <SearchInput
                  value={pendingSearch}
                  onChange={(value) => handleFilterChange('search', value)}
                  onSearch={handleSearch}
                  onBlur={handleSearchBlur}
                  showSearchButton={true}
                  placeholder="Search by ID, title, description..."
                  className="w-[300px]"
                  size="sm"
                />

                {/* Group 1: Status & Priority */}
                <div className="flex gap-2 items-center">
                  <span className="text-xs font-medium whitespace-nowrap text-muted-foreground">
                    Status:
                  </span>
                  <select
                    value={filters.status}
                    onChange={(e) => handleFilterChange('status', e.target.value)}
                    className="px-2 py-1 text-xs rounded-md border bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="all">All</option>
                    <option value="pending">Pending</option>
                    <option value="open">Open</option>
                    <option value="in_progress">In Progress</option>
                    <option value="resolved">Resolved</option>
                    <option value="closed">Closed</option>
                  </select>
                </div>

                <div className="flex gap-2 items-center">
                  <span className="text-xs font-medium whitespace-nowrap text-muted-foreground">
                    Priority:
                  </span>
                  <select
                    value={filters.priority}
                    onChange={(e) => handleFilterChange('priority', e.target.value)}
                    className="px-2 py-1 text-xs rounded-md border bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="all">All</option>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
                {/* Group 2: Sorting */}
                <div className="flex gap-2 items-center">
                  <span className="text-xs font-medium whitespace-nowrap text-muted-foreground">
                    Sort:
                  </span>
                  <select
                    value={sorting.sortBy}
                    onChange={(e) =>
                      setSortingStore({
                        ...sorting,
                        sortBy: e.target.value as 'createdAt' | 'updatedAt',
                      })
                    }
                    className="px-2 py-1 text-xs rounded-md border bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="createdAt">Created Date</option>
                    <option value="updatedAt">Updated Date</option>
                  </select>
                </div>

                <div className="flex gap-2 items-center">
                  <span className="text-xs font-medium whitespace-nowrap text-muted-foreground">
                    Order:
                  </span>
                  <select
                    value={sorting.sortOrder}
                    onChange={(e) =>
                      setSortingStore({ ...sorting, sortOrder: e.target.value as 'asc' | 'desc' })
                    }
                    className="px-2 py-1 text-xs rounded-md border bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="desc">Newest First</option>
                    <option value="asc">Oldest First</option>
                  </select>
                </div>
                {/* Group 3: Jira & Sync */}
                {jiraIntegrations.length > 1 && (
                  <>
                    <div className="flex gap-2 items-center">
                      <span className="text-xs font-medium whitespace-nowrap text-muted-foreground">
                        Jira:
                      </span>
                      <select
                        value={selectedJiraId || ''}
                        onChange={(e) =>
                          setSelectedJiraId(e.target.value ? Number(e.target.value) : undefined)
                        }
                        className="px-2 py-1 text-xs rounded-md border bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary"
                      >
                        <option value="">Select Instance</option>
                        {jiraIntegrations.map((jira) => (
                          <option key={jira.id} value={jira.id}>
                            {jira.config.projectKey || jira.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </>
                )}

                <Button
                  onClick={handleSyncAll}
                  size="sm"
                  className="ml-auto"
                  disabled={
                    !hasPermission(Permission.MANAGE_TICKETS) ||
                    jiraIntegrations.length === 0 ||
                    (jiraIntegrations.length > 1 && !selectedJiraId)
                  }
                  isLoading={isSyncingAll}
                  title={
                    !hasPermission(Permission.MANAGE_TICKETS)
                      ? 'You need MANAGE_TICKETS permission to sync to Jira'
                      : ''
                  }
                >
                  <Send className="mr-2 w-4 h-4" />
                  Sync to Jira
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {loading ? (
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <Card key={i} className="animate-pulse">
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
              <ListCard
                key={ticket.id}
                header={
                  <>
                    <h3 className="text-lg font-semibold break-words w-full">{ticket.title}</h3>
                    <div className="flex gap-2 items-center">
                      <span className="text-xs font-medium text-muted-foreground">Status:</span>
                      <Badge variant={statusColors[ticket.status]}>{ticket.status}</Badge>
                    </div>
                    <div className="flex gap-2 items-center">
                      <span className="text-xs font-medium text-muted-foreground">Priority:</span>
                      <Badge variant={priorityColors[ticket.priority]}>{ticket.priority}</Badge>
                    </div>
                    {ticket.categoryName && (
                      <div className="flex gap-2 items-center">
                        <span className="text-xs font-medium text-muted-foreground">Category:</span>
                        <Badge variant="default">{ticket.categoryName}</Badge>
                      </div>
                    )}
                    {ticket.externalId && ticket.externalUrl && (
                      <ExternalLink
                        href={ticket.externalUrl}
                        className="text-xs"
                        onClick={() => {
                          console.log('Opening Jira URL:', ticket.externalUrl);
                        }}
                      >
                        {ticket.externalId}
                      </ExternalLink>
                    )}
                  </>
                }
                content={
                  <p className="text-sm text-muted-foreground line-clamp-2">{ticket.description}</p>
                }
                metadata={
                  <>
                    <span className="break-all">From: {ticket.sender}</span>
                    {ticket.categoryName && <span>• {ticket.categoryName}</span>}
                    <span className="whitespace-nowrap">• {formatDate(ticket.createdAt)}</span>
                  </>
                }
                actions={
                  <>
                    <Button size="sm" variant="outline" onClick={() => setSelectedTicket(ticket)}>
                      <ExternalLinkIcon className="mr-1 w-3 h-3" />
                      Open
                    </Button>
                    <PermissionGuard permission={Permission.MANAGE_TICKETS}>
                      {!ticket.externalId && (
                        <Link to={`/tickets/edit/${ticket.id}`}>
                          <Button size="sm" variant="outline">
                            <Edit2 className="mr-1 w-3 h-3" />
                            Edit
                          </Button>
                        </Link>
                      )}
                      {!ticket.externalId && (
                        <Button
                          size="sm"
                          onClick={() => handlePushToJira(ticket.id)}
                          isLoading={syncing === ticket.id}
                        >
                          <Send className="mr-1 w-3 h-3" />
                          Push
                        </Button>
                      )}
                    </PermissionGuard>
                    <PermissionGuard
                      permissions={[Permission.DELETE_TICKETS, Permission.MANAGE_ORGANIZATION]}
                    >
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleDeleteClick(ticket)}
                        aria-label="Delete ticket"
                      >
                        <Trash2 className="mr-2 w-4 h-4" />
                        Delete
                      </Button>
                    </PermissionGuard>
                  </>
                }
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
            <div className="p-4 mt-4 bg-gray-50 rounded">
              <p className="text-sm font-medium">{ticketToDelete.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Status: {ticketToDelete.status} | Priority: {ticketToDelete.priority}
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
          <p className="text-sm text-gray-500 mt-2">
            This will create Jira issues for all tickets that haven't been synced yet.
          </p>
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" onClick={() => setSyncDialogOpen(false)}>
            Cancel
          </Button>
          <Button onClick={confirmSyncAll}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Sync All
          </Button>
        </DialogFooter>
      </Dialog>

      {/* Ticket Detail Drawer */}
      {selectedTicket && (
        <Drawer
          open={!!selectedTicket}
          onClose={() => setSelectedTicket(null)}
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
            isPushingToJira={syncing === selectedTicket.id}
          />
        </Drawer>
      )}
    </Layout>
  );
};
