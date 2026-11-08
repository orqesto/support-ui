import { Suspense, useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  buildContactsApiFilters,
  BulkActionBar,
  BULK_MERGE_MAX,
  useBulkSelection,
  useListPresentation,
  OutsideViewMatches,
  DeleteMessageDialog,
  threadIdForMessage,
  useNewThreadsBar,
  usePhoneOpensMessageAsPage,
  useDropTeamFilterWhenTeamsOff,
  useMessagesData,
  useMessagesUrlSync,
  useConversationNewRefresh,
  MessagesPageHeader,
  ThreadListView,
  SpamPreviewDialog,
  SplitDetailPane,
  DetailSlideOver,
  countActiveFilters,
  countClearableFilters,
  useMessagesDisplayMode,
  useDetailPanelBodyLock,
  useScopeJump,
  useBulkActionRunner,
  useListSelection,
  useFilterBarHandlers,
  useThreadActions,
  useTicketRoutingStatusEvents,
  useConversationUpdateEvents,
  useNotifyTriage,
  useRowReadChanged,
  useLaneCounts,
  useBoardAndBulkState,
  ThreadsFilterBar,
  BulkDialogs,
  useServerEventRouting,
  detailPanelProps,
  type MessagesPageAlert,
} from '@/features/messages';
import { NewItemsBar } from '@/components/shared/NewItemsBar';
import {
  useSafeMediaQuery,
  useSharedLinkWorkspace,
  useMessagesStore,
} from '@/features/messages/shell';
import { useQueryClient } from '@tanstack/react-query';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { PenSquare } from 'lucide-react';
import { PermissionGuard } from '@/components/auth/PermissionGuard';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { Button } from '@/components/ui/Button';
import { Pagination } from '@/components/ui/Pagination';
import { type MessageThread } from '@/services/message.service';
import { highlightTermsFor } from '@/lib/highlightTerms';
import { getConvUrlId } from '@/lib/messageHelpers';
import { useCurrentOrgCode } from '@/hooks/useCurrentOrgCode';
import { cn } from '@/lib/utils';
import type { Message } from '@/types';
import { Permission } from '@/types/roles';
import { Spinner } from '@/components/ui/Spinner';
import { lazyWithReload } from '@/lib/lazyWithReload';
import { useNotificationCounts } from '@/hooks/useNotificationCounts';
import { useCoalescedRefresh } from '@/hooks/useCoalescedRefresh';
import { usePermissions } from '@/hooks/usePermissions';

/*
  Downloaded when first needed, not with the page: the thread view (with its editor, AI tab and
  lookups), the board, the contacts view and the compose dialog are most of this page's code, and
  an agent landing on the list needs none of them yet. The thread view is fetched ahead as soon as
  a row is pointed at or focused, so opening one rarely waits for it.
*/
// A lazy chunk: imported through the index it would load with the page instead of on demand.
// eslint-disable-next-line boundaries/api-only-features
const loadMessageDetail = () => import('@/features/messages/components/MessageDetail');
const MessageDetail = lazyWithReload(() =>
  loadMessageDetail().then((mod) => ({ default: mod.MessageDetail }))
);
let detailPrefetch: Promise<unknown> | null = null;
const prefetchMessageDetail = () => {
  detailPrefetch ??= loadMessageDetail().catch(() => {
    // A failed prefetch is retried by the next hover — or by the open itself.
    detailPrefetch = null;
  });
};
const MessagesKanbanView = lazyWithReload(() =>
  // A lazy chunk (see loadMessageDetail).
  // eslint-disable-next-line boundaries/api-only-features
  import('@/features/messages/components/MessagesKanbanView').then((mod) => ({
    default: mod.MessagesKanbanView,
  }))
);
const ContactsView = lazyWithReload(() =>
  // A lazy chunk (see loadMessageDetail).
  // eslint-disable-next-line boundaries/api-only-features
  import('@/features/messages/components/ContactsView').then((mod) => ({
    default: mod.ContactsView,
  }))
);
const ComposeNewModal = lazyWithReload(() =>
  // A lazy chunk (see loadMessageDetail).
  // eslint-disable-next-line boundaries/api-only-features
  import('@/features/messages/components/ComposeNewModal').then((mod) => ({
    default: mod.ComposeNewModal,
  }))
);
/** Where a lazy view is still downloading: a spinner in the space the view will fill. */
const ViewLoading = ({ className }: { className?: string }) => (
  <div className={cn('grid place-items-center', className)} aria-busy="true">
    <Spinner size={18} />
  </div>
);

