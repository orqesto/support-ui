import { useEffect, useState, useCallback, useRef } from 'react';
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { X } from 'lucide-react';
import { KBEntryCard } from '@/components/kb/KBEntryCard';
import { KBEntryDetail } from '@/components/kb/KBEntryDetail';
import { KBTableView } from '@/components/kb/KBTableView';
import { PageHeader } from '@/components/shared/PageHeader';
import { ALL_SOURCES } from '@/components/messages/MessageSourceFilter';
import { AlertDialog, type AlertDialogProps } from '@/components/ui/AlertDialog';
import { Button } from '@/components/ui/Button';
import { Pagination } from '@/components/ui/Pagination';
import { Spinner } from '@/components/ui/Spinner';
import { useDepartmentContextKey } from '@/hooks/useDepartmentContextKey';
import { usePermissions } from '@/hooks/usePermissions';
import { KbAutoActionsButton } from '@/components/kb/autoActions/KbAutoActionsButton';
import { logger } from '@/lib/logger';
import {
  kbService,
  kbSourceParam,
  type KBEntry,
  type KbFinding,
  type KbIdMatch,
  type KbPendingDecision,
  type PaginationMeta,
} from '@/services/kb.service';
import { Permission } from '@/types/roles';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { isCaseRow, unmergeConsequence } from '@/lib/kbConsolidation';
import { useKbEntryParam } from '@/hooks/useKbEntryParam';
import { useKbAutoChangedSupport } from '@/hooks/useKbAutoChangedSupport';
import { CASE_ACTION_TITLES, LEFT_PAGE, runCaseAction } from '@/components/kb/runCaseAction';
import { KbExportButton } from '@/components/kb/KbExportButton';
import type { KbFilterStatus } from '@/components/kb/KbStatusFilter';
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
import { KbMoreFilters } from '@/components/kb/page/KbMoreFilters';
import { KbPageToolbar, type KbListType } from '@/components/kb/page/KbPageToolbar';
import { useKbTeams } from '@/components/kb/page/KbTeamFilter';
import {
  KbEngineActivitySlot,
  KbEngineOffNotice,
  KbQuestionsView,
  KbStillLearning,
} from '@/components/kb/page/KbPageStates';
import { useKbEngineSummary } from '@/components/kb/page/useKbEngineSummary';
import { isOlderThan7d } from '@/components/kb/questions/useKbQuestions';
import {
  kbPageViewFromSearch,
  kbPageViewIsExplicit,
  liveDefaultStatus,
  kbSearchForView,
  type KbPageView,
} from '@/components/kb/page/kbPageView';

/** An action on a merged CASE row — each one unmerges it, so each is confirmed first. */
type CaseAction = { entry: KBEntry; action: keyof typeof CASE_ACTION_TITLES };

type FilterType = KbListType;

const VALID_FILTER_TYPES: FilterType[] = ['all', 'qa_pair', 'document'];

/** Documentation moved to Settings › AI (KB engine Stage 1); its old address lands there. */
export const DOCUMENTATION_HREF = '/settings#ai/documentation';

export const KnowledgeBasePage = () => {
  const location = useLocation();
  if (location.hash === '#documentation') return <Navigate to={DOCUMENTATION_HREF} replace />;
  return <KnowledgeBaseViews />;
};

