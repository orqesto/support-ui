// MessagesPage is over the 650-line cap. It's an existing pain point — pre-#18
// it was 642 lines, the Compose button + modal mount nudged it over. Splitting
// this page is a separate refactor (see backlog #15 contact rework, which will
// touch the same surface).
/* eslint-disable max-lines */
import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Inbox, Mail, PenSquare, RefreshCw } from 'lucide-react';
import { MessagesViewToggle } from '@/components/messages/MessagesViewToggle';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { usePhoneOpensMessageAsPage } from '@/hooks/usePhoneOpensMessageAsPage';
import { buildContactsApiFilters } from '@/components/messages/contactsApiFilters';
import { PermissionGuard } from '@/components/auth/PermissionGuard';
import { Layout } from '@/components/layout/Layout';
import { PageHeader } from '@/components/shared/PageHeader';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogContent,
  DialogFooter,
} from '@/components/ui/Dialog';
import { Pagination } from '@/components/ui/Pagination';
import { apiClient } from '@/lib/api-client';
import { messageService, type MessageThread } from '@/services/message.service';
import { getConvUrlId } from '@/lib/messageHelpers';
import { useCurrentOrgCode } from '@/hooks/useCurrentOrgCode';
import { similarResultsCache } from '@/components/messages/AiTabPanel';
import { useSharedLinkWorkspace } from '@/hooks/useSharedLinkWorkspace';
import { cn, formatDate } from '@/lib/utils';
import { useMessagesStore, type FilterState } from '@/stores/messagesStore';
import type { Message, MessagesDisplayMode } from '@/types';
import { Permission } from '@/types/roles';
import { BulkActionBar } from '@/components/messages/bulk/BulkActionBar';
import { BULK_MERGE_MAX, BulkMergeDialog } from '@/components/messages/bulk/BulkMergeDialog';
import {
  BulkConfirmDialog,
  type BulkConfirmValues,
} from '@/components/messages/bulk/BulkConfirmDialog';
import { describeResult } from '@/components/messages/bulk/bulkResultMessage';
import { type BulkAction } from '@/components/messages/bulk/bulkActions';
import { useBulkSelection } from '@/components/messages/bulk/useBulkSelection';
import { useSelectionShortcuts } from '@/components/messages/bulk/selectionShortcuts';
import type { ToggleSelected } from '@/components/messages/bulk/selectMode';
import { bulkService } from '@/services/bulk.service';
import { toast } from '@/lib/toast';
import { ComposeNewModal } from '@/components/messages/ComposeNewModal';
import { MessageFilterBar } from '@/components/messages/filters/MessageFilterBar';
import { MessagesListCaption } from '@/components/messages/MessagesListCaption';
import { SurfaceCount } from '@/components/messages/filters/SurfaceCount';
import { useListPresentation } from '@/components/messages/useListPresentation';
import { useSafeMediaQuery } from '@/components/messages/useIsPhone';
import { MessageListItem } from '@/components/messages/MessageListItem';
import { MessageDetail } from '@/components/messages/MessageDetail';
import { DeleteMessageDialog } from '@/components/messages/DeleteMessageDialog';
import { neighbourThread } from '@/components/messages/detailShortcuts';
import { threadIdForMessage } from '@/components/messages/threadForMessage';
import { ThreadBubble } from '@/components/messages/ThreadBubble';
import { SPAM_LOG_CARD_COPY, spamLogTruncationNotice } from '@/lib/spamLogCardCopy';
import { ContactsView } from '@/components/messages/ContactsView';
import { QuickFilterChips } from '@/components/messages/QuickFilterChips';
import { quickFilterWouldChange } from '@/components/messages/quickFilterPatch';
import {
  MessagesKanbanView,
  type MessagesKanbanHandle,
} from '@/components/messages/MessagesKanbanView';
import { sortingToPreset, presetToSorting } from '@/components/messages/sortPresets';
import { scopeJumpUrl } from '@/hooks/scopeJumpUrl';
import { useMessagesData } from '@/hooks/useMessagesData';
import { useMessagesUrlSync } from '@/hooks/useMessagesUrlSync';
import { useNotificationCounts } from '@/hooks/useNotificationCounts';
import { subscribeToEvent, unsubscribeFromEvent } from '@/lib/socketManager';
import { logger } from '@/lib/logger';
import { getApiErrorMessage } from '@/lib/errorMessages';
import { usePermissions } from '@/hooks/usePermissions';

