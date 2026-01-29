import { useEffect, useState, useCallback, useRef } from 'react';
import { Mail, RefreshCw, ShieldAlert } from 'lucide-react';
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
import {
  spamLogService,
  type SpamLog,
  type SpamLogFilters as SpamFiltersType,
} from '@/services/spamLog.service';
import { useAuthStore } from '@/stores/authStore';
import { useMessagesStore } from '@/stores/messagesStore';
import type { Message } from '@/types';
import { Permission } from '@/types/roles';
import { MessageFilters } from '@/components/messages/MessageFilters';
import { MessageListItem } from '@/components/messages/MessageListItem';
import { MessageDetail } from '@/components/messages/MessageDetail';
import { SpamLogFilters as SpamFiltersComponent } from '@/components/spam/SpamLogFilters';
import { SpamLogListItem } from '@/components/spam/SpamLogListItem';
import { SpamLogDetail } from '@/components/spam/SpamLogDetail';
import { Tabs, type Tab } from '@/components/ui/Tabs';

export const MessagesPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'messages' | 'spam'>('messages');
  const [loading, setLoading] = useState(true); // Start with loading true for initial fetch
  const [refreshing, setRefreshing] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [messageToDelete, setMessageToDelete] = useState<Message | null>(null);
  const [deleting, setDeleting] = useState(false);
  const urlSyncedRef = useRef(false); // Track if URL params were synced

  // Spam log state
  const [spamLogs, setSpamLogs] = useState<SpamLog[]>([]);
  const [selectedSpamLog, setSelectedSpamLog] = useState<SpamLog | null>(null);
  const [spamFilters, setSpamFilters] = useState<SpamFiltersType>({});
  const [pendingSpamSearch, setPendingSpamSearch] = useState('');

  // Alert dialog state
  const [alertDialog, setAlertDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    variant: 'success' | 'error' | 'warning' | 'info';
  }>({ open: false, title: '', description: '', variant: 'info' });
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);

  // Zustand stores
  const token = useAuthStore((state) => state.token);
  const filters = useMessagesStore((state) => state.filters);
  const sorting = useMessagesStore((state) => state.sorting);
  const setMessages = useMessagesStore((state) => state.setMessages);
  const setFilters = useMessagesStore((state) => state.setFilters);
  const updatePrimaryFilter = useMessagesStore((state) => state.updatePrimaryFilter);
  const updateSecondaryFilter = useMessagesStore((state) => state.updateSecondaryFilter);
  const setSorting = useMessagesStore((state) => state.setSorting);
  const clearFiltersStore = useMessagesStore((state) => state.clearFilters);
  const clearCache = useMessagesStore((state) => state.clearCache);
  const getCached = useMessagesStore((state) => state.getCached);

  // Local state for current view
  const [messages, setMessagesLocal] = useState<Message[]>([]);
  const [pagination, setPaginationLocal] = useState({
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 0,
    hasMore: false,
  });
  const [pendingSearch, setPendingSearch] = useState(filters.search ?? '');
  const fetchingRef = useRef(false); // Track if fetch is in progress

  const fetchMessages = useCallback(
    async (page = 1, force = false) => {
      // Check cache first
      if (!force) {
        const cached = getCached(page);
        if (cached) {
          setMessagesLocal(cached.messages);
          setPaginationLocal(cached.pagination);
          setLoading(false); // ← FIX: Set loading to false on cache hit
          return;
        }
      }

      // Prevent duplicate simultaneous calls (e.g., from React StrictMode)
      if (fetchingRef.current && !force) {
        return;
      }

      fetchingRef.current = true;
      setLoading(true);
      try {
        // Build API filters
        const apiFilters: Record<string, string> = {};
        // ⚠️ CRITICAL: Read filters fresh from store, not from closure!
        const currentFilters = useMessagesStore.getState().filters;

        if (currentFilters.processed !== 'all') {
          apiFilters.processed = currentFilters.processed ?? 'false';
        }
        if (currentFilters.channel !== 'all') {
          apiFilters.channel = currentFilters.channel ?? '';
        }
        if (currentFilters.messageSourceId && currentFilters.messageSourceId !== 'all') {
          apiFilters.messageSourceId = currentFilters.messageSourceId;
        }
        // Add metadata-based filters
        if (currentFilters.showSpam) {
          apiFilters.showSpam = 'true';
        }
        if (currentFilters.showSuspicious) {
          apiFilters.showSuspicious = 'true';
        }
        if (currentFilters.excludeSpam) {
          apiFilters.excludeSpam = 'true';
        }
        if (currentFilters.showWorthy) {
          apiFilters.showWorthy = 'true';
        }
        if (currentFilters.showNeedsInfo) {
          apiFilters.showNeedsInfo = 'true';
        }
        if (currentFilters.hasAttachments) {
          apiFilters.hasAttachments = 'true';
        }
        if (currentFilters.hasReplies) {
          apiFilters.hasReplies = 'true';
        }
        if (currentFilters.hasTicket !== undefined) {
          apiFilters.hasTicket = currentFilters.hasTicket ? 'true' : 'false';
        }
        if (currentFilters.showFailed) {
          apiFilters.showFailed = 'true';
        }
        if (currentFilters.excludeKB) {
          apiFilters.excludeKB = 'true';
        }
        if (currentFilters.awaitingCustomerResponse) {
          apiFilters.awaitingCustomerResponse = 'true';
        }
        if (currentFilters.customerResponded) {
          apiFilters.customerResponded = 'true';
        }
        if (currentFilters.search?.trim()) {
          apiFilters.search = currentFilters.search.trim();
        }

        // Fetch threads instead of individual messages
        const response = await messageService.getThreads(
          Object.keys(apiFilters).length > 0 ? apiFilters : undefined,
          page,
          pagination.limit
        );

        if (response.success && response.data) {
          // Transform threads into Message objects for MessageListItem
          const messagesFromThreads: Message[] = response.data.map((thread) => {
            const baseMessage = thread.latestMessage ?? {
              id: 0,
              content: '',
              sender: thread.sender,
              channel: thread.channel,
              createdAt: thread.lastMessageAt,
              metadata: {},
            };

            // Enhance message with thread metadata
            return {
              ...baseMessage,
              // Add thread info to metadata
              metadata: {
                ...((baseMessage.metadata as Record<string, unknown>) ?? {}),
                isThreadView: true,
                threadId: thread.threadId,
                threadMessageCount: thread.messageCount,
                threadHasUnread: thread.hasUnread,
                threadHasTicket: thread.hasTicket,
                threadIsResolved: thread.isResolved,
              },
            } as Message;
          });

          // Update cache and local state
          setMessages(messagesFromThreads, response.pagination);
          setMessagesLocal(messagesFromThreads);
          setPaginationLocal(response.pagination);

          // If current page exceeds total pages, reset to page 1
          if (page > response.pagination.totalPages && response.pagination.totalPages > 0) {
            await fetchMessages(1);
          }
        }
      } catch (error) {
        console.error('Failed to fetch messages:', error);
      } finally {
        setLoading(false);
        fetchingRef.current = false;
      }
    },
    [getCached, setMessages, pagination.limit]
  );

  const fetchSpamLogs = useCallback(
    async (page = 1, force = false) => {
      if (fetchingRef.current && !force) {
        return;
      }

      fetchingRef.current = true;
      setLoading(true);
      try {
        const response = await spamLogService.getAll(spamFilters, page, pagination.limit);

        if (response.success && response.data) {
          setSpamLogs(response.data);
          setPaginationLocal(response.pagination);

          if (page > response.pagination.totalPages && response.pagination.totalPages > 0) {
            await fetchSpamLogs(1);
          }
        }
      } catch (error) {
        console.error('Failed to fetch spam logs:', error);
      } finally {
        setLoading(false);
        fetchingRef.current = false;
      }
    },
    [spamFilters, pagination.limit]
  );

  // Fetch on mount and when filters or sorting change
  useEffect(() => {
    // Skip initial fetch if URL sync hasn't happened yet
    if (!urlSyncedRef.current) {
      return;
    }

    fetchMessages(1).catch((error) => {
      console.error('Failed to fetch messages:', error);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    filters.processed,
    filters.channel,
    filters.messageSourceId,
    filters.showSpam,
    filters.showSuspicious,
    filters.excludeSpam,
    filters.showWorthy,
    filters.showNeedsInfo,
    filters.hasAttachments,
    filters.hasReplies,
    filters.hasTicket,
    filters.showFailed,
    filters.excludeKB,
    filters.awaitingCustomerResponse,
    filters.customerResponded,
    filters.search,
    sorting.sortOrder,
  ]);

  // Fetch spam logs when spam tab is active
  useEffect(() => {
    if (!urlSyncedRef.current) return;

    if (activeTab === 'spam') {
      fetchSpamLogs(1).catch((error) => {
        console.error('Failed to fetch spam logs:', error);
      });
    }
  }, [activeTab, fetchSpamLogs]);

  // Fetch spam logs when filters change
  useEffect(() => {
    if (!urlSyncedRef.current) return;
    if (activeTab !== 'spam') return;

    fetchSpamLogs(1).catch((error) => {
      console.error('Failed to fetch spam logs:', error);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    spamFilters.channel,
    spamFilters.category,
    spamFilters.departmentRole,
    spamFilters.messageSourceId,
    spamFilters.days,
    spamFilters.search,
    spamFilters.sortOrder,
  ]);

  const handlePageChange = async (page: number) => {
    if (activeTab === 'messages') {
      await fetchMessages(page);
    } else {
      await fetchSpamLogs(page);
    }
  };

  // Sync URL parameters with filters on mount
  useEffect(() => {
    const urlProcessed = searchParams.get('processed');
    const urlChannel = searchParams.get('channel');
    const urlMessageSource = searchParams.get('source');
    const urlSpam = searchParams.get('spam');
    const urlSuspicious = searchParams.get('suspicious');
    const urlExcludeSpam = searchParams.get('excludeSpam');
    const urlExcludeKB = searchParams.get('excludeKB');
    const urlWorthy = searchParams.get('worthy');
    const urlNeedsInfo = searchParams.get('needsInfo');
    const urlAttachments = searchParams.get('attachments');
    const urlReplies = searchParams.get('replies');
    const urlTicket = searchParams.get('ticket');
    const urlFailed = searchParams.get('failed');
    const urlSearch = searchParams.get('search');

    const urlFilters: Partial<typeof filters> = {};
    let hasUrlFilters = false;

    if (urlProcessed && ['all', 'unprocessed', 'processed', 'resolved'].includes(urlProcessed)) {
      urlFilters.processed = urlProcessed as 'all' | 'unprocessed' | 'processed' | 'resolved';
      hasUrlFilters = true;
    }
    if (urlChannel && ['all', 'email', 'telegram', 'slack'].includes(urlChannel)) {
      urlFilters.channel = urlChannel as 'all' | 'email' | 'telegram' | 'slack';
      hasUrlFilters = true;
    }
    if (urlMessageSource) {
      urlFilters.messageSourceId = urlMessageSource;
      hasUrlFilters = true;
    }
    if (urlSpam === 'true') {
      urlFilters.showSpam = true;
      hasUrlFilters = true;
    }
    if (urlSuspicious === 'true') {
      urlFilters.showSuspicious = true;
      hasUrlFilters = true;
    }
    if (urlExcludeSpam === 'true') {
      urlFilters.excludeSpam = true;
      hasUrlFilters = true;
    }
    if (urlExcludeKB === 'true') {
      urlFilters.excludeKB = true;
      hasUrlFilters = true;
    }
    if (urlWorthy === 'true') {
      urlFilters.showWorthy = true;
      hasUrlFilters = true;
    }
    if (urlNeedsInfo === 'true') {
      urlFilters.showNeedsInfo = true;
      hasUrlFilters = true;
    }
    if (urlAttachments === 'true') {
      urlFilters.hasAttachments = true;
      hasUrlFilters = true;
    }
    if (urlReplies === 'true') {
      urlFilters.hasReplies = true;
      hasUrlFilters = true;
    }
    if (urlTicket === 'true' || urlTicket === 'false') {
      urlFilters.hasTicket = urlTicket === 'true';
      hasUrlFilters = true;
    }
    if (urlFailed === 'true') {
      urlFilters.showFailed = true;
      hasUrlFilters = true;
    }
    if (urlSearch) {
      urlFilters.search = urlSearch;
      hasUrlFilters = true;
    }

    // Mark URL sync as complete FIRST to prevent filter effect from running on mount
    urlSyncedRef.current = true;

    // Apply URL filters to store if any exist (triggers filter effect)
    if (hasUrlFilters) {
      setFilters(urlFilters);
    } else {
      // No URL filters - fetch with default filters
      fetchMessages(1).catch((error) => {
        console.error('Failed to fetch messages:', error);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on mount

  // Sync filters to URL whenever they change
  useEffect(() => {
    const params = new URLSearchParams();

    // Preserve message ID if present
    const messageIdParam = searchParams.get('id');
    if (messageIdParam) {
      params.set('id', messageIdParam);
    }

    // Add filters to URL (only non-default values)
    if (filters.processed && filters.processed !== 'all') {
      params.set('processed', filters.processed);
    }
    if (filters.channel && filters.channel !== 'all') {
      params.set('channel', filters.channel);
    }
    if (filters.messageSourceId && filters.messageSourceId !== 'all') {
      params.set('source', filters.messageSourceId);
    }
    if (filters.showSpam) {
      params.set('spam', 'true');
    }
    if (filters.showSuspicious) {
      params.set('suspicious', 'true');
    }
    if (filters.excludeSpam) {
      params.set('excludeSpam', 'true');
    }
    if (filters.showWorthy) {
      params.set('worthy', 'true');
    }
    if (filters.showNeedsInfo) {
      params.set('needsInfo', 'true');
    }
    if (filters.hasAttachments) {
      params.set('attachments', 'true');
    }
    if (filters.hasReplies) {
      params.set('replies', 'true');
    }
    if (filters.hasTicket !== undefined) {
      params.set('ticket', filters.hasTicket.toString());
    }
    if (filters.showFailed) {
      params.set('failed', 'true');
    }
    if (filters.search) {
      params.set('search', filters.search);
    }

    // Update URL without triggering navigation
    setSearchParams(params, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, setSearchParams]); // searchParams intentionally omitted to prevent circular dependency

  // Auto-open message from query param
  useEffect(() => {
    const messageIdParam = searchParams.get('id');
    const paramId = messageIdParam ? parseInt(messageIdParam) : null;

    // Only fetch if URL has an ID and it's different from the currently selected message
    if (paramId && selectedMessage?.id !== paramId) {
      // Fetch the specific message by ID (it might be filtered out)
      const fetchAndOpenMessage = async () => {
        try {
          const response = await messageService.getById(paramId);
          if (response.success && response.data) {
            setSelectedMessage(response.data);
          }
        } catch (error) {
          console.error('Failed to fetch message:', error);
        }
      };
      fetchAndOpenMessage().catch((error) => {
        console.error('Failed to fetch message:', error);
      });
    } else if (!paramId && selectedMessage) {
      // URL cleared but message still selected - clear selection
      setSelectedMessage(null);
    }
  }, [searchParams, selectedMessage]);

  const handleFilterChange = (key: string, value: string | boolean) => {
    // Primary filters: processed, channel, messageSourceId
    const primaryFilters = ['processed', 'channel', 'messageSourceId'];

    if (key === 'search') {
      setPendingSearch(value as string);
      // If clearing search (empty value), immediately apply to show all results
      if (!(value as string).trim()) {
        updateSecondaryFilter('search', '');
      }
    } else if (primaryFilters.includes(key)) {
      // Primary filter change: keeps other primary filters, clears secondary
      updatePrimaryFilter(key as 'processed' | 'channel' | 'messageSourceId', value as string);
    } else {
      // Secondary filter change: keeps all filters
      updateSecondaryFilter(key as keyof typeof filters, value);
    }
  };

  const handleSearch = () => {
    // Trigger actual search when button clicked or Enter pressed
    updateSecondaryFilter('search', pendingSearch);
  };

  const handleSearchBlur = () => {
    // If search is empty on blur, clear the search filter to show all data
    if (!pendingSearch.trim() && filters.search) {
      updateSecondaryFilter('search', '');
    }
  };

  const clearFilters = async () => {
    clearFiltersStore();
    setPendingSearch('');
    await fetchMessages(pagination.page, true); // Keep current page, force refresh
  };

  const handleTabSwitch = (tab: 'messages' | 'spam') => {
    if (tab === 'messages') {
      // Clear spam filters when switching to messages
      setSpamFilters({});
      setPendingSpamSearch('');
    } else {
      // Clear message filters when switching to spam logs
      clearFiltersStore();
      setPendingSearch('');
    }
    setActiveTab(tab);
  };

  const handleApprove = (message: Message) => {
    navigate(`/tickets/create?messageId=${message.id}`);
  };

  const handleResolve = async () => {
    // Refresh the messages list after resolving
    await fetchMessages(pagination.page, true);
    setSelectedMessage(null);
  };

  const handleReject = async (message: Message) => {
    try {
      await messageService.markAsProcessed(message.id);
      clearCache();
      setSelectedMessage(null);
      await fetchMessages(pagination.page, true);
    } catch (error) {
      console.error('Failed to mark message as processed:', error);
    }
  };

  const handleReopen = async (message: Message) => {
    try {
      const reopenedMessageId = message.id;
      await messageService.markAsUnprocessed(message.id);
      clearCache();

      // Refetch the messages list
      await fetchMessages(pagination.page, true);

      // Refetch the specific message to get updated data
      const response = await messageService.getById(reopenedMessageId);
      if (response.success && response.data) {
        setSelectedMessage(response.data);

        // Update URL to include message ID (keeps filters intact)
        const params = new URLSearchParams(searchParams);
        params.set('id', reopenedMessageId.toString());
        setSearchParams(params);
      }
    } catch (error: unknown) {
      console.error('Failed to reopen message:', error);
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

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchMessages(pagination.page, true);
    setRefreshing(false);
  };

  const handleRefreshMessage = async () => {
    if (!selectedMessage) {
      return;
    }
    try {
      // Clear cache to force fresh data
      clearCache();

      // Refresh the detail view
      const response = await messageService.getById(selectedMessage.id);
      if (response.success && response.data) {
        setSelectedMessage(response.data);
      }

      // Refresh the list to show updated assignee
      await fetchMessages(pagination.page, true);
    } catch (error) {
      console.error('Failed to refresh message:', error);
    }
  };

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

      // Wait a bit for emails to be processed, then refresh
      setTimeout(async () => {
        await fetchMessages(1, true);
        setRefreshing(false);
      }, 2000);
    } catch (error) {
      console.error('Failed to sync emails:', error);
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
    if (!messageToDelete) {
      return;
    }

    setDeleting(true);
    try {
      await messageService.delete(messageToDelete.id);
      clearCache();
      setDeleteDialogOpen(false);
      setMessageToDelete(null);
      setSelectedMessage(null);
      await fetchMessages(1, true);
    } catch (error) {
      console.error('Failed to delete message:', error);
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
    ((filters.showSpam ??
    filters.showSuspicious ??
    filters.excludeSpam ??
    filters.showNeedsInfo ??
    filters.showWorthy)
      ? 1
      : 0) +
    (filters.hasAttachments ? 1 : 0) +
    (filters.hasReplies ? 1 : 0) +
    (filters.hasTicket !== undefined ? 1 : 0) +
    (filters.showFailed ? 1 : 0) +
    (filters.awaitingCustomerResponse ? 1 : 0) +
    (filters.customerResponded ? 1 : 0) +
    (filters.search?.trim() ? 1 : 0);

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
            {/* Message Filters */}
            <div className="mb-6">
              <MessageFilters
                filters={filters}
                sorting={sorting}
                pendingSearch={pendingSearch}
                activeFilterCount={activeFilterCount}
                pagination={pagination}
                onFilterChange={handleFilterChange}
                onSearch={handleSearch}
                onSearchBlur={handleSearchBlur}
                onClearFilters={clearFilters}
                onSortingChange={(sortOrder) => setSorting({ sortOrder })}
                setPendingSearch={setPendingSearch}
                setFilters={setFilters}
              />
            </div>

            {loading ? (
              <div className="space-y-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  // Index key is safe: array is immutable (recreated from text split), no reordering
                  // eslint-disable-next-line react/no-array-index-key
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
                      // Check if this is a thread view message
                      const threadMeta = msg.metadata as {
                        isThreadView?: boolean;
                        threadId?: string;
                      };

                      if (threadMeta?.isThreadView && msg.id) {
                        // Fetch all messages in the thread
                        try {
                          const { data: threadMessages } = await messageService.getThreadMessages(
                            msg.id
                          );
                          // Open the first unprocessed message or the latest message
                          if (threadMessages && threadMessages.length > 0) {
                            const messageToShow =
                              threadMessages.find((m) => !m.processed) ?? threadMessages[0];
                            setSelectedMessage(messageToShow);
                            const params = new URLSearchParams(searchParams);
                            params.set('id', messageToShow.id.toString());
                            setSearchParams(params);
                          }
                        } catch (error) {
                          console.error('Failed to fetch thread messages:', error);
                          // Fallback to showing the clicked message
                          setSelectedMessage(msg);
                          const params = new URLSearchParams(searchParams);
                          params.set('id', msg.id.toString());
                          setSearchParams(params);
                        }
                      } else {
                        // Regular message, just open it
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

            {/* Pagination */}
            {!loading && messages.length > 0 && (
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
            {/* Spam Log Filters */}
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
                  // Remove filter if 'all' is selected, value is empty, or days is set to default (30)
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
                  // Remove sortOrder if it's the default ('desc')
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

            {/* Spam Logs List */}
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

            {/* Pagination */}
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

      {/* Message Detail Drawer */}
      {selectedMessage && (
        <Drawer
          open={!!selectedMessage}
          onClose={() => {
            // Remove only the 'id' parameter, keep all filter parameters
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
              // Message stays open after reopening (handleReopen handles this)
            }}
            onDelete={() => {
              handleDeleteClick(selectedMessage);
              setSelectedMessage(null);
            }}
            onResolve={handleResolve}
            onRefresh={handleRefreshMessage}
            onMessageNavigate={async (messageId: number) => {
              try {
                const response = await messageService.getById(messageId);
                if (response.success && response.data) {
                  setSelectedMessage(response.data);
                  setSearchParams({ id: messageId.toString() });
                }
              } catch (error) {
                console.error('Failed to navigate to message:', error);
              }
            }}
          />
        </Drawer>
      )}

      {/* Spam Log Detail Drawer */}
      {selectedSpamLog && (
        <Drawer
          open={!!selectedSpamLog}
          onClose={() => setSelectedSpamLog(null)}
          title="Spam Log Details"
        >
          <SpamLogDetail log={selectedSpamLog} onClose={() => setSelectedSpamLog(null)} />
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