const KnowledgeBaseViews = () => {
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
  // The words the list marks: the search as the backend read it (absent on an older backend).
  const [searchTerms, setSearchTerms] = useState<string[] | undefined>(undefined);
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
  // Approve / reject / hide / edit need manage_knowledge_base (moderator, org admin). Everyone
  // else is capped to approved entries by the server, so the review filters and buttons would
  // only ever fail for them. The questions and the engine need the same right.
  const { hasPermission } = usePermissions();
  const canReview = hasPermission(Permission.MANAGE_KNOWLEDGE_BASE);
  // BE `knowledgeBaseController.getAll` is dept-scoped via X-Department-Context.
  const selectedDeptKey = useDepartmentContextKey();
  const selectedTeams = selectedDeptKey ? selectedDeptKey.split(',').map(Number) : [];
  // One team picked: the questions and the engine summary are read for it too.
  const oneTeam = selectedTeams.length === 1 ? selectedTeams[0] : undefined;
  const engine = useKbEngineSummary(canReview, oneTeam);
  const openQuestions = engine.summary?.questions.open ?? null;

  // Which view: the URL decides (`?view=`, or a legacy status / finding); a bare URL waits for the
  // open-question count. Once chosen, a URL that names no view keeps the view (clearing a filter
  // must not jump to another view).
  const lastView = useRef<KbPageView | null>(null);
  const view: KbPageView | null = !canReview
    ? 'live'
    : kbPageViewIsExplicit(searchParams)
      ? kbPageViewFromSearch(searchParams, 0)
      : (lastView.current ??
        (engine.settled ? kbPageViewFromSearch(searchParams, openQuestions ?? 0) : null));
  useEffect(() => {
    if (view) lastView.current = view;
  }, [view]);
  const setView = (next: KbPageView) =>
    navigate({ search: kbSearchForView(searchParams, next), hash: location.hash });

  // Live answers shows live answers by default; other statuses come from More filters › Status.
  const defaultStatus = liveDefaultStatus(searchParams);
  const [filterStatus, setFilterStatus] = useKbStatusParam('live', defaultStatus);
  const [moreOpen, setMoreOpen] = useState(false);
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
  const [caseAction, setCaseAction] = useState<CaseAction | null>(null);

  // Alert dialog state
  const [alertDialog, setAlertDialog] = useState<
    Pick<AlertDialogProps, 'open' | 'title' | 'description' | 'variant'>
  >({ open: false, title: '', description: '', variant: 'info' });
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
            // Always the effective status, 'all' included: the export sends the same (owner rule).
            status: filterStatus,
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
        setSearchTerms(
          Array.isArray(response.data.search?.terms) ? response.data.search.terms : undefined
        );
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

  // Refetch when filters change (immediate, no debounce). Only Live answers shows the list.
  const listShown = view === 'live';
  useEffect(() => {
    if (listShown) void fetchEntries(1); // Reset to page 1 when filters change
  }, [listShown, filterType, filterStatus, searchQuery, fetchEntries]);

  const autoChangedSupported = useKbAutoChangedSupport(appliedStatus, setFilterStatus);

  const bulkMode = canReview ? bulkModeFor(filterStatus) : null;
  // Re-read the page after a decision; a page the decided rows emptied falls back in fetchEntries.
  const rereadPage = () => void fetchEntries(pagination.page);
  const bulk = useKbBulkDecisions(entries, rereadPage, bulkMode);

  const { openEntry: handleOpenEntry, closeEntry: handleCloseEntry } = useKbEntryParam({
    selectedEntry,
    setSelectedEntry,
    canReview,
    entries,
    filterStatus,
    onNotFound: setAlertDialog,
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
    params.set('view', 'live');
    navigate({ search: params.toString(), hash: '#all' }, { replace: !finding.filter });
    setFilterSource(ALL_SOURCES);
    setSearchQuery('');
    setPendingSearch('');
  };

  const moreFilterCount =
    (filterStatus !== defaultStatus ? 1 : 0) +
    (filterSource !== ALL_SOURCES ? 1 : 0) +
    (finding.filter ? 1 : 0);
  const activeFilterCount =
    (filterType !== 'all' ? 1 : 0) + (searchQuery?.trim() ? 1 : 0) + moreFilterCount;
  // A filter set from a link is shown, not hidden behind "More filters".
  const moreShown = moreOpen || moreFilterCount > 0;

  // A finding is counted per team: the one picked, else the viewer's only team.
  const teams = useKbTeams();
  const findingTeamId =
    finding.filter?.departmentId ?? oneTeam ?? (teams.length === 1 ? teams[0].id : null);
  const setFinding = (next: KbFinding | null) => {
    const params = new URLSearchParams(withoutKbFinding(searchParams));
    if (next && findingTeamId !== null) {
      params.set('finding', next);
      params.set('departmentId', String(findingTeamId));
    }
    params.set('view', 'live');
    navigate({ search: params.toString(), hash: location.hash });
  };

  // First run: a knowledge base with no entries at all (nothing filters the empty list).
  const firstRun =
    listShown && !loading && pagination.total === 0 && activeFilterCount === 0 && !statusIgnored;

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
    <>
      <div className="px-4 mx-auto space-y-4 w-full">
        {/* Header */}
        <div className="flex flex-wrap gap-3 justify-between items-start">
          <PageHeader
            title="Knowledge Base"
            description={
              view === 'questions'
                ? 'Where two answers disagree, the engine asks you. Everything else it does by itself.'
                : 'What the AI answers from, and what the engine changed by itself'
            }
          />
          {canReview && <KbAutoActionsButton />}
        </div>

        {canReview && (
          <KbEngineOffNotice
            killed={engine.summary?.killed.all === true}
            nightlyOff={engine.nightlyOff}
          />
        )}

        {view && (
          <KbPageToolbar
            canReview={canReview}
            view={view}
            onView={setView}
            openQuestions={openQuestions}
            search={{
              value: pendingSearch,
              onChange: handleSearchChange,
              onSearch: handleSearch,
              onBlur: handleSearchBlur,
            }}
            teamKey={selectedDeptKey}
            type={filterType}
            onType={handleTabChange}
            more={{
              open: moreShown,
              onToggle: () => setMoreOpen(!moreShown),
              active: moreFilterCount,
            }}
          />
        )}

        {view === 'live' && moreShown && (
          <KbMoreFilters
            canReview={canReview}
            status={filterStatus}
            onStatus={setFilterStatus}
            autoChanged={autoChangedSupported}
            source={filterSource}
            onSource={setFilterSource}
            finding={finding.filter?.finding ?? null}
            onFinding={setFinding}
            findingTeamId={findingTeamId}
          />
        )}

        {view === null ? (
          <div className="flex justify-center p-8">
            <Spinner />
          </div>
        ) : view === 'questions' ? (
          <KbQuestionsView
            openQuestions={openQuestions}
            search={searchQuery}
            departmentId={oneTeam}
            summary={engine.summary}
            onDecided={(question) => engine.decrementOpen(isOlderThan7d(question))}
          />
        ) : view === 'activity' ? (
          <KbEngineActivitySlot summary={engine.summary} expanded />
        ) : (
          <>
            <KbFindingBanner {...finding.banner} total={loading ? null : pagination.total} />
            {/* List header: the count, Clear all, and the export as a secondary action. */}
            <div className="flex flex-wrap gap-3 justify-between items-center">
              <span className="text-xs whitespace-nowrap text-muted-foreground">
                {!statusIgnored && pagination.total > 0
                  ? `${(pagination.page - 1) * pagination.limit + 1}-${Math.min(
                      pagination.page * pagination.limit,
                      pagination.total
                    )} of ${pagination.total}`
                  : ''}
              </span>
              <div className="flex gap-2 items-center">
                {activeFilterCount > 0 && (
                  <Button variant="ghost" size="sm" onClick={clearFilters} className="h-8 shrink-0">
                    <X className="mr-1 w-3 h-3" />
                    Clear All
                  </Button>
                )}
                <KbExportButton type={filterType} refreshKey={entries} />
              </div>
            </div>
          </>
        )}

        {view === 'live' &&
          (statusIgnored ? (
            // An older backend returned the unfiltered list: never pass it off as filtered.
            <KbStatusIgnoredNotice status={statusIgnored} />
          ) : firstRun ? (
            <KbStillLearning />
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
                      searchTerms={searchTerms}
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
                searchTerms={searchTerms}
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
            </>
          ))}

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
    </>
  );
};
