// MessagesPage is over the 650-line cap. It's an existing pain point — pre-#18
// it was 642 lines, the Compose button + modal mount nudged it over. Splitting
// this page is a separate refactor (see backlog #15 contact rework, which will
// touch the same surface).
/* eslint-disable max-lines */
import { useState, useCallback, useRef, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Mail, PenSquare, RefreshCw } from 'lucide-react';
import { MessagesViewToggle } from '@/components/messages/MessagesViewToggle';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { PermissionGuard } from '@/components/auth/PermissionGuard';
import { Layout } from '@/components/layout/Layout';
import { PageHeader } from '@/components/shared/PageHeader';
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
import { Pagination } from '@/components/ui/Pagination';
import { apiClient } from '@/lib/api-client';
import { messageService, type MessageThread } from '@/services/message.service';
import { getConvUrlId } from '@/lib/messageHelpers';
import { useMessagesStore, type FilterState } from '@/stores/messagesStore';
import type { Message } from '@/types';
import { Permission } from '@/types/roles';
import { ComposeNewModal } from '@/components/messages/ComposeNewModal';
import { MessageFilters } from '@/components/messages/MessageFilters';
import { MessageListItem } from '@/components/messages/MessageListItem';
import { MessageDetail } from '@/components/messages/MessageDetail';
import { ContactsView } from '@/components/messages/ContactsView';
import { MessagesKanbanView } from '@/components/messages/MessagesKanbanView';
import { useMessagesData } from '@/hooks/useMessagesData';
import { useMessagesUrlSync } from '@/hooks/useMessagesUrlSync';
import { subscribeToEvent, unsubscribeFromEvent } from '@/lib/socketManager';
import { logger } from '@/lib/logger';

