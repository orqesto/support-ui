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
import { AlertDialog, type AlertDialogProps } from '@/components/ui/AlertDialog';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { Pagination } from '@/components/ui/Pagination';
import { SearchInput } from '@/components/ui/SearchInput';
import { useDepartmentContextKey } from '@/hooks/useDepartmentContextKey';
import { usePermissions } from '@/hooks/usePermissions';
import { KbAutoActionsButton } from '@/components/kb/autoActions/KbAutoActionsButton';
import { logger } from '@/lib/logger';
import {
  kbService,
  kbSourceParam,
  type KBEntry,
  type KbIdMatch,
  type KbPendingDecision,
  type PaginationMeta,
} from '@/services/kb.service';
import { Permission } from '@/types/roles';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useUiFlags } from '@/hooks/useUiFlags';
import { isCaseRow, unmergeConsequence } from '@/lib/kbConsolidation';
import { KB_ENTRY_NOT_FOUND_ALERT, useKbEntryParam } from '@/hooks/useKbEntryParam';
import { useKbAutoChangedSupport } from '@/hooks/useKbAutoChangedSupport';
import { CASE_ACTION_TITLES, LEFT_PAGE, runCaseAction } from '@/components/kb/runCaseAction';
import { KbExportButton } from '@/components/kb/KbExportButton';
import { KbReviewSuggestionsButton } from '@/components/kb/KbReviewSuggestionsButton';
import { KbStatusFilter, type KbFilterStatus } from '@/components/kb/KbStatusFilter';
import { withoutKbFinding } from '@/lib/kbFinding';
import { useKbStatusParam } from '@/hooks/useKbStatusParam';
import { KbFindingBanner } from '@/components/kb/KbFindingBanner';
import { KbIdMatchHint } from '@/components/kb/KbIdMatchHint';
import { KbStatusIgnoredNotice, isNewStatus } from '@/components/kb/KbStatusIgnoredNotice';
import { useKbAutoRestore } from '@/components/kb/useKbAutoRestore';
import { useKbUnhide } from '@/components/kb/useKbUnhide';
import { KBDeleteDialog } from '@/components/kb/KBDeleteDialog';
import { KbDecisionDialog } from '@/components/kb/KbDecisionDialog';
import { KbBulkDecisionBar, bulkModeFor } from '@/components/kb/KbBulkDecisionBar';
import { useKbBulkDecisions } from '@/hooks/useKbBulkDecisions';
import { useKbFindingFilter } from '@/hooks/useKbFindingFilter';

/** An action on a merged CASE row — each one unmerges it, so each is confirmed first. */
type CaseAction = { entry: KBEntry; action: keyof typeof CASE_ACTION_TITLES };

type FilterType = 'all' | 'qa_pair' | 'document' | 'documentation';

