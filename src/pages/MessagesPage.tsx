import { useState, useCallback, useRef, useEffect } from 'react';
import { Mail, RefreshCw, MessageSquare, Users, LayoutDashboard } from 'lucide-react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { PermissionGuard } from '@/components/auth/PermissionGuard';
import { Layout } from '@/components/layout/Layout';
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
import { apiClient } from '@/lib/api-client';
import { messageService, type MessageThread } from '@/services/message.service';
import { useAuthStore } from '@/stores/authStore';
import { useMessagesStore, type FilterState } from '@/stores/messagesStore';
import type { Message } from '@/types';
import { Permission } from '@/types/roles';
import { MessageFilters } from '@/components/messages/MessageFilters';
import { MessageListItem } from '@/components/messages/MessageListItem';
import { MessageDetail } from '@/components/messages/MessageDetail';
import { ContactsView } from '@/components/messages/ContactsView';
import { MessagesKanbanView } from '@/components/messages/MessagesKanbanView';
import { useMessagesData } from '@/hooks/useMessagesData';
import { useMessagesUrlSync } from '@/hooks/useMessagesUrlSync';
import { logger } from '@/lib/logger';

export const MessagesPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = useAuthStore((state) => state.token);

  const [displayMode, setDisplayMode] = useState<'threads' | 'contacts' | 'kanban'>(() => {
    const mode = searchParams.get('mode');
    if (mode === 'contacts') return 'contacts';
    if (mode === 'kanban') return 'kanban';
    return 'threads';
  });
  useEffect(() => {
    const mode = searchParams.get('mode');
    if (mode === 'contacts') setDisplayMode('contacts');
    else if (mode === 'kanban') setDisplayMode('kanban');
    else setDisplayMode('threads');
  }, [searchParams]);
  const [kanbanRefreshKey, setKanbanRefreshKey] = useState(0);
  const bumpKanban = useCallback(() => setKanbanRefreshKey((k) => k + 1), []);
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
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
  const _setFilters = useMessagesStore((state) => state.setFilters);
  const updateFilter = useMessagesStore((state) => state.updateFilter);
  const setSorting = useMessagesStore((state) => state.setSorting);
  const clearFiltersStore = useMessagesStore((state) => state.clearFilters);

  const urlSyncedRef = useRef(false);
  const fetchedMessageIdRef = useRef<number | null>(null);
  const [pendingSearch, setPendingSearch] = useState(filters.search ?? '');

  const {
    threads,
    loading,
    refreshing,
    setRefreshing,
    messagesPagination,
    fetchMessages,
    handlePageChange,
    handleRefresh,
    clearCache,
  } = useMessagesData({ urlSyncedRef });

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

  const handleOpenThread = useCallback(async (thread: MessageThread) => {
    if (thread.threadId.startsWith('spamlog_')) {
      setAlertDialog({
        open: true,
        title: 'Rule-blocked spam',
        description: 'This message was rejected by a spam rule before being stored. No full content is available.',
        variant: 'info',
      });
      return;
    }
    const anchorId = thread.latestMessage?.id;
    if (!anchorId) return;
    // Preferred starting message: same one the list shows analysis badges for
    const preferredId = thread.latestIncomingMessage?.id ?? anchorId;
    try {
      const { data: threadMessages } = await messageService.getThreadMessages(anchorId);
      if (threadMessages && threadMessages.length > 0) {
        const messageToShow =
          threadMessages.find((m) => m.id === preferredId) ??
          threadMessages[threadMessages.length - 1];
        setSelectedMessage(messageToShow);
        const params = new URLSearchParams(searchParams);
        params.set('id', messageToShow.id.toString());
        setSearchParams(params);
        return;
      }
    } catch (error) {
      logger.error('Failed to fetch thread messages:', error);
    }
    const fallback = thread.latestIncomingMessage ?? thread.latestMessage;
    if (fallback) {
      setSelectedMessage(fallback);
      const params = new URLSearchParams(searchParams);
      params.set('id', fallback.id.toString());
      setSearchParams(params);
    }
  }, [searchParams, setSearchParams]);

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
        params.set('id', reopenedMessageId.toString());
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
        setSelectedMessage(response.data);
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
    if (!token) {
      setAlertDialog({
        open: true,
        title: 'Authentication Required',
        description: 'You must be logged in to sync emails',
        variant: 'warning',
      });
      return;
    }

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
      clearCache();
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

  const isKanban = displayMode === 'kanban';
  // Visible badge count: kanban-hidden filters (status/threadStatus/slaFilter) excluded
  const activeFilterCount =
    (filters.messageSourceId && filters.messageSourceId !== 'all' ? 1 : 0) +
    (!isKanban && filters.status && filters.status !== 'all' ? 1 : 0) +
    (!isKanban && filters.threadStatus && filters.threadStatus !== 'all' ? 1 : 0) +
    (filters.priority && filters.priority !== 'all' ? 1 : 0) +
    (filters.assigneeId && filters.assigneeId !== 'all' ? 1 : 0) +
    (filters.aiState && filters.aiState !== 'all' ? 1 : 0) +
    (filters.labelId && filters.labelId !== 'all' ? 1 : 0) +
    (filters.linked && filters.linked !== 'all' ? 1 : 0) +
    (filters.search?.trim() ? 1 : 0) +
    (filters.departmentRole && filters.departmentRole !== 'all' ? 1 : 0) +
    (!isKanban && filters.slaFilter && filters.slaFilter !== 'all' ? 1 : 0);
  // Full count (no isKanban gate) — used for "Clear All" disabled state so that
  // list-mode filters set before switching to kanban can still be cleared.
  const clearableFilterCount =
    (filters.messageSourceId && filters.messageSourceId !== 'all' ? 1 : 0) +
    (filters.status && filters.status !== 'all' ? 1 : 0) +
    (filters.threadStatus && filters.threadStatus !== 'all' ? 1 : 0) +
    (filters.priority && filters.priority !== 'all' ? 1 : 0) +
    (filters.assigneeId && filters.assigneeId !== 'all' ? 1 : 0) +
    (filters.aiState && filters.aiState !== 'all' ? 1 : 0) +
    (filters.labelId && filters.labelId !== 'all' ? 1 : 0) +
    (filters.linked && filters.linked !== 'all' ? 1 : 0) +
    (filters.search?.trim() ? 1 : 0) +
    (filters.departmentRole && filters.departmentRole !== 'all' ? 1 : 0) +
    (filters.slaFilter && filters.slaFilter !== 'all' ? 1 : 0);

  return (
    <Layout>
      <div className="px-4 mx-auto space-y-4 w-full max-w-7xl">
        {/* Header */}
        <div className="flex flex-col gap-4 justify-between items-start mb-6 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-2xl font-bold">Messages</h2>
            <p className="text-sm text-muted-foreground">Manage and process incoming messages</p>
          </div>
          <div className="flex flex-wrap gap-2 w-full sm:w-auto">
            <PermissionGuard permission={Permission.MANAGE_MESSAGES}>
              <Button
                onClick={handleSyncEmails}
                disabled={refreshing}
                variant="outline"
                className="flex-1 sm:flex-none"
              >
                <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                Sync New
              </Button>
            </PermissionGuard>
            <Button onClick={handleRefresh} disabled={refreshing} className="flex-1 sm:flex-none">
              <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
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

            {/* Display mode toggle */}
            <div className="flex gap-1 items-center mb-2">
              <button
                onClick={() => {
                  setDisplayMode('threads');
                  setSearchParams(
                    (p) => {
                      p.delete('mode');
                      p.delete('sender');
                      return p;
                    },
                    { replace: true }
                  );
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                  displayMode === 'threads'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted'
                }`}
                title="Thread view — grouped by reply chain"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                Threads
              </button>
              <button
                onClick={() => {
                  setDisplayMode('contacts');
                  setSearchParams(
                    (p) => {
                      p.set('mode', 'contacts');
                      return p;
                    },
                    { replace: true }
                  );
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                  displayMode === 'contacts'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted'
                }`}
                title="Contacts view — grouped by sender with conversations by subject"
              >
                <Users className="w-3.5 h-3.5" />
                Contacts
              </button>
              <button
                onClick={() => {
                  setDisplayMode('kanban');
                  setSearchParams(
                    (p) => {
                      p.set('mode', 'kanban');
                      p.delete('sender');
                      return p;
                    },
                    { replace: true }
                  );
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                  displayMode === 'kanban'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted'
                }`}
                title="Kanban view — grouped by SLA and workflow status"
              >
                <LayoutDashboard className="w-3.5 h-3.5" />
                Kanban
              </button>
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
                  const f: Record<string, string> = {};
                  const status = filters.status ?? 'all';
                  if (status === 'all') f.view = 'work_queue';
                  else if (status === 'active') f.view = 'active';
                  else if (status === 'awaiting_response') f.awaitingCustomerResponse = 'true';
                  else if (status === 'client_replied') f.customerResponded = 'true';
                  else if (status === 'suspicious') f.view = 'suspicious';
                  else if (status === 'not_analysed') f.view = 'not_analysed';
                  else if (status === 'resolved') f.view = 'resolved';
                  if (filters.threadStatus && filters.threadStatus !== 'all') f.processed = filters.threadStatus;
                  if (filters.messageSourceId && filters.messageSourceId !== 'all')
                    f.messageSourceId = filters.messageSourceId;
                  if (filters.assigneeId && filters.assigneeId !== 'all')
                    f.assigneeId = filters.assigneeId === 'unassigned' ? '0' : filters.assigneeId;
                  if (filters.aiState === 'lead') f.isLead = 'true';
                  if (filters.aiState === 'needs_review') f.needsHumanReview = 'true';
                  if (filters.aiState === 'needs_info') f.showNeedsInfo = 'true';
                  if (filters.aiState === 'ai_suggested') f.aiSuggested = 'true';
                  if (filters.aiState === 'bot_handled') f.botHandled = 'true';
                  if (filters.aiState === 'contradiction') f.hasContradiction = 'true';
                  if (filters.linked === 'has_ticket') f.hasTicket = 'true';
                  if (filters.linked === 'has_jira') f.hasJiraTicket = 'true';
                  if (filters.priority && filters.priority !== 'all') f.priority = filters.priority;
                  if (filters.labelId && filters.labelId !== 'all') f.labelId = filters.labelId;
                  if (filters.search?.trim()) f.search = filters.search.trim();
                  return f;
                })()}
                focusSender={searchParams.get('sender') ?? undefined}
                onPaginationChange={setContactsPagination}
                onOpenMessage={(msg) => {
                  setSelectedMessage(msg);
                  const params = new URLSearchParams(searchParams);
                  params.set('id', msg.id.toString());
                  setSearchParams(params);
                }}
              />
            ) : loading ? (
              <div className="space-y-4">
                {[0, 1, 2, 3, 4].map((i) => (
                  <Card key={i} className="animate-pulse">
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

      {selectedMessage && (
        <Drawer
          open={!!selectedMessage}
          onClose={() => {
            const params = new URLSearchParams(searchParams);
            params.delete('id');
            setSearchParams(params);
            setSelectedMessage(null);
          }}
          title="Message Details"
        >
          <MessageDetail
            message={selectedMessage}
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
        </Drawer>
      )}

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
