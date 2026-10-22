import { useEffect, useState, useCallback, useRef } from 'react';
import { ArrowUp, MessagesSquare, RefreshCw, Send } from 'lucide-react';
import { TicketDeleteDialog, TicketSyncAllDialog } from '@/components/tickets/TicketsJiraDialogs';
import { TicketsViewToggle } from '@/components/tickets/TicketsViewToggle';
import { useDepartmentContextKey } from '@/hooks/useDepartmentContextKey';
import { useTicketsUrlSync } from '@/hooks/useTicketsUrlSync';
import { useTicketsRealtime } from '@/hooks/useTicketsRealtime';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { PageHeader } from '@/components/shared/PageHeader';
import { TicketDetail } from '@/components/tickets/TicketDetail';
import { TicketFilterBar } from '@/components/tickets/list/TicketFilterBar';
import { TicketViewPills } from '@/components/tickets/list/TicketViewPills';
import { buildTicketFilterKeys } from '@/components/tickets/list/ticketFilterKeys';
import { viewFiltersOf } from '@/components/tickets/list/ticketViews';
import { useTicketFilterSources } from '@/components/tickets/list/useTicketFilterSources';
import { useTicketViews } from '@/components/tickets/list/useTicketViews';
import { TicketTable } from '@/components/tickets/list/TicketTable';
import { TicketRowMenuItems } from '@/components/tickets/list/TicketRowMenuItems';
import { useTicketListPrefs } from '@/components/tickets/list/useTicketListPrefs';
import { useTicketJiraActions } from '@/components/tickets/list/useTicketJiraActions';
import { useNewTicketsBar } from '@/components/tickets/list/useNewTicketsBar';
import { TicketPanel } from '@/components/tickets/list/TicketPanel';
import { useTicketKeys } from '@/components/tickets/list/useTicketKeys';
import { assignmentService } from '@/services/assignment.service';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { NewTicketButton } from '@/components/tickets/NewTicketButton';
import { TicketsKanbanView } from '@/components/tickets/TicketsKanbanView';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Drawer } from '@/components/ui/Drawer';
import { Pagination } from '@/components/ui/Pagination';
import { usePermissions } from '@/hooks/usePermissions';
import { PAGINATION } from '@/lib/constants';
import { type JiraIntegration } from '@/services/integrations.service';
import { ticketService, type PaginationMeta } from '@/services/ticket.service';
import { useTicketsStore } from '@/stores/ticketsStore';
import { useAuthStore } from '@/stores/authStore';
import { ticketApiFilters } from '@/components/tickets/list/ticketFilters';
import type { Ticket as TicketType, TicketsDisplayMode } from '@/types';
import { Permission } from '@/types/roles';
import { logger } from '@/lib/logger';
import { toast } from '@/lib/toast';

