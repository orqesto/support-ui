import { useEffect, useState, useCallback, useRef } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { FileText, MessageSquare, Settings, X, Filter, Library } from 'lucide-react';
import { Tabs, type Tab } from '@/components/ui/Tabs';
import { KBEntryCard } from '@/components/kb/KBEntryCard';
import { KBEntryDetail } from '@/components/kb/KBEntryDetail';
import { KBTableView } from '@/components/kb/KBTableView';
import { Layout } from '@/components/layout/Layout';
import { PageHeader } from '@/components/shared/PageHeader';
import { ConfluenceCatalogSection } from '@/components/knowledge-base/ConfluenceCatalogSection';
import { MessageSourceFilter, ALL_SOURCES } from '@/components/messages/MessageSourceFilter';
import { DocumentationSettings } from '@/components/settings/DocumentationSettings';
import { AlertDialog } from '@/components/ui/AlertDialog';
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
import { Pagination } from '@/components/ui/Pagination';
import { SearchInput } from '@/components/ui/SearchInput';
import { useDepartmentContextKey } from '@/hooks/useDepartmentContextKey';
import { usePermissions } from '@/hooks/usePermissions';
import { logger } from '@/lib/logger';
import { kbService, type KBEntry, type PaginationMeta } from '@/services/kb.service';
import { Permission } from '@/types/roles';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useUiFlags } from '@/hooks/useUiFlags';
import { isCaseRow, unmergeConsequence } from '@/lib/kbConsolidation';
import { runCaseAction, type CaseActionNow } from '@/components/kb/runCaseAction';

/** An action on a merged CASE row — each one unmerges it, so each is confirmed first. */
/** What a case action sees once the page is gone: no drawer to close, nothing to re-read. */
const LEFT_PAGE: CaseActionNow = {
  selectedId: null,
  close: () => {},
  refetch: () => Promise.resolve(),
};

type CaseAction = { entry: KBEntry; action: 'hide' | 'reject' | 'delete' | 'unmerge' };

const CASE_ACTION_TITLES: Record<CaseAction['action'], string> = {
  hide: 'Hide this case?',
  reject: 'Reject this case?',
  delete: 'Delete this case?',
  unmerge: 'Unmerge this case?',
};

type FilterType = 'all' | 'qa_pair' | 'document' | 'documentation';
type FilterStatus = 'all' | 'approved' | 'pending' | 'hidden' | 'rejected';

const VALID_FILTER_TYPES: FilterType[] = ['all', 'qa_pair', 'document', 'documentation'];
const VALID_FILTER_STATUSES: FilterStatus[] = ['all', 'approved', 'pending', 'hidden', 'rejected'];

