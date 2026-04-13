import { useState, useCallback, useRef, useEffect } from 'react';
import { Mail, RefreshCw, ShieldAlert, MessageSquare, Users } from 'lucide-react';
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
import { messageService } from '@/services/message.service';
import { type SpamLog, type SpamLogFilters as SpamFiltersType } from '@/services/spamLog.service';
import { useAuthStore } from '@/stores/authStore';
import { useMessagesStore } from '@/stores/messagesStore';
import type { Message } from '@/types';
import { Permission } from '@/types/roles';
import { MessageFilters } from '@/components/messages/MessageFilters';
import { MessageListItem } from '@/components/messages/MessageListItem';
import { MessageDetail } from '@/components/messages/MessageDetail';
import { ContactsView } from '@/components/messages/ContactsView';
import { SpamLogFilters as SpamFiltersComponent } from '@/components/spam/SpamLogFilters';
import { SpamLogListItem } from '@/components/spam/SpamLogListItem';
import { SpamLogDetail } from '@/components/spam/SpamLogDetail';
import { Tabs, type Tab } from '@/components/ui/Tabs';
import { useMessagesData } from '@/hooks/useMessagesData';
import { useMessagesUrlSync } from '@/hooks/useMessagesUrlSync';
import { logger } from '@/lib/logger';