// URL params that are list-view-only filters. Kanban groups by status itself and
// ignores these, so arriving via a filter-bearing link (dashboard cards, or the
// Notification Center's Spam/Suspicious queue rows → ?queue=spam) must force the
// list ("threads") view — otherwise the click looks like a no-op on Kanban.
const LIST_ONLY_FILTER_PARAMS = [
  'status',
  'threadStatus',
  'slaBreached',
  'slaAtRisk',
  'queue',
  'read',
];

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
  const [displayMode, setDisplayMode] = useState<MessagesDisplayMode>(() => {
    const mode = searchParams.get('mode');
    if (mode === 'contacts') return 'contacts';
    if (mode === 'kanban') return 'kanban';
    // Arriving via a filter-bearing link (e.g. dashboard cards: "Messages
    // by Status", "Closed", SLA Breached / At Risk) without an explicit
    // ?mode= → force list view. Kanban groups by status itself, so any of
    // these URLs in kanban look like a no-op. Bookmarks that explicitly
    // request ?mode=kanban still win above.
    if (LIST_ONLY_FILTER_PARAMS.some((key) => searchParams.get(key))) return 'threads';
    const stored = localStorage.getItem('messages_view_mode');
    if (stored === 'contacts' || stored === 'kanban') return stored;
    return 'threads';
  });
  const displayModeSyncedRef = useRef(false);
  useEffect(() => {
    if (!displayModeSyncedRef.current) {
      displayModeSyncedRef.current = true;
      return;
    }
    const mode = searchParams.get('mode');
    if (mode === 'contacts') setDisplayMode('contacts');
    else if (mode === 'kanban') setDisplayMode('kanban');
    // No explicit ?mode= but a list-only filter arrived (e.g. Notification Center
    // "Spam"/"Suspicious" → ?queue=spam while already on Kanban): switch to the
    // list view so the queue is actually shown instead of a silent no-op.
    else if (LIST_ONLY_FILTER_PARAMS.some((key) => searchParams.get(key)))
      setDisplayMode('threads');
  }, [searchParams]);
  useEffect(() => {
    localStorage.setItem('messages_view_mode', displayMode);
  }, [displayMode]);
  // Keep URL in sync with displayMode so the address bar is always bookmarkable
  useEffect(() => {
    setSearchParams(
      (params) => {
        if (displayMode === 'kanban') params.set('mode', 'kanban');
        else if (displayMode === 'contacts') params.set('mode', 'contacts');
        else params.delete('mode');
        return params;
      },
      { replace: true }
    );
  }, [displayMode, setSearchParams]);
  const [kanbanRefreshKey, setKanbanRefreshKey] = useState(0);
  /**
   * Bulk selection. Owned HERE rather than inside the board because it must outlive a board
   * refresh (marking one thread read refreshes the board; the other fourteen stay picked) and
   * because the action bar sits outside the board.
   */
  const [bulkAction, setBulkAction] = useState<BulkAction | null>(null);
  const [bulkMergeOpen, setBulkMergeOpen] = useState(false);
  const [bulkRunning, setBulkRunning] = useState(false);
  /** What the board says it is holding — see the `pagination` prop on MessageFilterBar. */
  const [boardTotal, setBoardTotal] = useState(0);
  const bumpKanban = useCallback(() => setKanbanRefreshKey((key) => key + 1), []);

  // Imperative handle to the Kanban view for optimistic single-card moves, plus the
  // threadId of the currently-open conversation (captured on open) so we know which
  // card to move without a full board refetch.
  const kanbanRef = useRef<MessagesKanbanHandle>(null);
  const selectedThreadIdRef = useRef<string | null>(null);
  // The open detail panel registers its prompt-aware close here, so the backdrop
  // routes through the same "Mark as read?" prompt as the header X (triage threads).
  const detailRequestCloseRef = useRef<(() => void) | null>(null);
  // Move the open conversation's card to `targetColId` instantly via the Kanban's
  // optimistic path; fall back to a full board refetch when we can't target a card
  // (list mode / opened from a deep-link with no captured threadId). null = remove.
  const moveSelectedCard = useCallback(
    (targetColId: string | null) => {
      const tid = selectedThreadIdRef.current;
      if (tid && kanbanRef.current) {
        kanbanRef.current.optimisticMove(tid, targetColId);
      } else {
        bumpKanban();
      }
    },
    [bumpKanban]
  );
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  // Spam-filtered entries are spamLog rows, not real conversations (synthetic
  // negative ids, threadId "spamlog_NN"). The heavy MessageDetail pane fetches
  // events/notes/activity by id, which 404 for these, so we show the captured
  // body in a lightweight read-only preview instead of opening the pane.
  const [spamPreview, setSpamPreview] = useState<MessageThread | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);

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
  useEffect(() => {
    if (selectedMessage && !isPhone && !split) {
      document.body.style.overflow = 'hidden';
      window.dispatchEvent(new CustomEvent('detail-panel-change', { detail: { open: true } }));
    } else {
      document.body.style.overflow = '';
      window.dispatchEvent(new CustomEvent('detail-panel-change', { detail: { open: false } }));
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [selectedMessage, isPhone, split]);
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
  const [alertDialog, setAlertDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    variant: 'success' | 'error' | 'warning' | 'info';
  }>({ open: false, title: '', description: '', variant: 'info' });

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

  /**
   * Jump to the lens holding a category the current surface hides. Shared by both scope
   * notices so the list and the board cannot drift on what a chip does.
   *
   * `needsListView` is set for categories NO kanban column can display. Setting the filter
   * without leaving the board would apply it and change nothing visible — a link that
   * appears broken, which is worse than a plain number. Today that is `outbound_echo`.
   */
  const handleScopeJump = useCallback(
    (next: Partial<typeof filters>, needsListView?: boolean) => {
      if (needsListView) {
        /**
         * ⛔ NOT `setDisplayMode('threads')` + `patchFilters(...)`. That was the first
         * attempt and it silently undid itself on staging: the two produce two PARTIAL,
         * competing writes to the query string — the mode effect deletes `mode` with a
         * functional update, while the filters effect rebuilds the params from scratch
         * and carries `mode` over from a ref. Whichever lands second wins, and the
         * `[searchParams]` reader then resets the store from whatever survived. Observed
         * result: the board stayed, and `queue` went back to `all`.
         *
         * ONE whole-query navigation instead — the same thing the Notification Center
         * does for `?queue=spam`, and the case the mode effect's own comment describes:
         * no `mode` + a list-only filter param means "switch to the list and show it".
         */
        navigate(scopeJumpUrl(next));
        return;
      }
      // patchFilters merges, so pass only the delta. The store clears the cache AND the
      // stale scope on a filter change — the old count describes the old lens, and
      // leaving it up is a smaller version of the same lie.
      patchFilters(next as typeof filters);
    },
    [navigate, patchFilters]
  );

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
    setRefreshing,
    messagesPagination,
    fetchMessages,
    handlePageChange,
    handleRefresh,
    clearCache,
  } = useMessagesData({ urlSyncedRef, isKanban });

  /**
   * Run the chosen bulk action over the current selection.
   *
   * The SERVER decides eligibility again at this point — the preview the dialog showed may be
   * seconds old, and a thread can change in between. Whatever comes back is reported as it is:
   * applied, skipped with a reason, or failed.
   */
  const runBulkAction = useCallback(
    async (values: BulkConfirmValues) => {
      if (!bulkAction) return;
      setBulkRunning(true);
      try {
        const response = await bulkService.run(bulkAction, bulkSelection.selectedIds, {
          title: values.title,
          trainFilter: values.trainFilter,
          assigneeId: values.assigneeId,
        });
        if (!response.success) {
          toast.error('The bulk action could not be run');
          return;
        }
        if (!response.data) {
          toast.error('The bulk action returned nothing to report');
          return;
        }
        const outcome = describeResult(bulkAction, response.data);
        if (outcome.tone === 'warning') toast.error(outcome.text);
        else toast.success(outcome.text);

        bulkSelection.clear();
        setBulkAction(null);
        // One refresh for the whole run: the board keeps its loaded pages and scroll (#453).
        bumpKanban();
        void fetchMessages(messagesPagination.page, true);
      } catch (err) {
        toast.error(getApiErrorMessage(err) ?? 'The bulk action could not be run');
      } finally {
        setBulkRunning(false);
      }
    },
    [bulkAction, bulkSelection, bumpKanban, fetchMessages, messagesPagination.page]
  );

  const threads: MessageThread[] = rawThreads;

  /**
   * What the list view's "select every message on this page" can offer: the loaded rows that
   * are real conversations. A `spamlog_` row has none behind it and every bulk action refuses
   * it, so offering it would be an invitation to a guaranteed refusal.
   */
  const listSelectableIds = useMemo(
    () =>
      threads
        .filter(
          (thread) => !thread.threadId.startsWith('spamlog_') && (thread.latestMessage?.id ?? 0) > 0
        )
        .map((thread) => thread.latestMessage!.id),
    [threads]
  );
  const listSelectedCount = listSelectableIds.filter((id) => bulkSelection.isSelected(id)).length;

  /**
   * Select mode (owner, 2026-09-28): anything selected ⇒ every row and card shows its box
   * until the selection is empty. The WHOLE selection, not this page's share of it — the bar
   * says "N selected" for all of it, and a box hidden beside that count would contradict it.
   */
  const selectMode = bulkSelection.selectedIds.length > 0;

  /** List rows: a shift-click ranges over the rows on THIS page, in the order they are drawn. */
  const { toggle: toggleSelection, toggleRange: toggleSelectionRange } = bulkSelection;
  const toggleListRow = useCallback<ToggleSelected>(
    (conversationId, options) =>
      options?.range
        ? toggleSelectionRange(conversationId, listSelectableIds)
        : toggleSelection(conversationId),
    [toggleSelection, toggleSelectionRange, listSelectableIds]
  );

  // `x` toggles the focused row, Esc clears. Both are off while the detail pane is open: Esc
  // closes the pane there (detailShortcuts.ts), and the row that opened it still holds focus.
  // Off in the contacts view too — it has no selectable rows, and its profile panel closes on
  // an Esc (a window listener, no dialog role) that must not also drop a selection made
  // in the list.
  useSelectionShortcuts(
    {
      hasSelection: selectMode,
      listActive: selectedMessage === null && displayMode !== 'contacts',
    },
    { toggle: toggleSelection, clear: bulkSelection.clear }
  );

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
        title: 'Failed to load messages',
        description: 'Could not fetch messages. Please refresh the page.',
        variant: 'error',
      }),
  });

  const handleFilterChange = (key: string, value: string | boolean) => {
    if (key === 'search') {
      // Setting and clearing are the same write now. The old two-step (stage into
      // pendingSearch, commit on Enter/blur) existed for a controlled text input; the
      // bar hands over a finished term or an empty string.
      updateFilter('search', value as string);
    } else {
      updateFilter(key as keyof typeof filters, value as FilterState[keyof FilterState]);
      if (key === 'linked' && value === 'all') {
        updateFilter('linkedTicketStatus', 'all');
      }
    }
  };

  /**
   * Several filter keys in one write.
   *
   * The Received control owns three fields (`ageRange` and the two bounds), turning a
   * negated filter off touches two, and applying a saved view touches as many as it has.
   * Sending those one at a time walks through states nobody chose — a range with only a
   * `from`, a filter that is briefly still inverted — and each is a distinct cache key.
   */
  const handleFilterPatch = (patch: Partial<FilterState>) => {
    patchFilters(patch);
  };

  /**
   * Commit a search term in ONE step.
   *
   * The old panel typed into a controlled input and committed on Enter/blur, so it
   * needed the pendingSearch/onSearch pair. The token bar turns a term into a token in
   * a single action — and calling setPendingSearch then onSearch would not work, since
   * onSearch reads pendingSearch from its closure and would still see the old value.
   */
  const handleCommitSearch = (text: string) => {
    updateFilter('search', text);
  };

  const clearFilters = async () => {
    clearFiltersStore();
    await fetchMessages(messagesPagination.page, true);
  };

  const handleOpenThread = useCallback(
    async (thread: MessageThread) => {
      if (thread.threadId.startsWith('spamlog_')) {
        // spamLog rows carry the captured body in latestMessage.content — show
        // it read-only rather than routing a synthetic row through MessageDetail.
        setSpamPreview(thread);
        return;
      }
      const anchorId = thread.latestMessage?.id;
      if (!anchorId) return;
      // Remember which card this is so status actions can move it optimistically.
      selectedThreadIdRef.current = thread.threadId;
      // Preferred starting message: same one the list shows analysis badges for
      const preferredId = thread.latestIncomingMessage?.id ?? anchorId;
      try {
        const res = await messageService.getById(preferredId);
        if (res.success && res.data) {
          // Widen to the tolerant app Message type: `lastReplyFromClient` is not
          // returned by getById, so it is optional here and falls back to the
          // thread's value below.
          const messageToShow: Message = res.data;
          fetchedMessageIdRef.current = getConvUrlId(messageToShow, orgCode);
          setSelectedMessage({
            ...messageToShow,
            lastReplyFromClient: messageToShow.lastReplyFromClient ?? thread.lastReplyFromClient,
          });
          const params = new URLSearchParams(searchParams);
          params.set('id', getConvUrlId(messageToShow, orgCode));
          setSearchParams(params);
          return;
        }
      } catch (error) {
        logger.error('Failed to fetch thread messages:', error);
      }
      const fallback = thread.latestIncomingMessage ?? thread.latestMessage;
      if (fallback) {
        fetchedMessageIdRef.current = getConvUrlId(fallback, orgCode);
        setSelectedMessage(fallback);
        const params = new URLSearchParams(searchParams);
        params.set('id', getConvUrlId(fallback, orgCode));
        setSearchParams(params);
      }
    },
    [searchParams, setSearchParams, fetchedMessageIdRef]
  );

  // A thread opened from a deep link / reload never went through `handleOpenThread`, so the ref
  // below was null: J/K had nothing to step from, and a status change could not move the card.
  // Recover it from the loaded threads (threadForMessage.ts has the matching rule).
  useEffect(() => {
    if (!selectedMessage) return;
    if (selectedThreadIdRef.current) return;
    const recovered = threadIdForMessage(threads, selectedMessage.id);
    if (recovered) selectedThreadIdRef.current = recovered;
  }, [selectedMessage, threads]);

  // J/K from the detail rail — neighbourThread (detailShortcuts.ts) has the rules.
  const handleNavigate = useCallback(
    (direction: 'next' | 'prev') => {
      const target = neighbourThread(threads, selectedThreadIdRef.current, direction);
      if (target) void handleOpenThread(target);
    },
    [threads, handleOpenThread]
  );

  const handleApprove = (message: Message) => {
    navigate(`/tickets/create?messageId=${message.id}`);
  };

  const handleResolve = async () => {
    clearCache();
    // Instant Kanban move to Resolved (falls back to a full refetch in list mode).
    moveSelectedCard('resolved');
    await fetchMessages(messagesPagination.page, true);
    selectedThreadIdRef.current = null;
    setSelectedMessage(null);
  };

  // AFTER the detail has processed the conversation — it posts `markAsProcessed` itself (for
  // "Resolve" on an unreviewed thread AND for "Not customer work"), exactly as MessageDetailPage's
  // onReject assumes. ⛔ This used to post it AGAIN: every such press wrote a second
  // `mark_processed` audit entry — on a binned thread, one claiming someone marked it processed
  // after binning it — and reset closedAt.
  const handleRejected = async () => {
    try {
      clearCache();
      // Mark-as-processed closes the conversation → Resolved column.
      moveSelectedCard('resolved');
      selectedThreadIdRef.current = null;
      setSelectedMessage(null);
      await fetchMessages(messagesPagination.page, true);
    } catch (error) {
      logger.error('Failed to refresh after processing:', error);
    }
  };

  const handleReopen = async (message: Message) => {
    try {
      const reopenedMessageId = message.id;
      await messageService.reopen(message.id);
      clearCache();
      bumpKanban();
      await fetchMessages(messagesPagination.page, true);

      const response = await messageService.getById(reopenedMessageId);
      if (response.success && response.data) {
        setSelectedMessage(response.data);

        const params = new URLSearchParams(searchParams);
        params.set('id', getConvUrlId(response.data, orgCode));
        setSearchParams(params);
      }
    } catch (error: unknown) {
      logger.error('Failed to reopen message:', error);
      const errorMsg = getApiErrorMessage(error) ?? 'Failed to reopen message';
      setAlertDialog({
        open: true,
        title: 'Reopen Failed',
        description: errorMsg,
        variant: 'error',
      });
    }
  };

  const refreshAbortRef = useRef<AbortController | null>(null);

  const handleRefreshMessage = useCallback(async () => {
    if (!selectedMessage) return;
    refreshAbortRef.current?.abort();
    const abortController = new AbortController();
    refreshAbortRef.current = abortController;
    try {
      clearCache();
      const response = await messageService.getById(selectedMessage.id);
      if (abortController.signal.aborted) return;
      if (response.success && response.data) {
        const data: Message = response.data;
        setSelectedMessage({
          ...data,
          lastReplyFromClient: data.lastReplyFromClient ?? selectedMessage.lastReplyFromClient,
        });
      }
      if (!abortController.signal.aborted) {
        await fetchMessages(messagesPagination.page, true);
        // A reply or a header status change (park → on-hold, set-status, etc.)
        // flips the derived workflow status (e.g. → Pending after an agent reply),
        // which moves the card to a different Kanban column. The list refetch above
        // covers list mode; the Kanban view reloads its columns only when the
        // refreshKey bumps, so bump it here too — otherwise the card stays in the
        // old column until the agent manually changes a filter.
        bumpKanban();
      }
    } catch (error) {
      if (!abortController.signal.aborted) {
        logger.error('Failed to refresh message:', error);
      }
    }
  }, [selectedMessage, clearCache, fetchMessages, messagesPagination.page, bumpKanban]);

  const handleSyncEmails = async () => {
    // Auth is enforced by the httpOnly `jwt` cookie + BE 401 on the apiClient call.
    // No client-side gate — the catch below surfaces failures (including session-expired).
    try {
      setRefreshing(true);
      await apiClient.post('/api/messages/check-emails');

      // Poll for new messages — backend processes emails asynchronously
      let attempts = 0;
      const poll = async (): Promise<void> => {
        attempts++;
        await fetchMessages(1, true).catch((err) => logger.error('Failed to fetch messages:', err));
        if (attempts < 3) {
          setTimeout(() => void poll(), attempts * 1500);
        } else {
          setRefreshing(false);
        }
      };
      setTimeout(() => void poll(), 1000);
    } catch (error) {
      logger.error('Failed to sync emails:', error);
      setRefreshing(false);
      setAlertDialog({
        open: true,
        title: 'Sync Failed',
        description: 'Failed to sync emails',
        variant: 'error',
      });
    }
  };

  const handleDeleteClick = (message: Message) => {
    setMessageToDelete(message);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!messageToDelete || deletingRef.current) return;
    const target = messageToDelete;
    // Delete is offered from the open detail, so its card is the one captured when it opened.
    const deletingOpenThread = selectedMessage?.id === target.id;

    deletingRef.current = true;
    setDeleting(true);
    try {
      await messageService.delete(target.id);
    } catch (error) {
      logger.error('Failed to delete message:', error);
      // The full page's wording: the server's reason when it gave one (a 4xx), else generic.
      // The dialog stays up, so a retry is one press away.
      toast.error(getApiErrorMessage(error) ?? 'Failed to delete message');
      return;
    } finally {
      deletingRef.current = false;
      setDeleting(false);
    }
    clearCache();
    void queryClient.invalidateQueries({ queryKey: ['needs-routing-count'] });
    setDeleteDialogOpen(false);
    similarResultsCache.delete(target.id);
    setMessageToDelete(null);
    /*
      The detail stayed open behind the question (Cancel leaves it as it was); only now that the
      thread is gone does it close — and only if it is still the deleted one.
    */
    setSelectedMessage((current) => (current?.id === target.id ? null : current));
    /*
      The board too: the backend emits no delete event, so nothing else takes the card away. The
      open thread's card goes at once (a full board refetch where none was captured — list mode,
      a deep link); anything else is a refetch.
    */
    // The captured card is trusted only if it IS the deleted message's thread: Back / a merge's
    // navigation change the open message without touching the ref, and moving the captured card
    // would take a LIVE card off the board while the deleted one stayed.
    const deletedCard = threadIdForMessage(threads, target.id);
    if (deletingOpenThread && deletedCard !== null && selectedThreadIdRef.current === deletedCard) {
      moveSelectedCard(null);
    } else {
      bumpKanban();
    }
    if (deletingOpenThread) selectedThreadIdRef.current = null;
    await fetchMessages(1, true).catch((err) => logger.error('Failed to fetch messages:', err));
  };

  // Refresh thread list + kanban when any linked ticket status changes
  useEffect(() => {
    const handleTicketUpdated = () => {
      clearCache();
      void fetchMessages(messagesPagination.page, true);
      bumpKanban();
    };
    subscribeToEvent('ticket:updated', handleTicketUpdated);
    return () => unsubscribeFromEvent('ticket:updated', handleTicketUpdated);
  }, [clearCache, fetchMessages, messagesPagination.page, bumpKanban]);

  // Refresh when ANOTHER agent re-routes a conversation. Without this, agents
  // viewing the inbox/kanban in another tab see stale data: a conv they had in
  // their dept queue continues to display there until they manually refresh,
  // even after a colleague moved it elsewhere. The BE emits 'conversation:routed'
  // org-wide on every manualRouteMessage; the badge count, list, and kanban
  // columns all need to re-fetch to pick up the new dept assignment.
  useEffect(() => {
    const handleConversationRouted = () => {
      clearCache();
      void fetchMessages(messagesPagination.page, true);
      bumpKanban();
      // The routed conv left the needs_routing queue — refresh the sidebar badge
      // too (this handler's contract, but it was previously only refreshing list+kanban).
      void queryClient.invalidateQueries({ queryKey: ['needs-routing-count'] });
    };
    subscribeToEvent('conversation:routed', handleConversationRouted);
    return () => unsubscribeFromEvent('conversation:routed', handleConversationRouted);
  }, [clearCache, fetchMessages, messagesPagination.page, bumpKanban, queryClient]);

  // Refresh on server-side conv status transitions (resurface on customer
  // follow-up to resolved/closed conv, awaiting_response → client_replied on
  // inbound). Without this the row stays in the wrong column until manual
  // refresh. Same shape as the conversation:routed handler above.
  useEffect(() => {
    const handleStatusChanged = () => {
      clearCache();
      void fetchMessages(messagesPagination.page, true);
      bumpKanban();
    };
    subscribeToEvent('conv:status_changed', handleStatusChanged);
    return () => unsubscribeFromEvent('conv:status_changed', handleStatusChanged);
  }, [clearCache, fetchMessages, messagesPagination.page, bumpKanban]);

  // Refresh when a conversation's tab membership changes: approve/mark_suspicious/
  // move_to_spam (immediate, from the agent's own click) and bot_reply (deferred,
  // when auto-reply completes asynchronously after AI analysis on a previously-
  // approved conv lands the conv in awaiting_response). Without this listener,
  // un-marking a message as suspicious shows it leave the suspicious tab but the
  // downstream status transition (→ awaiting_response after auto-reply) only
  // becomes visible after a manual refresh.
  useEffect(() => {
    const handleConversationUpdated = () => {
      clearCache();
      void fetchMessages(messagesPagination.page, true);
      bumpKanban();
    };
    subscribeToEvent('conversation:updated', handleConversationUpdated);
    return () => unsubscribeFromEvent('conversation:updated', handleConversationUpdated);
  }, [clearCache, fetchMessages, messagesPagination.page, bumpKanban]);

  // Refresh when ANY agent replies (org-wide 'message:replied'). An agent reply
  // flips lastReplyFromClient=false → the conv derives to Pending and leaves the
  // Open/In-Progress column. The acting agent's own reply is already covered by
  // handleRefreshMessage, but other agents viewing the same board would otherwise
  // see the card stuck in its old column until a manual refresh. Same trio as the
  // handlers above.
  useEffect(() => {
    const handleMessageReplied = () => {
      clearCache();
      void fetchMessages(messagesPagination.page, true);
      bumpKanban();
    };
    subscribeToEvent('message:replied', handleMessageReplied);
    return () => unsubscribeFromEvent('message:replied', handleMessageReplied);
  }, [clearCache, fetchMessages, messagesPagination.page, bumpKanban]);

  // Visible badge count: kanban-hidden filters (status/sla) excluded
  const activeFilterCount =
    (filters.messageSourceId && filters.messageSourceId !== 'all' ? 1 : 0) +
    (filters.departmentId && filters.departmentId !== 'all' ? 1 : 0) +
    // List-view Status(lifecycle)+Queue dropdowns are hidden in kanban (it drives
    // its own columns), so they only count toward the visible badge in list mode.
    (!isKanban && filters.lifecycle && filters.lifecycle !== 'all' ? 1 : 0) +
    (!isKanban && filters.queue && filters.queue !== 'all' ? 1 : 0) +
    (!isKanban && filters.columnId && filters.columnId !== 'all' ? 1 : 0) +
    (!isKanban && filters.read && filters.read !== 'all' ? 1 : 0) +
    // Kanban's own lifecycle selector (threadStatus) still counts in kanban mode.
    (isKanban && filters.threadStatus && filters.threadStatus !== 'all' ? 1 : 0) +
    (filters.priority && filters.priority !== 'all' ? 1 : 0) +
    (filters.assigneeId && filters.assigneeId !== 'all' ? 1 : 0) +
    (filters.aiState && filters.aiState !== 'all' ? 1 : 0) +
    (filters.labelId && filters.labelId !== 'all' ? 1 : 0) +
    (filters.linked && filters.linked !== 'all' ? 1 : 0) +
    (filters.receivedAt && filters.receivedAt !== 'all' ? 1 : 0) +
    // Received is one filter whether it is a bucket or an explicit range.
    ((filters.ageRange && filters.ageRange !== 'all') || filters.receivedFrom || filters.receivedTo
      ? 1
      : 0) +
    (filters.search?.trim() ? 1 : 0) +
    (filters.slaBreached ? 1 : 0) +
    (filters.slaAtRisk ? 1 : 0) +
    (filters.hasAttachments ? 1 : 0);
  // Full count (no isKanban gate) — used for "Clear All" disabled state so that
  // list-mode filters set before switching to kanban can still be cleared.
  const clearableFilterCount =
    (filters.messageSourceId && filters.messageSourceId !== 'all' ? 1 : 0) +
    (filters.departmentId && filters.departmentId !== 'all' ? 1 : 0) +
    (filters.status && filters.status !== 'all' ? 1 : 0) +
    (filters.threadStatus && filters.threadStatus !== 'all' ? 1 : 0) +
    (filters.lifecycle && filters.lifecycle !== 'all' ? 1 : 0) +
    (filters.queue && filters.queue !== 'all' ? 1 : 0) +
    (filters.columnId && filters.columnId !== 'all' ? 1 : 0) +
    (filters.read && filters.read !== 'all' ? 1 : 0) +
    (filters.priority && filters.priority !== 'all' ? 1 : 0) +
    (filters.assigneeId && filters.assigneeId !== 'all' ? 1 : 0) +
    (filters.aiState && filters.aiState !== 'all' ? 1 : 0) +
    (filters.labelId && filters.labelId !== 'all' ? 1 : 0) +
    (filters.linked && filters.linked !== 'all' ? 1 : 0) +
    (filters.receivedAt && filters.receivedAt !== 'all' ? 1 : 0) +
    // Received is one filter whether it is a bucket or an explicit range.
    ((filters.ageRange && filters.ageRange !== 'all') || filters.receivedFrom || filters.receivedTo
      ? 1
      : 0) +
    (filters.search?.trim() ? 1 : 0) +
    (filters.slaBreached ? 1 : 0) +
    (filters.slaAtRisk ? 1 : 0) +
    (filters.hasAttachments ? 1 : 0);

  /**
   * The open thread's detail. One element, two homes: the slide-over over the list (list
   * layout, the board, contacts) or the pane beside it (split). The props are the same either
   * way — only where it is mounted differs.
   */
  const detail = selectedMessage ? (
    <MessageDetail
      key={selectedMessage.id}
      message={selectedMessage}
      onClose={() => {
        const params = new URLSearchParams(searchParams);
        params.delete('id');
        setSearchParams(params);
        selectedThreadIdRef.current = null;
        setSelectedMessage(null);
      }}
      onReplied={() => moveSelectedCard('awaiting')}
      // Only the threads view has one unambiguous order; in kanban "next" could mean
      // the next card in the column or across the board, so J/K stay off there.
      onNavigate={displayMode === 'threads' ? handleNavigate : undefined}
      onOptimisticMove={(columnId) => moveSelectedCard(columnId)}
      onApprove={() => handleApprove(selectedMessage)}
      onReject={async () => {
        await handleRejected();
        setSelectedMessage(null);
      }}
      onReopen={async () => {
        await handleReopen(selectedMessage);
      }}
      // The detail stays open until the delete succeeds: Cancel leaves it as it was,
      // with focus back on More (the header's focus return waits for the dialog).
      onDelete={canDelete ? () => handleDeleteClick(selectedMessage) : undefined}
      onResolve={handleResolve}
      onReadChanged={() => {
        // Refresh the board so the triage unread dot updates, without
        // tearing down the open detail panel.
        bumpKanban();
        void fetchMessages(messagesPagination.page, true);
      }}
      onRegisterRequestClose={(fn) => {
        detailRequestCloseRef.current = fn;
      }}
      onRefresh={handleRefreshMessage}
      onClassify={async (action, createDetectionRule, trainSpamFilter, confirm) => {
        await messageService.classify(
          selectedMessage.id,
          action,
          createDetectionRule,
          trainSpamFilter,
          confirm
        );
        clearCache();
        bumpKanban();
        void queryClient.invalidateQueries({ queryKey: ['needs-routing-count'] });
        await fetchMessages(messagesPagination.page, true);
        setSelectedMessage(null);
      }}
    />
  ) : null;

  /** The thread the split pane is reading, so its row can say so. */
  const openThreadId = selectedMessage
    ? (selectedThreadIdRef.current ?? threadIdForMessage(threads, selectedMessage.id))
    : null;
  const compactRows = density === 'compact';
  // The header's action buttons drop their words where the column is narrow (split) or on a
  // phone; the tooltip and the accessible name keep them.
  const actionLabel = split ? 'sr-only' : 'max-sm:sr-only';

  return (
    <Layout>
      <div className="flex overflow-hidden flex-1 min-h-0">
        {/* ── List panel ─────────────────────────────────── */}
        {/* Kanban fills the viewport from xl up (no page scroll; the lanes scroll
            internally); list view, mobile and every width below xl keep the normal panel
            scroll.
            ⛔ xl, not lg — it MUST match the breakpoint where MessagesKanbanView puts the
            lanes side by side (`xl:flex-row`). Between lg and xl the lanes STACK, and with
            this box already overflow-hidden the stack was clipped: on a 1276px window
            "Pending" started at 860px in an 806px viewport and nothing could scroll to it. */}
        <div
          className={`flex-1 min-w-0 ${
            isKanban ? 'overflow-y-auto xl:overflow-hidden xl:flex xl:flex-col' : 'overflow-y-auto'
          }`}
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
            <PageHeader
              title={<span className="text-xl max-sm:sr-only">Messages</span>}
              className="sm:items-center"
              meta={
                <>
                  <MessagesViewToggle
                    displayMode={displayMode}
                    onModeChange={setDisplayMode}
                    size="md"
                  />
                  <SurfaceCount
                    className={cn(
                      'text-[12.5px] text-muted-foreground tabular-nums max-sm:hidden',
                      split && 'hidden'
                    )}
                    pagination={
                      /**
                       * ⛔ Each surface reports ITS OWN count. Contacts already did; the board
                       * did not, so the header showed the LIST's total above a board running a
                       * different query — "1–50 of 53" over a board whose own badge said 64,
                       * the 11 needs-routing threads being the difference.
                       */
                      displayMode === 'contacts'
                        ? contactsPagination
                        : displayMode === 'kanban'
                          ? { page: 1, limit: boardTotal, total: boardTotal }
                          : pagination
                    }
                    isKanban={isKanban}
                    noun={displayMode === 'contacts' ? 'contacts' : undefined}
                  />
                </>
              }
              actions={
                <>
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
                  <PermissionGuard permission={Permission.MANAGE_MESSAGES}>
                    <Button
                      onClick={handleSyncEmails}
                      disabled={refreshing}
                      variant="outline"
                      title="Sync new"
                      className="h-8 px-3 gap-[7px] text-[13px]"
                    >
                      {refreshing ? (
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Inbox className="h-3.5 w-3.5" />
                      )}
                      <span className={actionLabel}>Sync new</span>
                    </Button>
                  </PermissionGuard>
                  <Button
                    onClick={handleRefresh}
                    disabled={refreshing}
                    title="Refresh"
                    className="h-8 px-3 gap-[7px] text-[13px]"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                    <span className={actionLabel}>Refresh</span>
                  </Button>
                </>
              }
            />

            <MessageFilterBar
              filters={filters}
              activeFilterCount={activeFilterCount}
              clearableFilterCount={clearableFilterCount}
              pagination={
                displayMode === 'contacts'
                  ? contactsPagination
                  : displayMode === 'kanban'
                    ? { page: 1, limit: boardTotal, total: boardTotal }
                    : pagination
              }
              // The count is in the header now, beside the view switch.
              showCount={false}
              onFilterChange={handleFilterChange}
              onFilterPatch={handleFilterPatch}
              onCommitSearch={handleCommitSearch}
              onClearFilters={() => void clearFilters()}
              isKanban={isKanban}
            />

            {/* One-click equivalents of the board's columns. List mode only: on the kanban the
                columns themselves already are the filter. */}
            {displayMode === 'threads' && (
              <QuickFilterChips
                // Counts come from the same scope read as the "hidden by the current view"
                // line, so a chip and that sentence can never disagree. Undefined on an older
                // backend — the chip then renders bare rather than claiming zero.
                counts={listScope?.columnCounts}
                value={filters.columnId ?? 'all'}
                onChange={(columnId) => {
                  // A second click on All must change nothing. It used to re-patch
                  // `lifecycle`/`queue` to 'all' on every click, and those are not neutral on
                  // the backend: `messageFilters` skips the default terminal/passive exclusion
                  // while a SPECIFIC lifecycle or queue is set, and re-applies it for 'all'.
                  // So clicking the already-lit chip re-imposed an exclusion a lens had lifted
                  // and rows disappeared — on one workspace, 16 of 72.
                  //
                  // The guard is on the RESULTING state, not on which chip is lit. `All` also
                  // renders lit whenever no column is selected, including while a dropdown is
                  // still narrowing; skipping on "lit" alone would remove the only control that
                  // clears those. Nothing is written only when nothing would change.
                  if (!quickFilterWouldChange(filters, columnId)) return;

                  // Selecting a column supersedes the dropdown filters it overlaps with —
                  // leaving those set would show a chip while the request carried a different,
                  // narrower predicate.
                  patchFilters({
                    ...filters,
                    columnId,
                    lifecycle: 'all',
                    queue: 'all',
                  });
                }}
              />
            )}

            {displayMode === 'kanban' ? (
              <MessagesKanbanView
                ref={kanbanRef}
                filters={filters}
                onOpen={handleOpenThread}
                refreshKey={kanbanRefreshKey}
                onScopeJump={handleScopeJump}
                onTotalChange={setBoardTotal}
                isSelected={bulkSelection.isSelected}
                onToggleSelected={bulkSelection.toggle}
                onToggleRange={bulkSelection.toggleRange}
                selectMode={selectMode}
                onSelectMany={bulkSelection.selectMany}
                onDeselectMany={bulkSelection.deselectMany}
              />
            ) : displayMode === 'contacts' ? (
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
            ) : (
              <div className="space-y-2">
                {/* The caption: select this page · what the view hides · how the list is
                    drawn. Above the list and outside the empty-state branch, so the "hidden by
                    the current view" sentence survives an empty result. */}
                <MessagesListCaption
                  selectableCount={listSelectableIds.length}
                  selectedCount={listSelectedCount}
                  onSelectPage={() =>
                    listSelectedCount === listSelectableIds.length
                      ? bulkSelection.deselectMany(listSelectableIds)
                      : bulkSelection.selectMany(listSelectableIds)
                  }
                  scope={listScope}
                  shown={pagination.total}
                  loading={loading}
                  onScopeJump={handleScopeJump}
                  arrivals={{
                    suspicious: arrivalCounts.suspicious_arrival ?? 0,
                    spam: arrivalCounts.spam_arrival ?? 0,
                  }}
                  onReviewArrivals={(queue) =>
                    clearArrivalKind(queue === 'suspicious' ? 'suspicious_arrival' : 'spam_arrival')
                  }
                  /**
                   * Whether the residue row's "clear the view" would change anything. These
                   * are exactly the filters that row resets — and `status` belongs in the
                   * list because `useMessagesData` drops its widening
                   * (`view=active&processed=all`) the moment a lifecycle or queue is set.
                   */
                  lensActive={
                    (filters.lifecycle ?? 'all') !== 'all' ||
                    (filters.queue ?? 'all') !== 'all' ||
                    (filters.columnId ?? 'all') !== 'all' ||
                    (filters.status ?? 'all') !== 'all' ||
                    filters.showKBOnly === true
                  }
                  hideAwaiting={filters.excludeAwaitingResponse ?? false}
                  onHideAwaitingChange={(next) => updateFilter('excludeAwaitingResponse', next)}
                  sortPreset={sortingToPreset(sorting)}
                  onSortChange={(value) => setSorting(presetToSorting(value))}
                  density={density}
                  onDensityChange={setDensity}
                  layout={layout}
                  onLayoutChange={setLayout}
                  canSplit={wideEnoughToSplit}
                  narrow={split}
                />

                {loading ? (
                  <div className={compactRows ? 'space-y-0' : 'space-y-2'}>
                    {[0, 1, 2, 3, 4].map((idx) => (
                      <Card key={idx} className="animate-pulse">
                        <CardContent className="py-3 px-4 space-y-2">
                          <div className="w-2/5 h-2.5 bg-muted rounded" />
                          <div className="w-3/4 h-2.5 bg-muted rounded" />
                          <div className="w-1/2 h-2.5 bg-muted rounded" />
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : threads.length === 0 ? (
                  <Card>
                    <CardContent className="p-12 text-center">
                      <Mail className="mx-auto mb-4 w-12 h-12 text-muted-foreground" />
                      <h3 className="font-display mb-2 text-lg font-semibold">No messages found</h3>
                      <p className="text-muted-foreground">
                        {activeFilterCount > 0
                          ? 'No messages match your filters'
                          : 'No messages available'}
                      </p>
                      {(listScope?.hidden ?? 0) > 0 && (
                        <p className="mt-2 text-[12.5px] text-muted-foreground">
                          {listScope?.hidden.toLocaleString()} are outside this view — use{' '}
                          <b>Not shown</b> above to jump to them.
                        </p>
                      )}
                    </CardContent>
                  </Card>
                ) : compactRows ? (
                  // Compact: one ruled panel, a hairline between rows.
                  <Card padding="none" className="overflow-hidden">
                    {threads.map((thread) => (
                      <MessageListItem
                        key={thread.threadId}
                        thread={thread}
                        density="compact"
                        narrow={split}
                        current={split && openThreadId === thread.threadId}
                        onOpen={handleOpenThread}
                        selected={
                          thread.latestMessage
                            ? bulkSelection.isSelected(thread.latestMessage.id)
                            : false
                        }
                        onToggleSelected={toggleListRow}
                        selectMode={selectMode}
                        onReadChanged={() => {
                          bumpKanban();
                          void fetchMessages(messagesPagination.page, true);
                        }}
                      />
                    ))}
                  </Card>
                ) : (
                  // Comfortable: a card per thread, 8px apart (staging's look, kept).
                  <div className="grid gap-2">
                    {threads.map((thread) => (
                      <MessageListItem
                        key={thread.threadId}
                        thread={thread}
                        current={split && openThreadId === thread.threadId}
                        onOpen={handleOpenThread}
                        selected={
                          thread.latestMessage
                            ? bulkSelection.isSelected(thread.latestMessage.id)
                            : false
                        }
                        onToggleSelected={toggleListRow}
                        selectMode={selectMode}
                        onReadChanged={() => {
                          bumpKanban();
                          void fetchMessages(messagesPagination.page, true);
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {displayMode === 'threads' && !loading && threads.length > 0 && (
              <Pagination
                currentPage={pagination.page}
                totalPages={pagination.totalPages}
                total={pagination.total}
                limit={pagination.limit}
                onPageChange={handlePageChange}
                loading={loading}
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
        {split && (
          <aside
            aria-label="Message detail"
            className="flex flex-col flex-[0_0_58%] min-w-0 overflow-hidden border-l border-border bg-card"
          >
            {detail ?? (
              <div className="grid flex-1 place-items-center p-5 text-center text-[13px] text-muted-foreground">
                <p>
                  Select a conversation to read it here.
                  <br />
                  <span className="text-xs">J / K move between threads.</span>
                </p>
              </div>
            )}
          </aside>
        )}

        {/* ── Modal overlay ─────────────────────────────────────────── */}
        {selectedMessage && !isPhone && !split && (
          <>
            {/* Backdrop — dims the list, click to close. Route through the panel's
                prompt-aware close so an unread triage thread still asks "Mark as
                read?" here, matching the header X. Falls back to a direct close if
                the panel hasn't registered a handler yet. */}
            <button
              type="button"
              aria-label="Close"
              className={cn(
                'fixed inset-0 z-20 cursor-default bg-black/25 dark:bg-black/50',
                // Leave the sidebar undimmed: offset by its current width (set by the shell).
                'lg:left-[var(--sidebar-w,16rem)]'
              )}
              onClick={() => {
                if (detailRequestCloseRef.current) {
                  detailRequestCloseRef.current();
                  return;
                }
                const params = new URLSearchParams(searchParams);
                params.delete('id');
                setSearchParams(params);
                setSelectedMessage(null);
              }}
            />

            {/* Detail panel — slides in from right, full viewport height. Never on a phone:
                there every selection opens the full page (usePhoneOpensMessageAsPage). */}
            <div
              className="fixed right-0 bottom-0 w-full sm:w-[40rem] z-[60] border-l border-border bg-background flex flex-col overflow-hidden shadow-2xl transition-[top] duration-300"
              style={{ top: 'var(--mobile-header-h, 0px)' }}
            >
              {detail}
            </div>
          </>
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

      <Dialog
        open={spamPreview !== null}
        onOpenChange={(open) => !open && setSpamPreview(null)}
        size="lg"
      >
        <DialogHeader>
          <div className="flex items-center gap-2">
            <DialogTitle>{spamPreview?.latestMessage?.subject || '(no subject)'}</DialogTitle>
            <Badge variant="warning">{SPAM_LOG_CARD_COPY.badge}</Badge>
          </div>
        </DialogHeader>
        <DialogContent>
          {/*
            Why this is a dialog and not the usual detail pane, said on the screen rather
            than left for the reader to infer from a modal appearing where a thread was
            expected. A card is a spam-rule RECORD (spam_log row) not attached to a conversation
            in this view — usually a catch record whose conversation is gone, but not always: a
            record whose message IS in a thread stays a card until spam is viewed in its
            workspace (25 linked per load), and a global admin with no workspace selected links
            none. Rows a critical-spam rule WITHHELD are never cards. So there are no events,
            notes or activity to show, and the copy says only what holds in every state
            (SPAM_LOG_CARD_COPY).
          */}
          <p className="mb-3 text-xs text-muted-foreground">
            {spamPreview?.latestMessage?.contentTruncatedFrom !== undefined
              ? SPAM_LOG_CARD_COPY.captionCut
              : SPAM_LOG_CARD_COPY.caption}
          </p>
          <div className="mb-3 space-y-0.5 text-sm text-muted-foreground">
            <div>
              <span className="font-medium text-foreground">From:</span>{' '}
              {spamPreview?.latestMessage?.sender || 'unknown sender'}
            </div>
            {spamPreview?.latestMessage?.createdAt && (
              <div>
                <span className="font-medium text-foreground">Received:</span>{' '}
                {formatDate(spamPreview.latestMessage.createdAt)}
              </div>
            )}
          </div>
          {spamPreview?.latestMessage?.content &&
            spamPreview.latestMessage.contentTruncatedFrom !== undefined && (
              <p className="mb-2 text-xs font-medium text-warning" role="note">
                {spamLogTruncationNotice(
                  spamPreview.latestMessage.content.length,
                  spamPreview.latestMessage.contentTruncatedFrom
                )}
              </p>
            )}
          <div className="rounded-md border border-border bg-muted/30 p-3">
            {spamPreview?.latestMessage?.content ? (
              <ThreadBubble
                content={spamPreview.latestMessage.content}
                isAgent={false}
                quoteExpanded
              />
            ) : (
              <p className="text-sm text-muted-foreground">{SPAM_LOG_CARD_COPY.emptyBody}</p>
            )}
          </div>
        </DialogContent>
        <DialogFooter>
          <Button onClick={() => setSpamPreview(null)}>Close</Button>
        </DialogFooter>
      </Dialog>

      <BulkConfirmDialog
        open={bulkAction !== null}
        action={bulkAction}
        preview={bulkAction ? (bulkSelection.previews[bulkAction] ?? null) : null}
        selectedCount={bulkSelection.selectedIds.length}
        running={bulkRunning}
        onOpenChange={(open) => {
          if (!open) setBulkAction(null);
        }}
        onConfirm={(values) => void runBulkAction(values)}
      />

      <BulkMergeDialog
        open={bulkMergeOpen}
        selectedIds={bulkSelection.selectedIds}
        onOpenChange={setBulkMergeOpen}
        onMerged={(survivor) => {
          setBulkMergeOpen(false);
          bulkSelection.clear();
          toast.success(`Merged into ${getConvUrlId(survivor, orgCode)}`);
          bumpKanban();
          void fetchMessages(messagesPagination.page, true);
        }}
      />

      <ComposeNewModal open={composeOpen} onClose={() => setComposeOpen(false)} />
    </Layout>
  );
};