export const MessagesPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  // Unread Suspicious/Spam arrivals — the board badges its columns with these; the list shows
  // them on "Not shown", where both queues are hidden by default.
  const { counts: arrivalCounts, clearKind: clearArrivalKind } = useNotificationCounts();

  /**
   * A link somebody sent you should land where it belongs. An id that names its workspace
   * (`ORB-MKT-170`) switches to that workspace instead of 404ing against the current one;
   * a bare `MKT-170` is left alone, because it names no workspace and guessing is how a
   * link opens the wrong conversation.
   */
  useSharedLinkWorkspace(searchParams.get('id'));
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [displayMode, setDisplayMode] = useMessagesDisplayMode(searchParams, setSearchParams);
  const {
    kanbanRefreshKey,
    bulkAction,
    setBulkAction,
    bulkMergeOpen,
    setBulkMergeOpen,
    bulkRunning,
    setBulkRunning,
    boardTotal,
    boardPartial,
    handleBoardTotal,
    countsTick,
    bumpCounts,
    bumpKanban,
    kanbanRef,
    selectedThreadIdRef,
    detailRequestCloseRef,
    moveSelectedCard,
  } = useBoardAndBulkState();
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  // Spam-filtered entries are spamLog rows, not real conversations (synthetic
  // negative ids, threadId "spamlog_NN"). The heavy MessageDetail pane fetches
  // events/notes/activity by id, which 404 for these, so we show the captured
  // body in a lightweight read-only preview instead of opening the pane.
  const [spamPreview, setSpamPreview] = useState<MessageThread | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  // The compose dialog is downloaded on its first open and stays mounted after (its draft state
  // lives in it, as before).
  const [composeMounted, setComposeMounted] = useState(false);
  useEffect(() => {
    if (composeOpen) setComposeMounted(true);
  }, [composeOpen]);

  // On a phone the detail is a page, not this panel — see the hook. Declared before the
  // body-scroll lock so the lock can skip the phone, where locking the body is exactly what
  // killed pull-to-refresh.
  const isPhone = usePhoneOpensMessageAsPage(selectedMessage, () => {
    const params = new URLSearchParams(searchParams);
    params.delete('id');
    setSearchParams(params, { replace: true });
    selectedThreadIdRef.current = null;
    fetchedMessageIdRef.current = null;
    setSelectedMessage(null);
  });

  /**
   * Messages list v2: row density and the reading layout. Split puts the open thread beside
   * the list instead of over it — desktop widths only (lg+), list view only: the board needs
   * the width for its lanes, and a phone opens every thread as a page.
   */
  const { density, setDensity, layout, setLayout } = useListPresentation();
  const wideEnoughToSplit = useSafeMediaQuery('(min-width: 1024px)');
  const split = layout === 'split' && wideEnoughToSplit && !isPhone && displayMode === 'threads';

  // Lock body scroll while the detail panel is open + notify Layout to hide header. Not in
  // split: there the detail is a pane beside the list and both scroll on their own.
  useDetailPanelBodyLock(selectedMessage, isPhone, split);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [messageToDelete, setMessageToDelete] = useState<Message | null>(null);
  const [deleting, setDeleting] = useState(false);
  const deletingRef = useRef(false);
  // DELETE /api/messages/:id takes DELETE_MESSAGES or MANAGE_ORGANIZATION; a viewer it would
  // refuse is not offered "Delete message" (the full page uses the same gate).
  const { hasPermission } = usePermissions();
  const canDelete =
    hasPermission(Permission.DELETE_MESSAGES) || hasPermission(Permission.MANAGE_ORGANIZATION);
  const [contactsPagination, setContactsPagination] = useState({
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 1,
    hasMore: false,
  });
  const [alertDialog, setAlertDialog] = useState<MessagesPageAlert>({
    open: false,
    title: '',
    description: '',
    variant: 'info',
  });

  // Teams off: a saved/URL Team filter is reset, so it neither narrows nor counts.
  useDropTeamFilterWhenTeamsOff();
  const filters = useMessagesStore((state) => state.filters);
  // The scope key: a change to what the board is SHOWING clears the selection, because the
  // ids then name rows the agent can no longer see.
  const bulkSelection = useBulkSelection(JSON.stringify(filters));
  const sorting = useMessagesStore((state) => state.sorting);
  const updateFilter = useMessagesStore((state) => state.updateFilter);
  const setSorting = useMessagesStore((state) => state.setSorting);
  const clearFiltersStore = useMessagesStore((state) => state.clearFilters);
  // Merges, so it is the several-key write the filter bar needs — see handleFilterPatch.
  const patchFilters = useMessagesStore((state) => state.setFilters);
  const listScope = useMessagesStore((state) => state.listScope);

  // Derived up here, not next to the filter counts, because useMessagesData needs it:
  // the list query drops the filters the board cannot honour.
  const isKanban = displayMode === 'kanban';

  // Jump to the lens holding a category the current surface hides (see useScopeJump).
  const handleScopeJump = useScopeJump(navigate, patchFilters);

  /**
   * The org code that makes an id in the address bar shareable.
   *
   * ⛔ The copy-link button already passed this (`KanbanCard`, `MessageListItem`,
   * `MessageDetailHeader`) while every URL-SYNC writer here omitted it — so the button
   * produced `ORB-MKT-170` and the address bar produced a bare `MKT-170`. People copy the
   * address bar. That is the ambiguous form: public ids are unique per ORG and the counter
   * is per department, so `INF` and `SUP` each exist in six workspaces on prod and 54 ids
   * already resolve in more than one.
   *
   * 🔑 The coded form is not just clearer, it FAILS SAFE: `resolveConvIdFromParam` strips a
   * MATCHING `{code}-` and returns null for a non-matching one, so a link opened in the
   * wrong workspace 404s instead of opening a different real conversation.
   */
  const orgCode = useCurrentOrgCode();

  const urlSyncedRef = useRef(false);
  // Holds the URL form of the last-fetched conv id (either the numeric id as a
  // string or a publicId like 'SUP-42') — see useMessagesUrlSync for the dedup
  // contract. Stays in sync with what's written to the URL via getConvUrlId.
  const fetchedMessageIdRef = useRef<string | null>(null);

  const {
    threads: rawThreads,
    loading,
    refreshing,
    searching,
    searchReading,
    listTimedOut,
    setRefreshing,
    messagesPagination,
    fetchMessages,
    handlePageChange,
    handleRefresh,
    clearCache,
    patchThread,
  } = useMessagesData({ urlSyncedRef, isKanban });

  // Run the chosen bulk action over the current selection (see useBulkActionRunner).
  const runBulkAction = useBulkActionRunner({
    bulkAction,
    setBulkAction,
    setBulkRunning,
    kanbanRef,
    bulkSelection,
    bumpKanban,
    fetchMessages,
    messagesPagination,
    orgCode,
  });

  const threads: MessageThread[] = rawThreads;

  const {
    groupByStatus,
    setGroupByStatus,
    drawnThreads,
    listSelectableIds,
    listSelectedCount,
    selectMode,
    toggleListRow,
  } = useListSelection({ threads, density, bulkSelection, selectedMessage, displayMode });

  const pagination = messagesPagination;

  useMessagesUrlSync({
    urlSyncedRef,
    fetchedMessageIdRef,
    fetchMessages,
    selectedMessage,
    setSelectedMessage,
    onFetchError: () =>
      setAlertDialog({
        open: true,
        title: 'Failed to load threads',
        description: 'Could not fetch threads. Please refresh the page.',
        variant: 'error',
      }),
  });

  const { handleFilterChange, handleFilterPatch, handleCommitSearch, clearFilters } =
    useFilterBarHandlers({
      updateFilter,
      patchFilters,
      clearFiltersStore,
      displayMode,
      fetchMessages,
      messagesPagination,
    });

  const {
    handleOpenThread,
    pendingThreadId,
    handleNavigate,
    handleApprove,
    handleResolve,
    handleRejected,
    handleReopen,
    rereadSelectedMessage,
    handleRefreshMessage,
    handleSyncEmails,
    handleDeleteClick,
    handleDeleteConfirm,
  } = useThreadActions({
    searchParams,
    setSearchParams,
    orgCode,
    isPhone,
    setSpamPreview,
    setSelectedMessage,
    selectedThreadIdRef,
    fetchedMessageIdRef,
    selectedMessage,
    threads,
    drawnThreads,
    navigate,
    clearCache,
    moveSelectedCard,
    fetchMessages,
    messagesPagination,
    bumpKanban,
    setAlertDialog,
    setRefreshing,
    setMessageToDelete,
    setDeleteDialogOpen,
    messageToDelete,
    deletingRef,
    setDeleting,
    queryClient,
  });

  // Someone else's change, echoed by the server: the list and the board re-read once per window,
  // not once per event — see SERVER_EVENT_REFRESH_MS. The agent's own actions call bumpKanban /
  // fetchMessages directly and stay immediate.
  //
  // ONE window for every server event, new mail included. New mail used to have its own 1 s
  // window, so one email that also changed a thread's state cost two full re-reads (list, counts,
  // board) a few seconds apart. Now the window remembers what arrived: any state change re-reads
  // everything (which shows the new mail too); new mail alone takes its lighter path (the "N new"
  // bar on the list's first page).
  //
  // What an event re-reads is decided from its payload (serverEventRefresh.ts): one that cannot
  // have touched a row on screen, nor brought one into the page, re-reads only the view counts.
  const pendingEventsRef = useRef({ newMail: false, changed: false, counts: false });
  const refreshOnNewMailRef = useRef<() => void>(() => undefined);
  const applyServerEvents = useCallback(() => {
    const pending = pendingEventsRef.current;
    pendingEventsRef.current = { newMail: false, changed: false, counts: false };
    if (pending.changed) {
      clearCache();
      void fetchMessages(messagesPagination.page, true);
      bumpKanban();
    } else if (pending.newMail) {
      refreshOnNewMailRef.current(); // its board re-read bumps the counts too
    } else if (pending.counts) {
      bumpCounts();
    }
    // bumpCounts is useBoardAndBulkState's useReducer dispatch (stable): the deps stay as they were inline.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clearCache, fetchMessages, messagesPagination.page, bumpKanban]);
  const flushServerEvents = useCoalescedRefresh(applyServerEvents);
  const refreshFromServerEvent = useServerEventRouting({
    displayMode,
    messagesPagination,
    filters,
    threads,
    pendingEventsRef,
    flushServerEvents,
    applyServerEvents,
  });

  // Refresh the list + board on linked-ticket, routing and status events (see the hook).
  useTicketRoutingStatusEvents(refreshFromServerEvent, queryClient);

  // Messages list v4: new threads wait behind "N new messages — show" on the list's first page
  // instead of moving the rows under the cursor. The board, contacts and later pages keep the
  // #957 D1 behaviour (re-read at once).
  const newThreads = useNewThreadsBar({
    filters,
    sorting,
    shownIds: useMemo(() => threads.map((thread) => thread.threadId), [threads]),
    page: messagesPagination.page,
  });
  /**
   * View counts also follow the server's events, not only the visible rows: a thread resolved or
   * assigned on page 3, or new mail held behind the bar, moves Needs us / Unassigned / Spam while
   * page 1's rows stay the same (review of #726). One tick per refresh; the key below carries it.
   */
  // Those events (status change, update, reply, routing) are handled by refreshFromServerEvent,
  // whose bumpKanban bumps the counts too — one coalesced re-read per window, not one per event.
  const refreshOnNewMail = useCallback(() => {
    bumpKanban();
    if (displayMode === 'threads' && messagesPagination.page === 1) {
      newThreads.probe();
      return;
    }
    clearCache();
    void fetchMessages(messagesPagination.page, true);
  }, [clearCache, fetchMessages, messagesPagination.page, bumpKanban, displayMode, newThreads]);
  refreshOnNewMailRef.current = refreshOnNewMail;
  const noteNewMail = useCallback(() => {
    pendingEventsRef.current.newMail = true;
    flushServerEvents();
  }, [flushServerEvents]);
  useConversationNewRefresh(noteNewMail);

  // "Notify me about new triage mail" (⋯ menu): a per-device choice, off by default. In-app only.
  const { notifyTriage, setNotifyTriage, spamArrivals } = useNotifyTriage(arrivalCounts);

  // Refresh on conversation:updated and on any agent's reply (see the hook).
  useConversationUpdateEvents(refreshFromServerEvent);

  const activeFilterCount = countActiveFilters(filters, isKanban);
  const clearableFilterCount = countClearableFilters(filters);

  const handleRowReadChanged = useRowReadChanged({
    filters,
    bumpKanban,
    bumpCounts,
    fetchMessages,
    messagesPagination,
    patchThread,
  });
  const highlightTerms = useMemo(() => highlightTermsFor(searchReading), [searchReading]);

  /**
   * The open thread's detail. One element, two homes: the slide-over over the list (list
   * layout, the board, contacts) or the pane beside it (split). The props are the same either
   * way — only where it is mounted differs.
   */
  const detail = selectedMessage ? (
    <Suspense fallback={<ViewLoading className="flex-1" />}>
      <MessageDetail
        key={selectedMessage.id}
        message={selectedMessage}
        {...detailPanelProps(selectedMessage, {
          searchParams,
          setSearchParams,
          selectedThreadIdRef,
          setSelectedMessage,
          moveSelectedCard,
          rereadSelectedMessage,
          displayMode,
          handleNavigate,
          handleApprove,
          handleRejected,
          handleReopen,
          canDelete,
          handleDeleteClick,
          handleResolve,
          isKanban,
          threads,
          handleRowReadChanged,
          bumpKanban,
          fetchMessages,
          messagesPagination,
          detailRequestCloseRef,
          handleRefreshMessage,
          clearCache,
          queryClient,
        })}
      />
    </Suspense>
  ) : null;

  /** The thread the split pane is reading, so its row can say so. */
  const openThreadId = selectedMessage
    ? (selectedThreadIdRef.current ?? threadIdForMessage(threads, selectedMessage.id))
    : null;
  const compactRows = density === 'compact';
  // The header's action buttons drop their words where the column is narrow (split) or on a
  // phone; the tooltip and the accessible name keep them.
  // Needs us: the list it opens (its own filters, nothing else). Spam: its lane is merged with
  // the spam log, which the scope counts cannot see, so it is counted the way its list is read.
  const { countsRefreshKey, countsReady, laneCounts } = useLaneCounts({
    countsTick,
    messagesPagination,
    threads,
    loading,
    refreshing,
    searching,
    filters,
    displayMode,
  });

  const actionLabel = split ? 'sr-only' : 'max-sm:sr-only';

  return (
    <>
      <div className="flex overflow-hidden flex-1 min-h-0">
        {/* ── List panel ─────────────────────────────────── */}
        {/* Kanban fills the viewport from xl up (no page scroll; the lanes scroll
            internally); list view, mobile and every width below xl keep the normal panel
            scroll.
            ⛔ xl, not lg — it MUST match the breakpoint where MessagesKanbanView puts the
            lanes side by side (`xl:flex-row`). Between lg and xl the lanes STACK, and with
            this box already overflow-hidden the stack was clipped: on a 1276px window
            "Pending" started at 860px in an 806px viewport and nothing could scroll to it. */}
        {/* Pointing at or focusing anything in the list fetches the thread view ahead. */}
        <div
          className={`flex-1 min-w-0 ${
            isKanban ? 'overflow-y-auto xl:overflow-hidden xl:flex xl:flex-col' : 'overflow-y-auto'
          }`}
          onMouseOver={prefetchMessageDetail}
          onFocus={prefetchMessageDetail}
          // A fetch-ahead hint, not a control: the list's own rows and buttons are the controls.
          role="presentation"
        >
          <div
            className={`px-3 sm:px-[18px] pt-3.5 mx-auto space-y-2.5 w-full ${
              // Full page width (app-wide convention — every page is full width now;
              // the kanban also needs the flex-column chain for its bounded height).
              isKanban ? 'xl:flex xl:flex-col xl:flex-1 xl:min-h-0' : ''
            }`}
          >
            {/* Header (Messages list v2): the title, then WHICH view and how much of it —
                the view switch and the surface count — on the title's line; the actions at
                the right. The view switch used to ride the saved-views row of the filter
                card, and the count its right end; both describe the surface, not a filter. */}
            <MessagesPageHeader
              displayMode={displayMode}
              setDisplayMode={setDisplayMode}
              split={split}
              contactsPagination={contactsPagination}
              boardTotal={boardTotal}
              boardPartial={boardPartial}
              pagination={pagination}
              isKanban={isKanban}
              composeAction={
                <PermissionGuard permission={Permission.MANAGE_TICKETS}>
                  <Button
                    onClick={() => setComposeOpen(true)}
                    variant="outline"
                    title="Compose"
                    className="h-8 px-3 gap-[7px] text-[13px]"
                  >
                    <PenSquare className="h-3.5 w-3.5" />
                    <span className={actionLabel}>Compose</span>
                  </Button>
                </PermissionGuard>
              }
              handleRefresh={handleRefresh}
              refreshing={refreshing}
              hasPermission={hasPermission}
              handleSyncEmails={handleSyncEmails}
              notifyTriage={notifyTriage}
              setNotifyTriage={setNotifyTriage}
            />

            <ThreadsFilterBar
              filters={filters}
              activeFilterCount={activeFilterCount}
              clearableFilterCount={clearableFilterCount}
              displayMode={displayMode}
              contactsPagination={contactsPagination}
              boardTotal={boardTotal}
              boardPartial={boardPartial}
              pagination={pagination}
              handleFilterChange={handleFilterChange}
              handleFilterPatch={handleFilterPatch}
              handleCommitSearch={handleCommitSearch}
              clearFilters={clearFilters}
              isKanban={isKanban}
              patchFilters={patchFilters}
              laneCounts={laneCounts}
              countsRefreshKey={countsRefreshKey}
              countsReady={countsReady}
              listScope={listScope}
              spamArrivals={spamArrivals}
              clearArrivalKind={clearArrivalKind}
            />

            <NewItemsBar
              count={displayMode === 'threads' ? newThreads.count : 0}
              noun={['message', 'messages']}
              onShow={() => {
                newThreads.reset();
                clearCache();
                void fetchMessages(1, true);
                window.scrollTo({ top: 0 });
              }}
            />

            {displayMode === 'kanban' ? (
              <Suspense fallback={<ViewLoading className="min-h-[50vh]" />}>
                <MessagesKanbanView
                  ref={kanbanRef}
                  filters={filters}
                  onOpen={handleOpenThread}
                  refreshKey={kanbanRefreshKey}
                  onScopeJump={handleScopeJump}
                  onTotalChange={handleBoardTotal}
                  isSelected={bulkSelection.isSelected}
                  onToggleSelected={bulkSelection.toggle}
                  onToggleRange={bulkSelection.toggleRange}
                  selectMode={selectMode}
                  onSelectMany={bulkSelection.selectMany}
                  onDeselectMany={bulkSelection.deselectMany}
                />
              </Suspense>
            ) : displayMode === 'contacts' ? (
              <Suspense fallback={<ViewLoading className="min-h-[50vh]" />}>
                <ContactsView
                  apiFilters={buildContactsApiFilters(filters)}
                  focusSender={searchParams.get('sender') ?? undefined}
                  onPaginationChange={setContactsPagination}
                  onOpenMessage={(msg) => {
                    setSelectedMessage(msg);
                    const params = new URLSearchParams(searchParams);
                    params.set('id', getConvUrlId(msg, orgCode));
                    setSearchParams(params);
                  }}
                />
              </Suspense>
            ) : (
              <ThreadListView
                listSelectableIds={listSelectableIds}
                listSelectedCount={listSelectedCount}
                bulkSelection={bulkSelection}
                listScope={listScope}
                pagination={pagination}
                loading={loading}
                handleScopeJump={handleScopeJump}
                arrivalCounts={arrivalCounts}
                clearArrivalKind={clearArrivalKind}
                filters={filters}
                groupByStatus={groupByStatus}
                setGroupByStatus={setGroupByStatus}
                sorting={sorting}
                setSorting={setSorting}
                density={density}
                setDensity={setDensity}
                layout={layout}
                setLayout={setLayout}
                wideEnoughToSplit={wideEnoughToSplit}
                split={split}
                searchReading={searchReading}
                listTimedOut={listTimedOut}
                searching={searching}
                threads={threads}
                activeFilterCount={activeFilterCount}
                compactRows={compactRows}
                handleFilterPatch={handleFilterPatch}
                openThreadId={openThreadId}
                handleOpenThread={handleOpenThread}
                toggleListRow={toggleListRow}
                selectMode={selectMode}
                highlightTerms={highlightTerms}
                pendingThreadId={pendingThreadId}
                handleRowReadChanged={handleRowReadChanged}
              />
            )}

            {displayMode === 'threads' && !loading && threads.length > 0 && (
              <Pagination
                currentPage={pagination.page}
                totalPages={pagination.totalPages}
                total={pagination.total}
                totalCapped={pagination.totalCapped}
                limit={pagination.limit}
                onPageChange={handlePageChange}
                loading={loading}
              />
            )}

            {/* A searched list's matches its view does not show, grouped by where they are
                (customer's workspace, 2026-11-02: an address under Needs us read as "not in
                Odly" while all its matches sat in Resolved and the knowledge base). */}
            {displayMode === 'threads' && !isKanban && !loading && (
              <OutsideViewMatches
                filters={filters}
                onJump={handleScopeJump}
                onOpen={handleOpenThread}
                highlightTerms={highlightTerms}
                refreshKey={countsRefreshKey}
                enabled={countsReady}
              />
            )}

            {/* ⛔ OUTSIDE the view switch, so it serves the board AND the thread list. It lived
                inside the kanban branch first, which left the list view able to select rows
                with nothing to do with them. Sticky at the bottom of whichever view is open. */}
            <BulkActionBar
              selectedCount={bulkSelection.selectedIds.length}
              previews={bulkSelection.previews}
              loading={bulkSelection.loading}
              onPick={setBulkAction}
              onClear={bulkSelection.clear}
              onMerge={() => setBulkMergeOpen(true)}
              mergeMax={BULK_MERGE_MAX}
            />
          </div>
        </div>
        {/* end list panel inner container */}

        {/* ── Split pane (Messages list v2) ─────────────────────────────
            The thread beside the list: no backdrop, no body lock, the list stays live, and
            J/K walk it from the pane. An empty pane says what it is for. */}
        {split && <SplitDetailPane detail={detail} />}

        {/* ── Modal overlay ─────────────────────────────────────────── */}
        {selectedMessage && !isPhone && !split && (
          <DetailSlideOver
            detail={detail}
            onBackdropClick={() => {
              if (detailRequestCloseRef.current) {
                detailRequestCloseRef.current();
                return;
              }
              const params = new URLSearchParams(searchParams);
              params.delete('id');
              setSearchParams(params);
              // Forget the closed card too, as the detail's own onClose does; otherwise the next
              // thread's status change moves this card.
              selectedThreadIdRef.current = null;
              setSelectedMessage(null);
            }}
          />
        )}
      </div>
      {/* end flex row wrapper */}

      <DeleteMessageDialog
        open={deleteDialogOpen}
        message={messageToDelete}
        deleting={deleting}
        onCancel={() => setDeleteDialogOpen(false)}
        onConfirm={() => void handleDeleteConfirm()}
      />

      <AlertDialog
        open={alertDialog.open}
        onOpenChange={(open) => setAlertDialog({ ...alertDialog, open })}
        title={alertDialog.title}
        description={alertDialog.description}
        variant={alertDialog.variant}
      />

      <SpamPreviewDialog spamPreview={spamPreview} onClose={() => setSpamPreview(null)} />

      <BulkDialogs
        bulkAction={bulkAction}
        setBulkAction={setBulkAction}
        bulkSelection={bulkSelection}
        bulkRunning={bulkRunning}
        runBulkAction={runBulkAction}
        bulkMergeOpen={bulkMergeOpen}
        setBulkMergeOpen={setBulkMergeOpen}
        orgCode={orgCode}
        bumpKanban={bumpKanban}
        fetchMessages={fetchMessages}
        messagesPagination={messagesPagination}
      />

      {composeMounted && (
        <Suspense fallback={null}>
          <ComposeNewModal open={composeOpen} onClose={() => setComposeOpen(false)} />
        </Suspense>
      )}
    </>
  );
};