export const KnowledgeBasePage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Get active tab from URL hash, default to 'all'
  const hashTab = location.hash.replace('#', '') as FilterType;
  const activeTab: FilterType = VALID_FILTER_TYPES.includes(hashTab) ? hashTab : 'all';
  const [entries, setEntries] = useState<KBEntry[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta>({
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [pendingSearch, setPendingSearch] = useState('');
  const filterType = activeTab; // Use hash-based tab as filter type
  // `?status=pending` is where the review notification's "See all" lands.
  const [filterStatus, setFilterStatus] = useState<FilterStatus>(() => {
    const requested = searchParams.get('status');
    return VALID_FILTER_STATUSES.includes(requested as FilterStatus)
      ? (requested as FilterStatus)
      : 'all';
  });
  // Approve / reject / hide / edit need manage_knowledge_base (moderator, org admin). Everyone
  // else is capped to approved entries by the server, so the review filters and buttons would
  // only ever fail for them.
  const { hasPermission } = usePermissions();
  const canReview = hasPermission(Permission.MANAGE_KNOWLEDGE_BASE);
  // Source filter — 'all' = no source narrowing. Maps to kbService messageSourceId.
  const [filterSource, setFilterSource] = useState<string>(ALL_SOURCES);

  // Handle tab change by updating URL hash via React Router
  const handleTabChange = (tabId: FilterType) => {
    navigate('#' + tabId, { replace: true });
  };
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [entryToDelete, setEntryToDelete] = useState<KBEntry | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<KBEntry | null>(null);
  // Shared KB revision: the Confluence catalog and the Documentation list are separate
  // components over an overlapping doc set, so a mutation in one bumps this to make the
  // other re-fetch (Process adds a doc → list refreshes; Remove/Delete → both refresh).
  const [kbVersion, setKbVersion] = useState(0);
  const bumpKb = useCallback(() => setKbVersion((version) => version + 1), []);
  const [caseAction, setCaseAction] = useState<CaseAction | null>(null);
  const { isSurfaceVisibleToMe } = useUiFlags();
  const showCasesLink = canReview && isSurfaceVisibleToMe('ui.kb_cases');

  // Alert dialog state
  const [alertDialog, setAlertDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    variant: 'success' | 'error' | 'warning' | 'info';
  }>({ open: false, title: '', description: '', variant: 'info' });
  // BE `knowledgeBaseController.getAll` is dept-scoped via X-Department-Context.
  const selectedDeptKey = useDepartmentContextKey();
  const fetchEntries = useCallback(
    async (page = 1) => {
      try {
        setLoading(true);
        const response = await kbService.getAll({
          type: filterType === 'all' ? undefined : filterType,
          page,
          limit: pagination.limit,
          search: searchQuery || undefined,
          status: filterStatus === 'all' ? undefined : filterStatus,
          messageSourceId: filterSource === ALL_SOURCES ? undefined : Number(filterSource),
        });
        setEntries(response.data.entries);
        setPagination(response.data.pagination);
      } catch (error) {
        logger.error('Failed to fetch KB entries:', error);
        setAlertDialog({
          open: true,
          title: 'Failed to Load',
          description: error instanceof Error ? error.message : 'Failed to fetch KB entries',
          variant: 'error',
        });
      } finally {
        setLoading(false);
      }
    },
    // selectedDeptKey forces re-create on dept toggle; consumer useEffect re-runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filterType, filterStatus, filterSource, searchQuery, pagination.limit, selectedDeptKey]
  );

  // Refetch when filters change (immediate, no debounce)
  // Skip fetching when on Documentation tab (shows settings, not KB entries)
  useEffect(() => {
    if (filterType !== 'documentation') {
      void fetchEntries(1); // Reset to page 1 when filters change
    }
  }, [filterType, filterStatus, searchQuery, fetchEntries]);

  // Handle ID URL parameter (e.g., /knowledge-base?id=123)
  // Similar to Messages and Tickets pages - keeps ID in URL for sharing and refresh
  useEffect(() => {
    const idParam = searchParams.get('id');
    if (!idParam) return;
    const id = parseInt(idParam, 10);
    if (isNaN(id)) return;
    if (selectedEntry?.id === id) return; // already showing this entry — don't re-fetch
    void kbService
      .getById(id)
      .then((response: { data: KBEntry }) => {
        setSelectedEntry(response.data);
      })
      .catch((error: Error) => {
        logger.error('Failed to fetch KB entry:', error);
        setAlertDialog({
          open: true,
          title: 'Entry Not Found',
          description: 'Could not find the requested knowledge base entry.',
          variant: 'error',
        });
        const params = new URLSearchParams(searchParams);
        params.delete('id');
        // setSearchParams strips location.hash — go through navigate to keep the tab hash.
        navigate({ search: params.toString(), hash: location.hash }, { replace: true });
      });
  }, [searchParams]);

  const handleSearch = () => {
    // Trigger actual search when button clicked or Enter pressed
    setSearchQuery(pendingSearch);
  };

  const handleSearchChange = (value: string) => {
    setPendingSearch(value);
    // If clearing the input (X button), also clear the active search
    if (!value.trim() && searchQuery) {
      setSearchQuery('');
    }
  };

  const handleSearchBlur = () => {
    // If search is empty on blur, clear the search filter to show all data
    if (!pendingSearch.trim() && searchQuery) {
      setSearchQuery('');
    }
  };

  const clearFilters = () => {
    handleTabChange('all');
    setFilterStatus('all');
    setFilterSource(ALL_SOURCES);
    setSearchQuery('');
    setPendingSearch('');
  };

  const activeFilterCount =
    (filterType !== 'all' ? 1 : 0) +
    (filterStatus !== 'all' ? 1 : 0) +
    (filterSource !== ALL_SOURCES ? 1 : 0) +
    (searchQuery?.trim() ? 1 : 0);

  const handleApprove = async (id: number) => {
    try {
      await kbService.approve(id);
      // Update entry in place - set approved and unhidden
      // Approving also restores a rejected entry — the backend clears the rejection.
      // Approving also ends "detached": the backend drops the entry's case pointer (AUD11 LOW-1),
      // so a later Hide must read "Hidden", not "detached from case" (FE pass 14 LOW-1).
      setEntries((prev) =>
        prev.map((entry) =>
          entry.id === id
            ? {
                ...entry,
                approved: true,
                hidden: false,
                rejectedAt: null,
                rejectedBy: null,
                consolidation:
                  entry.consolidation?.state === 'detached' ? undefined : entry.consolidation,
              }
            : entry
        )
      );
    } catch (error) {
      logger.error('Failed to approve entry:', error);
      setAlertDialog({
        open: true,
        title: 'Failed to Approve',
        description: error instanceof Error ? error.message : 'Failed to approve KB entry',
        variant: 'error',
      });
    }
  };

  const rejectEntry = async (id: number) => {
    try {
      const response = await kbService.reject(id);
      const rejectedAt = response.data?.rejectedAt ?? new Date().toISOString();
      setEntries((prev) =>
        prev.map((entry) =>
          entry.id === id ? { ...entry, approved: false, hidden: true, rejectedAt } : entry
        )
      );
    } catch (error) {
      logger.error('Failed to reject entry:', error);
      setAlertDialog({
        open: true,
        title: 'Failed to Reject',
        description: error instanceof Error ? error.message : 'Failed to reject KB entry',
        variant: 'error',
      });
    }
  };

  const hideEntry = async (id: number) => {
    try {
      await kbService.hide(id);
      // Update entry in place - set hidden
      setEntries((prev) =>
        prev.map((entry) => (entry.id === id ? { ...entry, hidden: true, approved: false } : entry))
      );
    } catch (error) {
      logger.error('Failed to hide entry:', error);
      setAlertDialog({
        open: true,
        title: 'Failed to Hide',
        description: error instanceof Error ? error.message : 'Failed to hide KB entry',
        variant: 'error',
      });
    }
  };

  // KB consolidation (#873): hide / reject / delete on a merged CASE row unmerge it — the case
  // goes and its originals come back. That is not what "hide" usually means, so it is said and
  // confirmed first, never done on one click.
  const findEntry = (id: number) =>
    entries.find((entry) => entry.id === id) ?? (selectedEntry?.id === id ? selectedEntry : null);

  const handleHide = (id: number) => {
    const entry = findEntry(id);
    if (entry && isCaseRow(entry)) setCaseAction({ entry, action: 'hide' });
    else void hideEntry(id);
  };

  const handleReject = (id: number) => {
    const entry = findEntry(id);
    if (entry && isCaseRow(entry)) setCaseAction({ entry, action: 'reject' });
    else void rejectEntry(id);
  };

  const handleDeleteClick = (entry: KBEntry) => {
    if (isCaseRow(entry)) setCaseAction({ entry, action: 'delete' });
    else openDeleteDialog(entry);
  };

  const handleUnmerge = (entry: KBEntry) => setCaseAction({ entry, action: 'unmerge' });

  const confirmCaseAction = async () => {
    if (!caseAction) return;
    const { entry, action } = caseAction;
    setCaseAction(null);
    // One action per case at a time: a second confirm while the first runs would only come back
    // 404 and replace the real result with "Already unmerged" (FE pass 17 LOW-2).
    if (inFlight.current.has(entry.id)) return;
    inFlight.current.add(entry.id);
    try {
      setAlertDialog(await runCaseAction(entry, action, () => latest.current));
    } finally {
      inFlight.current.delete(entry.id);
    }
  };

  const handleUpdate = (updatedEntry: KBEntry) => {
    // Update entry in the list
    setEntries((prev) =>
      prev.map((entry) => (entry.id === updatedEntry.id ? updatedEntry : entry))
    );
    setAlertDialog({
      open: true,
      title: 'Success',
      description: 'KB entry updated successfully',
      variant: 'success',
    });
  };

  // Handle opening entry - update URL with ID
  const handleOpenEntry = (entry: KBEntry) => {
    setSelectedEntry(entry);
    const params = new URLSearchParams(searchParams);
    params.set('id', entry.id.toString());
    // setSearchParams strips location.hash — go through navigate to keep the tab hash.
    navigate({ search: params.toString(), hash: location.hash }, { replace: true });
  };

  // Handle closing entry - remove ID from URL
  const handleCloseEntry = () => {
    setSelectedEntry(null);
    const params = new URLSearchParams(searchParams);
    params.delete('id');
    // setSearchParams strips location.hash — go through navigate to keep the tab hash.
    navigate({ search: params.toString(), hash: location.hash });
  };

  // What a case action reads when its request ANSWERS, not when its confirm was clicked.
  const latest = useRef<CaseActionNow>(LEFT_PAGE);
  useEffect(() => {
    latest.current = {
      selectedId: selectedEntry?.id ?? null,
      close: handleCloseEntry,
      refetch: () => fetchEntries(pagination.page),
    };
  });
  // Left the page mid-request: the answer must not navigate back here or re-read (pass 17 LOW-1).
  useEffect(() => () => void (latest.current = LEFT_PAGE), []);
  const inFlight = useRef(new Set<number>());

  const openDeleteDialog = (entry: KBEntry) => {
    setEntryToDelete(entry);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!entryToDelete) {
      return;
    }

    setDeleting(true);
    try {
      await kbService.delete(entryToDelete.id);
      setDeleteDialogOpen(false);
      setEntryToDelete(null);
      await fetchEntries();
      setAlertDialog({
        open: true,
        title: 'Success',
        description: 'KB entry deleted',
        variant: 'success',
      });
    } catch (error) {
      logger.error('Failed to delete entry:', error);
      setAlertDialog({
        open: true,
        title: 'Delete Failed',
        description: 'Failed to delete entry',
        variant: 'error',
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Layout>
      <div className="px-4 mx-auto space-y-4 w-full">
        {/* Header */}
        <div className="mb-6">
          <PageHeader
            title="Knowledge Base"
            description="Review and manage automatically extracted knowledge from your messages"
          />
          {showCasesLink && (
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => navigate('/knowledge-base/cases')}
            >
              Cases report
            </Button>
          )}
        </div>

        {/* Tabs for Type Selection */}
        <Tabs
          tabs={
            [
              {
                id: 'all' as const,
                label: 'All',
                icon: Library,
                description: 'View all knowledge base entries',
              },
              {
                id: 'qa_pair' as const,
                label: 'Q&A Pairs',
                icon: MessageSquare,
                description: 'Questions and answers extracted from messages',
              },
              {
                id: 'document' as const,
                label: 'Documents',
                icon: FileText,
                description: 'Processed documents and attachments',
              },
              {
                id: 'documentation' as const,
                label: 'Documentation',
                icon: Settings,
                description: 'Configure KB extraction rules and settings',
              },
            ] satisfies Tab<FilterType>[]
          }
          activeTab={filterType}
          onTabChange={handleTabChange}
          variant="default"
          size="md"
          fullWidth
        />

        {/* Filters Card - Hidden in Documentation tab */}
        {filterType !== 'documentation' && (
          <Card className="mb-6">
            <CardContent className="p-4">
              <div className="space-y-4">
                {/* Header */}
                <div className="flex flex-wrap gap-3 justify-between items-center">
                  <div className="flex flex-wrap gap-3 items-center">
                    <div className="flex gap-2 items-center">
                      <Filter className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm font-semibold">Filters</span>
                      {activeFilterCount > 0 && (
                        <Badge variant="default" className="text-xs">
                          {activeFilterCount}
                        </Badge>
                      )}
                    </div>
                    {pagination.total > 0 && (
                      <span className="text-xs whitespace-nowrap text-muted-foreground">
                        {(pagination.page - 1) * pagination.limit + 1}-
                        {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
                        {pagination.total}
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2 items-center">
                    {activeFilterCount > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={clearFilters}
                        className="h-8 shrink-0"
                      >
                        <X className="mr-1 w-3 h-3" />
                        Clear All
                      </Button>
                    )}
                  </div>
                </div>

                {/* Filter Controls */}
                <div className="flex flex-col gap-3">
                  {/* Search */}
                  <SearchInput
                    value={pendingSearch}
                    onChange={handleSearchChange}
                    onSearch={handleSearch}
                    onBlur={handleSearchBlur}
                    showSearchButton={true}
                    placeholder="Search by ID, title, content, or category..."
                    className="w-full"
                    size="sm"
                  />

                  {/* Status Filter — reviewers only: the server caps everyone else to approved. */}
                  {canReview && (
                    <div className="flex flex-col gap-2">
                      <span className="text-xs font-semibold text-muted-foreground">Status:</span>
                      <div className="flex rounded-md shadow-sm w-fit">
                        <Button
                          variant={filterStatus === 'approved' ? 'primary' : 'outline'}
                          size="sm"
                          onClick={() => setFilterStatus('approved')}
                          className="h-8 text-xs rounded-r-none rounded-l-md border-r-0"
                        >
                          Approved
                        </Button>
                        <Button
                          variant={filterStatus === 'pending' ? 'primary' : 'outline'}
                          size="sm"
                          onClick={() => setFilterStatus('pending')}
                          className="h-8 text-xs rounded-none border-r-0"
                        >
                          Pending
                        </Button>
                        <Button
                          variant={filterStatus === 'hidden' ? 'primary' : 'outline'}
                          size="sm"
                          onClick={() => setFilterStatus('hidden')}
                          className="h-8 text-xs rounded-none border-r-0"
                        >
                          Hidden
                        </Button>
                        <Button
                          variant={filterStatus === 'rejected' ? 'primary' : 'outline'}
                          size="sm"
                          onClick={() => setFilterStatus('rejected')}
                          className="h-8 text-xs rounded-none border-r-0"
                          title="Rejected by a reviewer — deleted 90 days after the reject"
                        >
                          Rejected
                        </Button>
                        <Button
                          variant={filterStatus === 'all' ? 'primary' : 'outline'}
                          size="sm"
                          onClick={() => setFilterStatus('all')}
                          className="h-8 text-xs rounded-r-md rounded-l-none"
                        >
                          All
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Source Filter */}
                  <div className="flex flex-col gap-2">
                    <span className="text-xs font-semibold text-muted-foreground">Source:</span>
                    <MessageSourceFilter
                      value={filterSource}
                      onChange={setFilterSource}
                      className="w-full sm:w-64"
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Documentation Tab Content */}
        {filterType === 'documentation' ? (
          <>
            <ConfluenceCatalogSection refreshSignal={kbVersion} onKbChange={bumpKb} />
            <DocumentationSettings refreshSignal={kbVersion} onKbChange={bumpKb} />
          </>
        ) : (
          <>
            {/* Mobile Card View */}
            <div className="space-y-3 md:hidden">
              {loading ? (
                <div className="p-8 text-center">Loading...</div>
              ) : entries.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">No entries found</div>
              ) : (
                entries.map((entry) => (
                  <KBEntryCard
                    key={entry.id}
                    entry={entry}
                    onView={handleOpenEntry}
                    onApprove={handleApprove}
                    onHide={handleHide}
                    onReject={handleReject}
                    onDelete={handleDeleteClick}
                    canReview={canReview}
                    onUnmerge={handleUnmerge}
                  />
                ))
              )}
            </div>

            {/* Desktop Table View */}
            <KBTableView
              entries={entries}
              loading={loading}
              onView={handleOpenEntry}
              onApprove={handleApprove}
              onHide={handleHide}
              onReject={handleReject}
              onDelete={handleDeleteClick}
              canReview={canReview}
              onUnmerge={handleUnmerge}
            />

            {/* Pagination */}
            {!loading && pagination.totalPages > 1 && (
              <Pagination
                currentPage={pagination.page}
                totalPages={pagination.totalPages}
                total={pagination.total}
                limit={pagination.limit}
                onPageChange={(page) => void fetchEntries(page)}
                loading={loading}
              />
            )}

            {/* Delete Confirmation Dialog */}
            <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
              <DialogHeader>
                <DialogTitle>Delete KB Entry</DialogTitle>
                <DialogClose onClose={() => setDeleteDialogOpen(false)} />
              </DialogHeader>
              <DialogContent>
                <p>Are you sure you want to delete this entry? This action cannot be undone.</p>
                {entryToDelete && (
                  <div className="p-3 mt-3 bg-muted rounded-md border border-border">
                    <p className="text-sm font-semibold text-foreground">{entryToDelete.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Type: <span className="font-medium">{entryToDelete.type}</span> | Category:{' '}
                      <span className="font-medium">{entryToDelete.category}</span>
                    </p>
                  </div>
                )}
              </DialogContent>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setDeleteDialogOpen(false)}
                  disabled={deleting}
                >
                  Cancel
                </Button>
                <Button variant="destructive" onClick={handleDeleteConfirm} isLoading={deleting}>
                  Delete
                </Button>
              </DialogFooter>
            </Dialog>
          </>
        )}

        {/* Entry Detail Drawer */}
        <KBEntryDetail
          entry={selectedEntry}
          onClose={handleCloseEntry}
          onApprove={handleApprove}
          onHide={handleHide}
          onReject={handleReject}
          onDelete={handleDeleteClick}
          onUpdate={handleUpdate}
          canReview={canReview}
          onUnmerge={handleUnmerge}
        />

        <ConfirmDialog
          open={caseAction !== null}
          onOpenChange={(open) => {
            if (!open) setCaseAction(null);
          }}
          onConfirm={() => void confirmCaseAction()}
          title={caseAction ? CASE_ACTION_TITLES[caseAction.action] : ''}
          description={`${
            caseAction?.action === 'unmerge'
              ? 'This undoes the merge.'
              : 'This is a merged case, so this undoes the merge.'
          } ${unmergeConsequence(null)} and removes the merged entry.`}
          confirmText={caseAction?.action === 'unmerge' ? 'Unmerge' : 'Undo the merge'}
          variant="warning"
        />

        {/* Alert Dialog */}
        <AlertDialog
          open={alertDialog.open}
          onOpenChange={(open) => setAlertDialog({ ...alertDialog, open })}
          title={alertDialog.title}
          description={alertDialog.description}
          variant={alertDialog.variant}
        />
      </div>
    </Layout>
  );
};