export const MessagesPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [displayMode, setDisplayMode] = useState<'threads' | 'contacts' | 'kanban'>(() => {
    const mode = searchParams.get('mode');
    if (mode === 'contacts') return 'contacts';
    if (mode === 'kanban') return 'kanban';
    // Arriving via a filter-bearing link (e.g. dashboard cards: "Messages
    // by Status", "Closed", SLA Breached / At Risk) without an explicit
    // ?mode= → force list view. Kanban groups by status itself, so any of
    // these URLs in kanban look like a no-op. Bookmarks that explicitly
    // request ?mode=kanban still win above.
    const FILTER_PARAMS = ['status', 'threadStatus', 'slaBreached', 'slaAtRisk'];
    if (FILTER_PARAMS.some((key) => searchParams.get(key))) return 'threads';
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
  const bumpKanban = useCallback(() => setKanbanRefreshKey((key) => key + 1), []);
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);

  // Lock body scroll while the detail panel is open + notify Layout to hide header
  useEffect(() => {
    if (selectedMessage) {
      document.body.style.overflow = 'hidden';
      window.dispatchEvent(new CustomEvent('detail-panel-change', { detail: { open: true } }));
    } else {
      document.body.style.overflow = '';
      window.dispatchEvent(new CustomEvent('detail-panel-change', { detail: { open: false } }));
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [selectedMessage]);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [messageToDelete, setMessageToDelete] = useState<Message | null>(null);
  const [deleting, setDeleting] = useState(false);
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
  const sorting = useMessagesStore((state) => state.sorting);
  const updateFilter = useMessagesStore((state) => state.updateFilter);
  const setSorting = useMessagesStore((state) => state.setSorting);
  const clearFiltersStore = useMessagesStore((state) => state.clearFilters);

  const urlSyncedRef = useRef(false);
  // Holds the URL form of the last-fetched conv id (either the numeric id as a
  // string or a publicId like 'SUP-42') — see useMessagesUrlSync for the dedup
  // contract. Stays in sync with what's written to the URL via getConvUrlId.
  const fetchedMessageIdRef = useRef<string | null>(null);
  const [pendingSearch, setPendingSearch] = useState(filters.search ?? '');

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
  } = useMessagesData({ urlSyncedRef });
  const threads: MessageThread[] = rawThreads;

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
      setPendingSearch(value as string);
      if (!(value as string).trim()) {
        updateFilter('search', '');
      }
    } else {
      updateFilter(key as keyof typeof filters, value as FilterState[keyof FilterState]);
      if (key === 'linked' && value === 'all') {
        updateFilter('linkedTicketStatus', 'all');
      }
    }
  };

  const handleSearch = () => {
    updateFilter('search', pendingSearch);
  };

  const handleSearchBlur = () => {
    if (!pendingSearch.trim() && filters.search) {
      updateFilter('search', '');
    }
  };

  const clearFilters = async () => {
    clearFiltersStore();
    setPendingSearch('');
    await fetchMessages(messagesPagination.page, true);
  };

  const handleOpenThread = useCallback(
    async (thread: MessageThread) => {
      if (thread.threadId.startsWith('spamlog_')) {
        setAlertDialog({
          open: true,
          title: 'Rule-blocked spam',
          description:
            'This message was rejected by a spam rule before being stored. No full content is available.',
          variant: 'info',
        });
        return;
      }
      const anchorId = thread.latestMessage?.id;
      if (!anchorId) return;
      // Preferred starting message: same one the list shows analysis badges for
      const preferredId = thread.latestIncomingMessage?.id ?? anchorId;
      try {
        const res = await messageService.getById(preferredId);
        if (res.success && res.data) {
          const messageToShow = res.data;
          fetchedMessageIdRef.current = getConvUrlId(messageToShow);
          setSelectedMessage({
            ...messageToShow,
            lastReplyFromClient: messageToShow.lastReplyFromClient ?? thread.lastReplyFromClient,
          });
          const params = new URLSearchParams(searchParams);
          params.set('id', getConvUrlId(messageToShow));
          setSearchParams(params);
          return;
        }
      } catch (error) {
        logger.error('Failed to fetch thread messages:', error);
      }
      const fallback = thread.latestIncomingMessage ?? thread.latestMessage;
      if (fallback) {
        fetchedMessageIdRef.current = getConvUrlId(fallback);
        setSelectedMessage(fallback);
        const params = new URLSearchParams(searchParams);
        params.set('id', getConvUrlId(fallback));
        setSearchParams(params);
      }
    },
    [searchParams, setSearchParams, fetchedMessageIdRef]
  );

  const handleApprove = (message: Message) => {
    navigate(`/tickets/create?messageId=${message.id}`);
  };

  const handleResolve = async () => {
    clearCache();
    await fetchMessages(messagesPagination.page, true);
    bumpKanban();
    setSelectedMessage(null);
  };

  const handleReject = async (message: Message) => {
    try {
      await messageService.markAsProcessed(message.id);
      clearCache();
      setSelectedMessage(null);
      bumpKanban();
      await fetchMessages(messagesPagination.page, true);
    } catch (error) {
      logger.error('Failed to mark message as processed:', error);
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
        params.set('id', getConvUrlId(response.data));
        setSearchParams(params);
      }
    } catch (error: unknown) {
      logger.error('Failed to reopen message:', error);
      const errorMsg =
        error && typeof error === 'object' && 'response' in error
          ? ((error as { response?: { data?: { error?: string } } }).response?.data?.error ??
            'Failed to reopen message')
          : 'Failed to reopen message';
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
        setSelectedMessage({
          ...response.data,
          lastReplyFromClient:
            response.data.lastReplyFromClient ?? selectedMessage.lastReplyFromClient,
        });
      }
      if (!abortController.signal.aborted) {
        await fetchMessages(messagesPagination.page, true);
      }
    } catch (error) {
      if (!abortController.signal.aborted) {
        logger.error('Failed to refresh message:', error);
      }
    }
  }, [selectedMessage, clearCache, fetchMessages, messagesPagination.page]);

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
    if (!messageToDelete) return;

    setDeleting(true);
    try {
      await messageService.delete(messageToDelete.id);
      clearCache(); void queryClient.invalidateQueries({ queryKey: ['needs-routing-count'] });
      setDeleteDialogOpen(false);
      setMessageToDelete(null);
      setSelectedMessage(null);
      await fetchMessages(1, true);
    } catch (error) {
      logger.error('Failed to delete message:', error);
      setAlertDialog({
        open: true,
        title: 'Delete Failed',
        description: 'Failed to delete message',
        variant: 'error',
      });
    } finally {
      setDeleting(false);
    }
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
    };
    subscribeToEvent('conversation:routed', handleConversationRouted);
    return () => unsubscribeFromEvent('conversation:routed', handleConversationRouted);
  }, [clearCache, fetchMessages, messagesPagination.page, bumpKanban]);

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

  const isKanban = displayMode === 'kanban';
  // Visible badge count: kanban-hidden filters (status/sla) excluded
  const activeFilterCount =
    (filters.messageSourceId && filters.messageSourceId !== 'all' ? 1 : 0) +
    (filters.departmentId && filters.departmentId !== 'all' ? 1 : 0) +
    (!isKanban && filters.status && filters.status !== 'all' ? 1 : 0) +
    (filters.threadStatus && filters.threadStatus !== 'all' ? 1 : 0) +
    (filters.priority && filters.priority !== 'all' ? 1 : 0) +
    (filters.assigneeId && filters.assigneeId !== 'all' ? 1 : 0) +
    (filters.aiState && filters.aiState !== 'all' ? 1 : 0) +
    (filters.labelId && filters.labelId !== 'all' ? 1 : 0) +
    (filters.linked && filters.linked !== 'all' ? 1 : 0) +
    (filters.search?.trim() ? 1 : 0) +
    (!isKanban && filters.slaBreached ? 1 : 0) +
    (!isKanban && filters.slaAtRisk ? 1 : 0);
  // Full count (no isKanban gate) — used for "Clear All" disabled state so that
  // list-mode filters set before switching to kanban can still be cleared.
  const clearableFilterCount =
    (filters.messageSourceId && filters.messageSourceId !== 'all' ? 1 : 0) +
    (filters.departmentId && filters.departmentId !== 'all' ? 1 : 0) +
    (filters.status && filters.status !== 'all' ? 1 : 0) +
    (filters.threadStatus && filters.threadStatus !== 'all' ? 1 : 0) +
    (filters.priority && filters.priority !== 'all' ? 1 : 0) +
    (filters.assigneeId && filters.assigneeId !== 'all' ? 1 : 0) +
    (filters.aiState && filters.aiState !== 'all' ? 1 : 0) +
    (filters.labelId && filters.labelId !== 'all' ? 1 : 0) +
    (filters.linked && filters.linked !== 'all' ? 1 : 0) +
    (filters.search?.trim() ? 1 : 0) +
    (filters.slaBreached ? 1 : 0) +
    (filters.slaAtRisk ? 1 : 0);

  return (
    <Layout>
      <div className="flex overflow-hidden flex-1 min-h-0">
        {/* ── List panel ─────────────────────────────────── */}
        <div className="overflow-y-auto flex-1 min-w-0">
          <div className="px-4 mx-auto space-y-4 w-full max-w-7xl">
            {/* Header */}
            <div className="mb-6">
              <PageHeader
                title="Messages"
                description="Manage and process incoming messages"
                actions={
                  <>
                    <PermissionGuard permission={Permission.MANAGE_TICKETS}>
                      <Button onClick={() => setComposeOpen(true)} variant="outline">
                        <PenSquare className="mr-2 h-4 w-4" />
                        Compose
                      </Button>
                    </PermissionGuard>
                    <PermissionGuard permission={Permission.MANAGE_MESSAGES}>
                      <Button
                        onClick={handleSyncEmails}
                        disabled={refreshing}
                        variant="outline"
                      >
                        <RefreshCw
                          className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`}
                        />
                        Sync New
                      </Button>
                    </PermissionGuard>
                    <Button onClick={handleRefresh} disabled={refreshing}>
                      <RefreshCw
                        className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`}
                      />
                      Refresh
                    </Button>
                  </>
                }
              />
            </div>

            <>
              <div className="mb-6">
                <MessageFilters
                  filters={filters}
                  sorting={sorting}
                  pendingSearch={pendingSearch}
                  activeFilterCount={activeFilterCount}
                  clearableFilterCount={clearableFilterCount}
                  pagination={displayMode === 'contacts' ? contactsPagination : pagination}
                  onFilterChange={handleFilterChange}
                  onSearch={handleSearch}
                  onSearchBlur={handleSearchBlur}
                  onClearFilters={clearFilters}
                  onSortingChange={(sortOrder) => setSorting({ sortOrder })}
                  setPendingSearch={setPendingSearch}
                  isKanban={isKanban}
                />
              </div>

              {/* Display mode toggle + inbox-level quick filter */}
              <div className="flex justify-between items-center gap-3 flex-wrap">
                <MessagesViewToggle displayMode={displayMode} onModeChange={setDisplayMode} />
                {displayMode === 'threads' && (
                  <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={filters.excludeAwaitingResponse ?? false}
                      onChange={(ev) => updateFilter('excludeAwaitingResponse', ev.target.checked)}
                      className="rounded border-border accent-primary"
                    />
                    Hide awaiting response
                  </label>
                )}
              </div>

              {displayMode === 'kanban' ? (
                <MessagesKanbanView
                  filters={filters}
                  onOpen={handleOpenThread}
                  refreshKey={kanbanRefreshKey}
                />
              ) : displayMode === 'contacts' ? (
                <ContactsView
                  apiFilters={(() => {
                    const filterObj: Record<string, string> = {};
                    const status = filters.status ?? 'all';
                    if (status === 'all') filterObj.view = 'work_queue';
                    else if (status === 'active') filterObj.view = 'active';
                    else if (status === 'awaiting_response')
                      filterObj.awaitingCustomerResponse = 'true';
                    else if (status === 'client_replied') filterObj.customerResponded = 'true';
                    else if (status === 'suspicious') filterObj.view = 'suspicious';
                    else if (status === 'not_analysed') filterObj.view = 'not_analysed';
                    else if (status === 'resolved') filterObj.view = 'resolved';
                    if (filters.threadStatus && filters.threadStatus !== 'all')
                      filterObj.processed = filters.threadStatus as string;
                    if (filters.messageSourceId && filters.messageSourceId !== 'all')
                      filterObj.messageSourceId = filters.messageSourceId;
                    if (filters.departmentId && filters.departmentId !== 'all') {
                      if (filters.departmentId === 'needs_routing') {
                        filterObj.view = 'needs_routing';
                      } else {
                        filterObj.departmentId = filters.departmentId;
                      }
                    }
                    if (filters.assigneeId && filters.assigneeId !== 'all')
                      filterObj.assigneeId =
                        filters.assigneeId === 'unassigned' ? '0' : filters.assigneeId;
                    if (filters.aiState === 'lead') filterObj.isLead = 'true';
                    if (filters.aiState === 'needs_review') filterObj.needsHumanReview = 'true';
                    if (filters.aiState === 'needs_info') filterObj.showNeedsInfo = 'true';
                    if (filters.aiState === 'ai_suggested') filterObj.aiSuggested = 'true';
                    if (filters.aiState === 'bot_handled') filterObj.botHandled = 'true';
                    if (filters.aiState === 'contradiction') filterObj.hasContradiction = 'true';
                    if (filters.linked === 'has_ticket') filterObj.hasTicket = 'true';
                    if (filters.linked === 'has_jira') filterObj.hasJiraTicket = 'true';
                    if (filters.priority && filters.priority !== 'all')
                      filterObj.priority = filters.priority;
                    if (filters.labelId && filters.labelId !== 'all')
                      filterObj.labelId = filters.labelId;
                    if (filters.search?.trim()) filterObj.search = filters.search.trim();
                    return filterObj;
                  })()}
                  focusSender={searchParams.get('sender') ?? undefined}
                  onPaginationChange={setContactsPagination}
                  onOpenMessage={(msg) => {
                    setSelectedMessage(msg);
                    const params = new URLSearchParams(searchParams);
                    params.set('id', getConvUrlId(msg));
                    setSearchParams(params);
                  }}
                />
              ) : loading ? (
                <div className="space-y-4">
                  {[0, 1, 2, 3, 4].map((idx) => (
                    <Card key={idx} className="animate-pulse">
                      <CardContent className="p-6">
                        <div className="mb-4 w-3/4 h-4 bg-gray-200 rounded" />
                        <div className="w-1/2 h-4 bg-gray-200 rounded" />
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : threads.length === 0 ? (
                <Card>
                  <CardContent className="p-12 text-center">
                    <Mail className="mx-auto mb-4 w-12 h-12 text-muted-foreground" />
                    <h3 className="mb-2 text-lg font-semibold">No messages found</h3>
                    <p className="text-muted-foreground">
                      {activeFilterCount > 0
                        ? 'No messages match your filters'
                        : 'No messages available'}
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-4">
                  {threads.map((thread) => (
                    <MessageListItem
                      key={thread.threadId}
                      thread={thread}
                      onOpen={handleOpenThread}
                    />
                  ))}
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
            </>
          </div>
        </div>
        {/* end list panel inner container */}

        {/* ── Modal overlay ─────────────────────────────────────────── */}
        {selectedMessage && (
          <>
            {/* Backdrop — dims the list, click to close */}
            <button
              type="button"
              aria-label="Close"
              className="fixed inset-0 z-20 cursor-default lg:left-64 bg-black/25 dark:bg-black/50"
              onClick={() => {
                const params = new URLSearchParams(searchParams);
                params.delete('id');
                setSearchParams(params);
                setSelectedMessage(null);
              }}
            />

            {/* Detail panel — slides in from right, full viewport height */}
            <div
              className="fixed right-0 bottom-0 w-full sm:w-[40rem] z-[60] border-l border-border bg-background flex flex-col overflow-hidden shadow-2xl transition-[top] duration-300"
              style={{ top: 'var(--mobile-header-h, 0px)' }}
            >
              <MessageDetail
                key={selectedMessage.id}
                message={selectedMessage}
                onClose={() => {
                  const params = new URLSearchParams(searchParams);
                  params.delete('id');
                  setSearchParams(params);
                  setSelectedMessage(null);
                }}
                onApprove={() => handleApprove(selectedMessage)}
                onReject={async () => {
                  await handleReject(selectedMessage);
                  setSelectedMessage(null);
                }}
                onReopen={async () => {
                  await handleReopen(selectedMessage);
                }}
                onDelete={() => {
                  handleDeleteClick(selectedMessage);
                  setSelectedMessage(null);
                }}
                onResolve={handleResolve}
                onRefresh={handleRefreshMessage}
                onClassify={async (action) => {
                  await messageService.classify(selectedMessage.id, action);
                  clearCache();
                  bumpKanban();
                  void queryClient.invalidateQueries({ queryKey: ['needs-routing-count'] });
                  await fetchMessages(messagesPagination.page, true);
                  setSelectedMessage(null);
                }}
                onMessageNavigate={async (messageId: number) => {
                  try {
                    const response = await messageService.getById(messageId);
                    if (response.success && response.data) {
                      setSelectedMessage(response.data);
                      const params = new URLSearchParams(searchParams);
                      params.set('id', messageId.toString());
                      setSearchParams(params);
                    }
                  } catch (error) {
                    logger.error('Failed to navigate to message:', error);
                  }
                }}
              />
            </div>
          </>
        )}
      </div>
      {/* end flex row wrapper */}

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogHeader>
          <DialogTitle>Delete Message</DialogTitle>
          <DialogClose onClose={() => setDeleteDialogOpen(false)} />
        </DialogHeader>
        <DialogContent>
          <p>Are you sure you want to delete this message? This action cannot be undone.</p>
          {messageToDelete && (
            <div className="p-4 mt-4 rounded bg-muted">
              <p className="text-sm font-medium">From: {messageToDelete.sender}</p>
              {messageToDelete.subject && (
                <p className="text-sm text-muted-foreground">Subject: {messageToDelete.subject}</p>
              )}
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

      <AlertDialog
        open={alertDialog.open}
        onOpenChange={(open) => setAlertDialog({ ...alertDialog, open })}
        title={alertDialog.title}
        description={alertDialog.description}
        variant={alertDialog.variant}
      />

      <ComposeNewModal open={composeOpen} onClose={() => setComposeOpen(false)} />
    </Layout>
  );
};