export const TicketsPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [displayMode, setDisplayMode] = useState<TicketsDisplayMode>(() => {
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
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [ticketToDelete, setTicketToDelete] = useState<TicketType | null>(null);
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
  const clearFiltersStore = useTicketsStore((state) => state.clearFilters);
  const setSortingStore = useTicketsStore((state) => state.setSorting);
  const setTicketsCache = useTicketsStore((state) => state.setTickets);
  const getCached = useTicketsStore((state) => state.getCached);
  const clearCache = useTicketsStore((state) => state.clearCache);

  const { hasPermission, hasAnyPermission } = usePermissions();
  const currentUserId = useAuthStore((state) => state.user?.id ?? null);
  // Bumped by a realtime ticket event or a change made here, so the pill counts follow the list.
  const [countsKey, setCountsKey] = useState(0);
  const filterSources = useTicketFilterSources();

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

  useTicketsUrlSync({ displayMode, setSelectedTicket });

  // Re-fetch when the dept-context checkboxes change.
  const selectedDeptKey = useDepartmentContextKey();
  const { views, counts, saveView, deleteView } = useTicketViews(
    currentUserId,
    `${countsKey}:${selectedDeptKey}`
  );

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
      // A forced fetch means something changed (realtime, a write here): the pill counts follow.
      if (force) setCountsKey((key) => key + 1);
      try {
        const apiFilters = ticketApiFilters(filters, currentUserId);

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
            void fetchTickets(1).catch((error) => {
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
    // selectedDeptKey is a refresh trigger — read indirectly via the axios
    // X-Department-Context header. Force callback identity to change on toggle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filters, sorting, currentUserId, getCached, setTicketsCache, selectedDeptKey]
  );

  useEffect(() => {
    fetchTickets(1).catch((error) => {
      logger.error('Failed to fetch tickets:', error);
    });
  }, [fetchTickets]);

  const newTickets = useNewTicketsBar(ticketApiFilters(filters, currentUserId), sorting);

  useTicketsRealtime({
    onTicketCreated:
      displayMode === 'list'
        ? (ticketId) => {
            newTickets.onCreated(ticketId);
            setCountsKey((key) => key + 1);
          }
        : undefined,
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

  const clearFilters = () => {
    clearFiltersStore();
    setPendingSearch('');
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchTickets(pagination.page, true); // Force refetch
    setRefreshing(false);
  };

  const {
    syncing,
    isSyncingAll,
    syncDialogOpen,
    setSyncDialogOpen,
    handlePushToJira,
    handleSyncAll,
    confirmSyncAll,
  } = useTicketJiraActions({
    canManage: hasPermission(Permission.MANAGE_TICKETS),
    jiraIntegrations,
    selectedJiraId,
    setAlertDialog,
    clearCache,
    fetchTickets,
  });

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

  const { density, layout, group, setDensity, setLayout, setGroup } = useTicketListPrefs();
  // Split shows the list and the ticket side by side; below 1100 px there is no room for both.
  const splitAvailable = useMediaQuery('(min-width: 1100px)');

  const openTicket = (ticket: TicketType) => {
    setSelectedTicket(ticket);
    setSearchParams((params) => {
      params.set('id', ticket.id.toString());
      return params;
    });
  };

  const handleAssign = async (ticketId: number, userId: number | null) => {
    try {
      await assignmentService.assignTicket(ticketId, userId);
      toast.success(
        userId === null
          ? `#${ticketId} unassigned`
          : userId === currentUserId
            ? `#${ticketId} claimed — assigned to you`
            : `#${ticketId} re-assigned`
      );
      clearCache();
      await fetchTickets(pagination.page, true);
    } catch (error) {
      logger.error('Failed to assign ticket:', error);
      toast.failure('change who owns this ticket', error);
    }
  };

  const copyLink = (ticketId: number) => {
    const url = `${window.location.origin}/tickets?id=${ticketId}`;
    navigator.clipboard
      .writeText(url)
      .then(() => toast.success('Link copied'))
      .catch((error: unknown) => toast.failure('copy the link', error));
  };

  const rowMenu = (ticket: TicketType) => (
    <TicketRowMenuItems
      ticket={ticket}
      canManage={hasPermission(Permission.MANAGE_TICKETS)}
      canDelete={hasAnyPermission([Permission.DELETE_TICKETS, Permission.MANAGE_ORGANIZATION])}
      jiraOn={jiraIntegrations.length > 0}
      onOpen={openTicket}
      onCopyLink={copyLink}
      onPushToJira={(ticketId) => void handlePushToJira(ticketId)}
      onDelete={handleDeleteClick}
    />
  );

  const filterKeys = buildTicketFilterKeys({
    ...filterSources,
    jiraOn: jiraIntegrations.length > 0,
  });

  const closeTicket = () => {
    setSearchParams((params) => {
      params.delete('id');
      return params;
    });
    setSelectedTicket(null);
    // Back to the row the agent came from, so J/K in the list carries on from there.
    const back = selectedTicket?.id;
    if (back !== undefined) {
      setTimeout(() => {
        document
          .querySelector<HTMLElement>(`[data-ticket-row="${back}"]`)
          ?.focus({ preventScroll: true });
      });
    }
  };
  const openIndex = selectedTicket
    ? tickets.findIndex((ticket) => ticket.id === selectedTicket.id)
    : -1;
  const prevTicket = openIndex > 0 ? tickets[openIndex - 1] : null;
  const nextTicket =
    openIndex >= 0 && openIndex < tickets.length - 1 ? tickets[openIndex + 1] : null;
  const goTo = (ticketId: number) => {
    const target = tickets.find((ticket) => ticket.id === ticketId);
    if (target) openTicket(target);
  };
  const splitOn = layout === 'split' && splitAvailable && displayMode === 'list';

  useTicketKeys({
    open: !!selectedTicket,
    onNext: () => nextTicket && openTicket(nextTicket),
    onPrev: () => prevTicket && openTicket(prevTicket),
    onClose: closeTicket,
    onSlash: () => document.querySelector<HTMLInputElement>('[data-ticket-search] input')?.focus(),
  });

  const ticketPanel = selectedTicket ? (
    <TicketPanel
      ticketId={selectedTicket.id}
      prevId={prevTicket?.id ?? null}
      nextId={nextTicket?.id ?? null}
      onGo={goTo}
      onClose={closeTicket}
      onFullPage={() => navigate(`/tickets/${selectedTicket.id}`)}
      onCopyLink={() => copyLink(selectedTicket.id)}
    >
      <TicketDetail
        // One mount per ticket, as MessageDetail is: state (labels, pickers, in-flight writes)
        // from the ticket you left must not show — or act — on the next one.
        key={selectedTicket.id}
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
    </TicketPanel>
  ) : null;

  return (
    <Layout>
      <div
        className={
          splitOn ? 'grid grid-cols-[minmax(400px,40%)_minmax(0,1fr)] gap-4 px-4 w-full' : ''
        }
      >
        <div className={splitOn ? 'space-y-4 min-w-0' : 'px-4 mx-auto space-y-4 w-full'}>
          {/* Header */}
          <div className="mb-6">
            <PageHeader
              title="Tickets"
              description="Manage and track support tickets"
              actions={
                <>
                  {jiraIntegrations.length > 1 && (
                    <Select
                      value={selectedJiraId?.toString() ?? ''}
                      onChange={(value) => setSelectedJiraId(value ? Number(value) : undefined)}
                      options={[
                        { value: '', label: 'All Jira' },
                        ...jiraIntegrations.map((jira) => ({
                          value: jira.id.toString(),
                          label: jira.name,
                        })),
                      ]}
                      size="sm"
                      aria-label="Jira integration"
                      className="w-40"
                    />
                  )}
                  {jiraIntegrations.length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleSyncAll}
                      disabled={
                        !hasPermission(Permission.MANAGE_TICKETS) ||
                        isSyncingAll ||
                        (jiraIntegrations.length > 1 && !selectedJiraId)
                      }
                      isLoading={isSyncingAll}
                    >
                      <Send className="mr-2 w-4 h-4" />
                      Sync to Jira
                    </Button>
                  )}
                  <NewTicketButton variant="outline" />
                  <Button onClick={handleRefresh} disabled={refreshing}>
                    <RefreshCw className={`mr-2 w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                    Refresh
                  </Button>
                </>
              }
            />
          </div>

          {/* Views and filters — the Messages pattern */}
          <TicketViewPills
            filters={filters}
            views={views}
            counts={counts}
            onApply={(next) => {
              setPendingSearch('');
              setFiltersStore(next);
            }}
            onSave={(name) => saveView(name, viewFiltersOf(filters))}
            onDelete={(view) =>
              void deleteView(view).catch((error: unknown) => toast.failure('delete this view', error))
            }
          />
          <TicketFilterBar
            filters={filters}
            keys={filterKeys}
            search={pendingSearch}
            onChange={setFiltersStore}
            onSearchChange={(value) => handleFilterChange('search', value)}
            onSearch={handleSearch}
            onClear={clearFilters}
          />

          {/* Display mode toggle */}
          <TicketsViewToggle displayMode={displayMode} onModeChange={setDisplayMode} />

          {displayMode === 'list' && newTickets.count > 0 && (
            <div className="flex justify-center">
              <Button
                size="sm"
                className="rounded-full shadow-lg"
                onClick={() => {
                  newTickets.reset();
                  clearCache();
                  void fetchTickets(1, true);
                  window.scrollTo({ top: 0 });
                }}
              >
                <ArrowUp className="mr-1.5 w-3.5 h-3.5" />
                {newTickets.count} new {newTickets.count === 1 ? 'ticket' : 'tickets'} — show
              </Button>
            </div>
          )}

          {displayMode === 'kanban' ? (
            <TicketsKanbanView
              filters={filters}
              onOpen={(ticket) => {
                setSelectedTicket(ticket);
                setSearchParams((params) => {
                  params.set('id', ticket.id.toString());
                  return params;
                });
              }}
            />
          ) : (
            <TicketTable
              tickets={tickets}
              total={pagination.total}
              loading={loading}
              filters={filters}
              sorting={sorting}
              keys={filterKeys}
              density={density}
              group={group}
              layout={layout}
              splitAvailable={splitAvailable}
              canManage={hasPermission(Permission.MANAGE_TICKETS)}
              assignees={filterSources.assignees}
              currentUserId={currentUserId}
              currentId={selectedTicket?.id ?? null}
              onOpen={openTicket}
              onAssign={(ticketId, userId) => void handleAssign(ticketId, userId)}
              onRowMenu={rowMenu}
              onFilters={setFiltersStore}
              onSort={setSortingStore}
              onDensity={setDensity}
              onGroup={setGroup}
              onLayout={setLayout}
              onClearFilters={clearFilters}
              emptyAction={<NewTicketButton />}
            />
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
        {splitOn && (
          <aside
            aria-label="Open ticket"
            className="sticky top-4 self-start h-[calc(100vh-6rem)] overflow-hidden rounded-lg border border-border bg-card"
          >
            {ticketPanel ?? (
              <div className="grid place-content-center justify-items-center gap-2 h-full text-[13.5px] text-muted-foreground">
                <MessagesSquare className="w-6 h-6" />
                Select a ticket to read it here.
              </div>
            )}
          </aside>
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

      {/* The open ticket: a side sheet over the list, unless the split pane shows it */}
      {selectedTicket && !splitOn && (
        <Drawer
          open
          onClose={closeTicket}
          title={`Ticket #${selectedTicket.id}`}
          size="sheet"
          bodyClassName="p-0"
          header={null}
        >
          {ticketPanel}
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