const VALID_FILTER_TYPES: FilterType[] = ['all', 'qa_pair', 'document', 'documentation'];

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
  // The entry the search names by number ("KB-134"), for the hint when this view's filters hide it.
  const [idMatch, setIdMatch] = useState<KbIdMatch | null>(null);
  // Whether the server applied the requested status (an older one echoes a new one, unapplied).
  const [appliedStatus, setAppliedStatus] = useState<{
    requested: KbFilterStatus;
    applied: boolean;
    /** The backend's own word on "Changed automatically", on every list answer. */
    autoChanged: boolean;
  } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [pendingSearch, setPendingSearch] = useState('');
  const filterType = activeTab; // Use hash-based tab as filter type
  const [filterStatus, setFilterStatus] = useKbStatusParam();
  // Approve / reject / hide / edit need manage_knowledge_base (moderator, org admin). Everyone
  // else is capped to approved entries by the server, so the review filters and buttons would
  // only ever fail for them.
  const { hasPermission } = usePermissions();
  const canReview = hasPermission(Permission.MANAGE_KNOWLEDGE_BASE);
  // Source filter — 'all' (no narrowing), 'none' (no mailbox) or a source id: kbSourceParam.
  const [filterSource, setFilterSource] = useState<string>(ALL_SOURCES);

  // Handle tab change by updating URL hash via React Router
  const handleTabChange = (tabId: FilterType) => {
    navigate({ search: location.search, hash: tabId }, { replace: true });
  };
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [entryToDelete, setEntryToDelete] = useState<KBEntry | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [decision, setDecision] = useState<KbPendingDecision | null>(null);
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
  const [alertDialog, setAlertDialog] = useState<
    Pick<AlertDialogProps, 'open' | 'title' | 'description' | 'variant'>
  >({ open: false, title: '', description: '', variant: 'info' });
  // BE `knowledgeBaseController.getAll` is dept-scoped via X-Department-Context.
  const selectedDeptKey = useDepartmentContextKey();
  // A KB cases finding ("48 learned entries are raw emails") opens exactly its entries.
  const finding = useKbFindingFilter(selectedDeptKey);
  // Only a successful answer to THIS filter can show the notice (not the previous one's, not a
  // failed fetch's); a non-reviewer is capped to approved by the server, and a finding list has
  // its own banner.
  const statusIgnored =
    canReview &&
    !finding.filter &&
    isNewStatus(filterStatus) &&
    appliedStatus?.requested === filterStatus &&
    !appliedStatus.applied
      ? filterStatus
      : null;
  const fetchEntries = useCallback(
    async (requestedPage = 1) => {
      try {
        setLoading(true);
        setIdMatch(null); // hidden while loading; a failed read must not keep the previous one
        const read = (page: number) =>
          finding.fetchList({
            type: filterType === 'all' ? undefined : filterType,
            page,
            limit: pagination.limit,
            search: searchQuery || undefined,
            status: filterStatus === 'all' ? undefined : filterStatus,
            messageSourceId: kbSourceParam(filterSource),
          });
        let response = await read(requestedPage);
        // Decided rows left the list and took this page with them: show the last page left.
        const lastPage = response?.data.pagination.totalPages ?? requestedPage;
        if (response && !response.data.entries.length && requestedPage > Math.max(1, lastPage)) {
          response = await read(Math.max(1, lastPage));
        }
        if (!response) return; // overtaken by a newer request
        setEntries(response.data.entries);
        setIdMatch(response.data.idMatch ?? null);
        setPagination(response.data.pagination);
        setAppliedStatus({
          requested: filterStatus,
          applied: response.data.filters?.statusApplied === true,
          autoChanged: response.data.filters?.autoChangedStatus === true,
        });
      } catch (error) {
        logger.error('Failed to fetch KB entries:', error);
        if (finding.filter) setEntries([]); // never the previous rows under the finding's title
        setAlertDialog({
          open: true,
          title: 'Failed to Load',
          description: error instanceof Error ? error.message : 'Failed to fetch KB entries',
          variant: 'error',
        });
      } finally {
        if (!finding.overtaken()) setLoading(false);
      }
    },
    // listScopeKey (department + finding) forces re-create on a toggle; consumer useEffect re-runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filterType, filterStatus, filterSource, searchQuery, pagination.limit, finding.listScopeKey]
  );

  // Refetch when filters change (immediate, no debounce)
  // Skip fetching when on Documentation tab (shows settings, not KB entries)
  useEffect(() => {
    if (filterType !== 'documentation') {
      void fetchEntries(1); // Reset to page 1 when filters change
    }
  }, [filterType, filterStatus, searchQuery, fetchEntries]);

  const autoChangedSupported = useKbAutoChangedSupport(appliedStatus, setFilterStatus);

  const bulkMode = canReview ? bulkModeFor(filterStatus) : null;
  // Re-read the page after a decision; a page the decided rows emptied falls back in fetchEntries.
  const rereadPage = () => void fetchEntries(pagination.page);
  const bulk = useKbBulkDecisions(entries, rereadPage, bulkMode);

  useKbEntryParam({
    selectedEntry,
    setSelectedEntry,
    canReview,
    entries,
    filterStatus,
    onNotFound: () => setAlertDialog(KB_ENTRY_NOT_FOUND_ALERT),
  });

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
    // ONE navigation to the final URL: several in a tick each read the same stale params.
    const params = new URLSearchParams(withoutKbFinding(searchParams));
    params.delete('status');
    navigate({ search: params.toString(), hash: '#all' }, { replace: !finding.filter });
    setFilterSource(ALL_SOURCES);
    setSearchQuery('');
    setPendingSearch('');
  };

  const activeFilterCount =
    (filterType !== 'all' ? 1 : 0) +
    (filterStatus !== 'all' ? 1 : 0) +
    (filterSource !== ALL_SOURCES ? 1 : 0) +
    (searchQuery?.trim() ? 1 : 0) +
    (finding.filter ? 1 : 0);

  // Under a review filter (a finding, or a decision status) a decided row may leave the list, and
  // its pending decision changes — re-read the page instead of patching the row in place.
  const rereadAfterDecision = Boolean(finding.filter) || isNewStatus(filterStatus);

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
      // An approved entry stays listed while its KB review is open. The review closes once none of
      // its entries is undecided; the list drops it then, within the report's one-minute cache.
      // Re-read the same page so the entry's state and the count are current.
      if (rereadAfterDecision) rereadPage();
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

  const autoRestore = useKbAutoRestore(canReview, filterStatus, appliedStatus, rereadPage);

  const { unhide: handleUnhide, dialog: unhideFallback } = useKbUnhide({
    setEntries,
    reread: (approved) => {
      if (approved === null || rereadAfterDecision) rereadPage();
    },
    onApproveInstead: (id) => void handleApprove(id),
    onFailed: (_id, error) => {
      logger.error('Failed to unhide entry:', error);
      setAlertDialog({
        open: true,
        title: 'Failed to Unhide',
        description: error instanceof Error ? error.message : 'Failed to unhide KB entry',
        variant: 'error',
      });
    },
  });

  const rejectEntry = async (id: number) => {
    try {
      const response = await kbService.reject(id);
      const rejectedAt = response.data?.rejectedAt ?? new Date().toISOString();
      setEntries((prev) =>
        prev.map((entry) =>
          entry.id === id ? { ...entry, approved: false, hidden: true, rejectedAt } : entry
        )
      );
      if (rereadAfterDecision) rereadPage();
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
      if (rereadAfterDecision) rereadPage();
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
      const outcome = await runCaseAction(entry, action, () => latest.current);
      // Read `say` AFTER the await: the page may be gone by now (FE pass 18 LOW-1).
      latest.current.say(outcome);
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
  const latest = useRef(LEFT_PAGE);
  useEffect(() => {
    latest.current = {
      selectedId: selectedEntry?.id ?? null,
      selectedCaseId:
        selectedEntry?.consolidation?.caseId ?? selectedEntry?.consolidatedInto ?? null,
      say: (outcome) => setAlertDialog(outcome),
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
            description="Review and manage automatically extracted knowledge from your threads"
          />
          {canReview && (
            <div className="flex flex-wrap gap-2 mt-2">
              {showCasesLink && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate('/knowledge-base/cases')}
                >
                  Cases report
                </Button>
              )}
              <KbAutoActionsButton />
              <KbReviewSuggestionsButton onPick={() => setFilterStatus('suggested_change')} />
            </div>
          )}
          {filterType !== 'documentation' && (
            <KbExportButton type={filterType} refreshKey={entries} />
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
                description: 'Questions and answers extracted from threads',
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
                <KbFindingBanner {...finding.banner} total={loading ? null : pagination.total} />
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
                    <KbStatusFilter
                      value={filterStatus}
                      onChange={setFilterStatus}
                      autoChanged={autoChangedSupported}
                    />
                  )}

                  {/* Source Filter */}
                  <div className="flex flex-col gap-2">
                    <span className="text-xs font-semibold text-muted-foreground">Source:</span>
                    <MessageSourceFilter
                      value={filterSource}
                      onChange={setFilterSource}
                      includeNoSource
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
        ) : statusIgnored ? (
          // An older backend returned the unfiltered list: never pass it off as filtered.
          <KbStatusIgnoredNotice status={statusIgnored} />
        ) : (
          <>
            <KbIdMatchHint
              match={loading ? null : idMatch}
              tab={filterType}
              source={filterSource}
              onClearSource={() => setFilterSource(ALL_SOURCES)}
            />

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
                    onUnhide={(id) => void handleUnhide(id)}
                    onReject={handleReject}
                    onDelete={handleDeleteClick}
                    canReview={canReview}
                    onUnmerge={handleUnmerge}
                    onReviewDecision={setDecision}
                    autoRestore={autoRestore}
                  />
                ))
              )}
            </div>

            {bulkMode && <KbBulkDecisionBar bulk={bulk} mode={bulkMode} />}

            {/* Desktop Table View */}
            <KBTableView
              entries={entries}
              loading={loading}
              onView={handleOpenEntry}
              onApprove={handleApprove}
              onHide={handleHide}
              onUnhide={(id) => void handleUnhide(id)}
              onReject={handleReject}
              onDelete={handleDeleteClick}
              canReview={canReview}
              onUnmerge={handleUnmerge}
              onReviewDecision={setDecision}
              autoRestore={autoRestore}
              selection={bulkMode ? bulk : undefined}
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

            <KbDecisionDialog
              decision={decision}
              onClose={(decided) => {
                setDecision(null);
                if (!decided) rereadPage();
              }}
              onDecided={() => {
                // The drawer behind the dialog must not keep offering the decision just taken.
                setSelectedEntry((entry) => entry && { ...entry, pendingDecision: null });
                rereadPage();
              }}
            />
            <KBDeleteDialog
              open={deleteDialogOpen}
              onOpenChange={setDeleteDialogOpen}
              entry={entryToDelete}
              deleting={deleting}
              onConfirm={handleDeleteConfirm}
            />
          </>
        )}

        {/* Entry Detail Drawer */}
        <KBEntryDetail
          entry={selectedEntry}
          onClose={handleCloseEntry}
          onApprove={handleApprove}
          onHide={handleHide}
          onUnhide={(id) => void handleUnhide(id)}
          onReject={handleReject}
          onDelete={handleDeleteClick}
          onUpdate={handleUpdate}
          canReview={canReview}
          onUnmerge={handleUnmerge}
          onReviewDecision={setDecision}
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

        {unhideFallback}

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