export const MessagesPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = useAuthStore((state) => state.token);

  const [activeTab, setActiveTab] = useState<'messages' | 'spam'>('messages');
  const [displayMode, setDisplayMode] = useState<'threads' | 'contacts'>(
    searchParams.get('mode') === 'contacts' ? 'contacts' : 'threads'
  );
  useEffect(() => {
    setDisplayMode(searchParams.get('mode') === 'contacts' ? 'contacts' : 'threads');
  }, [searchParams]);
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [selectedSpamLog, setSelectedSpamLog] = useState<SpamLog | null>(null);
  const [spamFilters, setSpamFilters] = useState<SpamFiltersType>({});
  const [pendingSpamSearch, setPendingSpamSearch] = useState('');
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
  const setFilters = useMessagesStore((state) => state.setFilters);
  const updatePrimaryFilter = useMessagesStore((state) => state.updatePrimaryFilter);
  const updateSecondaryFilter = useMessagesStore((state) => state.updateSecondaryFilter);
  const setSorting = useMessagesStore((state) => state.setSorting);
  const clearFiltersStore = useMessagesStore((state) => state.clearFilters);

  const urlSyncedRef = useRef(false);
  const fetchedMessageIdRef = useRef<number | null>(null);
  const [pendingSearch, setPendingSearch] = useState(filters.search ?? '');

  const {
    messages,
    spamLogs,
    loading,
    refreshing,
    setRefreshing,
    messagesPagination,
    spamPagination,
    fetchMessages,
    handlePageChange,
    handleRefresh,
    clearCache,
  } = useMessagesData({ urlSyncedRef, activeTab, spamFilters });

  const pagination = activeTab === 'messages' ? messagesPagination : spamPagination;

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
    const primaryFilters = ['view', 'channel', 'messageSourceId'];

    if (key === 'search') {
      setPendingSearch(value as string);
      if (!(value as string).trim()) {
        updateSecondaryFilter('search', '');
      }
    } else if (primaryFilters.includes(key)) {
      updatePrimaryFilter(key as 'view' | 'channel' | 'messageSourceId', value as string);
    } else {
      updateSecondaryFilter(key as keyof typeof filters, value);
    }
  };

  const handleSearch = () => {
    updateSecondaryFilter('search', pendingSearch);
  };

  const handleSearchBlur = () => {
    if (!pendingSearch.trim() && filters.search) {
      updateSecondaryFilter('search', '');
    }
  };

  const clearFilters = async () => {
    clearFiltersStore();
    setPendingSearch('');
    await fetchMessages(messagesPagination.page, true);
  };

  const handleTabSwitch = (tab: 'messages' | 'spam') => {
    if (tab === 'messages') {
      setSpamFilters({});
      setPendingSpamSearch('');
    } else {
      clearFiltersStore();
      setPendingSearch('');
    }
    setActiveTab(tab);
  };

  const handleApprove = (message: Message) => {
    navigate(`/tickets/create?messageId=${message.id}`);
  };

  const handleResolve = async () => {
    clearCache();
    await fetchMessages(messagesPagination.page, true);
    setSelectedMessage(null);
  };

  const handleReject = async (message: Message) => {
    try {
      await messageService.markAsProcessed(message.id);
      clearCache();
      setSelectedMessage(null);
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

  const activeFilterCount =
    (filters.processed !== 'all' ? 1 : 0) +
    (filters.channel !== 'all' ? 1 : 0) +
    ((filters.showSpam ?? filters.excludeSpam ?? filters.showNeedsInfo ?? filters.showWorthy)
      ? 1
      : 0) +
    (filters.hasAttachments ? 1 : 0) +
    (filters.hasReplies ? 1 : 0) +
    (filters.hasTicket !== undefined ? 1 : 0) +
    (filters.showFailed ? 1 : 0) +
    ((filters.showKBOnly ?? filters.excludeKB) ? 1 : 0) +
    (filters.awaitingCustomerResponse ? 1 : 0) +
    (filters.customerResponded ? 1 : 0) +
    (filters.search?.trim() ? 1 : 0) +
    (filters.needsHumanReview ? 1 : 0) +
    (filters.departmentRole && filters.departmentRole !== 'all' ? 1 : 0);

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

        {/* Tabs */}
        <Tabs
          tabs={
            [
              {
                id: 'messages' as const,
                label: 'Messages',
                icon: Mail,
                description: 'View and manage incoming messages',
              },
              {
                id: 'spam' as const,
                label: 'Spam Logs',
                icon: ShieldAlert,
                description: 'Review detected spam and false positives',
              },
            ] satisfies Tab<'messages' | 'spam'>[]
          }
          activeTab={activeTab}
          onTabChange={handleTabSwitch}
          variant="default"
          size="md"
          fullWidth
        />

        {/* Content based on active tab */}
        {activeTab === 'messages' ? (
          <>
            <div className="mb-6">
              <MessageFilters
                filters={filters}
                sorting={sorting}
                pendingSearch={pendingSearch}
                activeFilterCount={activeFilterCount}
                pagination={displayMode === 'contacts' ? contactsPagination : pagination}
                onFilterChange={handleFilterChange}
                onSearch={handleSearch}
                onSearchBlur={handleSearchBlur}
                onClearFilters={clearFilters}
                onSortingChange={(sortOrder) => setSorting({ sortOrder })}
                setPendingSearch={setPendingSearch}
                setFilters={setFilters}
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
            </div>

            {displayMode === 'contacts' ? (
              <ContactsView
                apiFilters={(() => {
                  const f: Record<string, string> = {};
                  if (filters.view && filters.view !== 'all') f.view = filters.view;
                  if (filters.channel && filters.channel !== 'all') f.channel = filters.channel;
                  if (filters.processed && filters.processed !== 'all')
                    f.processed = filters.processed as string;
                  if (filters.isLead) f.isLead = 'true';
                  if (filters.hasTicket !== undefined)
                    f.hasTicket = filters.hasTicket ? 'true' : 'false';
                  if (filters.showSpam) f.showSpam = 'true';
                  if (filters.excludeSpam) f.excludeSpam = 'true';
                  if (filters.showNeedsInfo) f.showNeedsInfo = 'true';
                  if (filters.showWorthy) f.showWorthy = 'true';
                  if (filters.hasAttachments) f.hasAttachments = 'true';
                  if (filters.awaitingCustomerResponse) f.awaitingCustomerResponse = 'true';
                  if (filters.assigneeId && filters.assigneeId !== 'all')
                    f.assigneeId = filters.assigneeId === 'unassigned' ? '0' : filters.assigneeId;
                  if (filters.search?.trim()) f.search = filters.search.trim();
                  if (filters.messageSourceId && filters.messageSourceId !== 'all')
                    f.messageSourceId = filters.messageSourceId;
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
                {Array.from({ length: 5 }).map((_, i) => (
                  <Card key={`skeleton-${i}`} className="animate-pulse">
                    <CardContent className="p-6">
                      <div className="mb-4 w-3/4 h-4 bg-gray-200 rounded" />
                      <div className="w-1/2 h-4 bg-gray-200 rounded" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : messages.length === 0 ? (
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
                {messages.map((message) => (
                  <MessageListItem
                    key={message.id}
                    message={message}
                    onOpen={async (msg) => {
                      const threadMeta = msg.metadata as {
                        isThreadView?: boolean;
                        threadId?: string;
                      };

                      if (threadMeta?.isThreadView && msg.id) {
                        try {
                          const { data: threadMessages } = await messageService.getThreadMessages(
                            msg.id
                          );
                          if (threadMessages && threadMessages.length > 0) {
                            const sorted = [...threadMessages].sort((a, b) => b.id - a.id);
                            const messageToShow =
                              sorted.find((m) => m.isOutgoing === false) ??
                              sorted[0];
                            setSelectedMessage(messageToShow);
                            const params = new URLSearchParams(searchParams);
                            params.set('id', messageToShow.id.toString());
                            setSearchParams(params);
                          } else {
                            setSelectedMessage(msg);
                            const params = new URLSearchParams(searchParams);
                            params.set('id', msg.id.toString());
                            setSearchParams(params);
                          }
                        } catch (error) {
                          logger.error('Failed to fetch thread messages:', error);
                          setSelectedMessage(msg);
                          const params = new URLSearchParams(searchParams);
                          params.set('id', msg.id.toString());
                          setSearchParams(params);
                        }
                      } else {
                        setSelectedMessage(msg);
                        const params = new URLSearchParams(searchParams);
                        params.set('id', msg.id.toString());
                        setSearchParams(params);
                      }
                    }}
                  />
                ))}
              </div>
            )}

            {displayMode === 'threads' && !loading && messages.length > 0 && (
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
        ) : (
          <>
            <div className="mb-6">
              <SpamFiltersComponent
                filters={spamFilters}
                pendingSearch={pendingSpamSearch}
                activeFilterCount={
                  (spamFilters.channel ? 1 : 0) +
                  (spamFilters.category ? 1 : 0) +
                  (spamFilters.departmentRole ? 1 : 0) +
                  (spamFilters.messageSourceId ? 1 : 0) +
                  (spamFilters.days && spamFilters.days !== 30 ? 1 : 0) +
                  (spamFilters.search ? 1 : 0)
                }
                pagination={pagination}
                onFilterChange={(key, value) => {
                  const newFilters = { ...spamFilters };
                  if (
                    value === 'all' ||
                    value === '' ||
                    value === undefined ||
                    (key === 'days' && value === 30)
                  ) {
                    delete newFilters[key as keyof typeof newFilters];
                  } else {
                    newFilters[key as keyof typeof newFilters] = value as never;
                  }
                  setSpamFilters(newFilters);
                }}
                onSearch={() => {
                  setSpamFilters({ ...spamFilters, search: pendingSpamSearch });
                }}
                onSearchBlur={() => {
                  setSpamFilters({ ...spamFilters, search: pendingSpamSearch });
                }}
                onClearFilters={() => {
                  setSpamFilters({});
                  setPendingSpamSearch('');
                }}
                onSortingChange={(sortOrder) => {
                  const newFilters = { ...spamFilters };
                  if (sortOrder === 'desc') {
                    delete newFilters.sortOrder;
                  } else {
                    newFilters.sortOrder = sortOrder;
                  }
                  setSpamFilters(newFilters);
                }}
                setPendingSearch={setPendingSpamSearch}
                setFilters={setSpamFilters}
              />
            </div>

            {loading ? (
              <div className="space-y-4">
                {Array.from({ length: 5 }, (_, i) => i).map((i) => (
                  <Card key={`spam-skeleton-${i}`} className="animate-pulse">
                    <CardContent className="p-6">
                      <div className="mb-4 w-3/4 h-4 bg-gray-200 rounded" />
                      <div className="w-1/2 h-4 bg-gray-200 rounded" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : spamLogs.length === 0 ? (
              <Card>
                <CardContent className="p-12 text-center">
                  <Mail className="mx-auto mb-4 w-12 h-12 text-muted-foreground" />
                  <h3 className="mb-2 text-lg font-semibold">No spam logs found</h3>
                  <p className="text-muted-foreground">No spam has been detected recently</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4">
                {spamLogs.map((log) => (
                  <SpamLogListItem key={log.id} log={log} onOpen={setSelectedSpamLog} />
                ))}
              </div>
            )}

            {!loading && spamLogs.length > 0 && (
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
        )}
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
              await fetchMessages(messagesPagination.page, true);
              setSelectedMessage(null);
            }}
            onMessageNavigate={async (messageId: number) => {
              try {
                const response = await messageService.getById(messageId);
                if (response.success && response.data) {
                  setSelectedMessage(response.data);
                  setSearchParams({ id: messageId.toString() });
                }
              } catch (error) {
                logger.error('Failed to navigate to message:', error);
              }
            }}
          />
        </Drawer>
      )}

      {selectedSpamLog && (
        <Drawer
          open={!!selectedSpamLog}
          onClose={() => setSelectedSpamLog(null)}
          title="Spam Log Details"
        >
          <SpamLogDetail log={selectedSpamLog} onClose={() => setSelectedSpamLog(null)} />
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
