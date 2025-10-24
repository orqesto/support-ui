import { useEffect, useState, useCallback } from 'react';
import {
  Mail,
  MessageSquare,
  Send,
  Check,
  X,
  XCircle,
  RefreshCw,
  Trash2,
  Filter,
  ExternalLink,
  RotateCcw,
  Paperclip,
  ShieldX,
  Ticket,
  AlertTriangle,
  Folder,
} from 'lucide-react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { PermissionGuard } from '@/components/auth/PermissionGuard';
import { Layout } from '@/components/layout/Layout';
import { MessageDetail } from '@/components/MessageDetail';
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
import { Drawer } from '@/components/ui/Drawer';
import { ListCard } from '@/components/ui/ListCard';
import { Pagination } from '@/components/ui/Pagination';
import { SearchInput } from '@/components/ui/SearchInput';
import { Select } from '@/components/ui/Select';
import { apiClient } from '@/lib/api-client';
import { formatDate } from '@/lib/utils';
import { messageService } from '@/services/message.service';
import { useAuthStore } from '@/stores/authStore';
import { useMessagesStore } from '@/stores/messagesStore';
import type { Message } from '@/types';
import { Permission } from '@/types/roles';

export const MessagesPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [messageToDelete, setMessageToDelete] = useState<Message | null>(null);
  const [deleting, setDeleting] = useState(false);

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
  const setSorting = useMessagesStore((state) => state.setSorting);
  const clearFiltersStore = useMessagesStore((state) => state.clearFilters);
  const clearCache = useMessagesStore((state) => state.clearCache);
  const getCached = useMessagesStore((state) => state.getCached);

  // Local state for current view
  const [messages, setMessagesLocal] = useState<Message[]>([]);
  const [pagination, setPaginationLocal] = useState({
    page: 1,
    limit: 5,
    total: 0,
    totalPages: 0,
    hasMore: false,
  });
  const [pendingSearch, setPendingSearch] = useState(filters.search ?? '');

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

      setLoading(true);
      try {
        // Build API filters
        const apiFilters: Record<string, string> = {};
        const currentFilters = filters; // Capture current filters

        if (currentFilters.processed !== 'all') {
          apiFilters.processed = currentFilters.processed ?? 'false';
        }
        if (currentFilters.channel !== 'all') {
          apiFilters.channel = currentFilters.channel ?? '';
        }
        // Add metadata-based filters
        if (currentFilters.showSpam) {
          apiFilters.showSpam = 'true';
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
        if (currentFilters.showFailed) {
          apiFilters.showFailed = 'true';
        }
        if (currentFilters.search?.trim()) {
          apiFilters.search = currentFilters.search.trim();
        }

        const response = await messageService.getAll(
          Object.keys(apiFilters).length > 0 ? apiFilters : undefined,
          page,
          pagination.limit,
          sorting.sortOrder
        );

        if (response.success && response.data) {
          // Update cache
          setMessages(response.data, response.pagination);
          // Update local state
          setMessagesLocal(response.data);
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
      }
    },
    [filters, sorting, getCached, setMessages, pagination.limit]
  );

  // Fetch on mount and when filters or sorting change
  useEffect(() => {
    fetchMessages(1).catch((error) => {
      console.error('Failed to fetch messages:', error);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    filters.processed,
    filters.channel,
    filters.showSpam,
    filters.showWorthy,
    filters.showNeedsInfo,
    filters.hasAttachments,
    filters.showFailed,
    filters.search,
    sorting.sortOrder,
  ]);

  const handlePageChange = async (page: number) => {
    await fetchMessages(page);
  };

  // Auto-open message from query param
  useEffect(() => {
    const messageIdParam = searchParams.get('id');
    if (messageIdParam && !selectedMessage) {
      // Fetch the specific message by ID (it might be filtered out)
      const fetchAndOpenMessage = async () => {
        try {
          const response = await messageService.getById(parseInt(messageIdParam));
          if (response.success && response.data) {
            setSelectedMessage(response.data);
            // Clear the query param after opening
            const newParams = new URLSearchParams(searchParams);
            newParams.delete('id');
            setSearchParams(newParams);
          }
        } catch (error) {
          console.error('Failed to fetch message:', error);
        }
      };
      fetchAndOpenMessage().catch((error) => {
        console.error('Failed to fetch message:', error);
      });
    }
  }, [searchParams, selectedMessage, setSearchParams]);

  const handleFilterChange = (key: string, value: string) => {
    if (key === 'search') {
      // Don't trigger auto-fetch for search, just update local state
      setPendingSearch(value);
    } else {
      setFilters({ ...filters, [key]: value });
    }
  };

  const handleSearch = () => {
    // Trigger actual search when button clicked or Enter pressed
    setFilters({ ...filters, search: pendingSearch });
  };

  const handleSearchBlur = () => {
    // If search is empty on blur, clear the search filter to show all data
    if (!pendingSearch.trim() && filters.search) {
      setFilters({ ...filters, search: '' });
    }
  };

  const clearFilters = async () => {
    clearFiltersStore();
    setPendingSearch('');
    await fetchMessages(pagination.page, true); // Keep current page, force refresh
  };

  const handleApprove = (message: Message) => {
    navigate(`/tickets/create?messageId=${message.id}`);
  };

  const handleReject = async (message: Message) => {
    try {
      await messageService.markAsProcessed(message.id);
      clearCache(); // Clear all cached data
      setSelectedMessage(null); // Close the drawer
      await fetchMessages(pagination.page, true); // Keep current page, force refresh
    } catch (error) {
      console.error('Failed to mark message as processed:', error);
    }
  };

  const handleReopen = async (message: Message) => {
    try {
      await messageService.markAsUnprocessed(message.id);
      clearCache(); // Clear all cached data
      setSelectedMessage(null); // Close the drawer
      await fetchMessages(pagination.page, true); // Keep current page, force refresh
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
    await fetchMessages(pagination.page, true); // Keep current page, force refresh
    setRefreshing(false);
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
      clearCache(); // Clear all cached data
      setDeleteDialogOpen(false);
      setMessageToDelete(null);
      setSelectedMessage(null); // Close the drawer
      await fetchMessages(1, true); // Force refresh
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

  const getChannelIcon = (channel: string) => {
    switch (channel) {
      case 'email':
        return <Mail className="w-4 h-4" />;
      case 'slack':
      case 'telegram':
        return <MessageSquare className="w-4 h-4" />;
      default:
        return <Send className="w-4 h-4" />;
    }
  };

  const activeFilterCount =
    (filters.processed !== 'false' ? 1 : 0) +
    (filters.channel !== 'all' ? 1 : 0) +
    ((filters.showSpam ?? filters.showNeedsInfo ?? filters.showWorthy) ? 1 : 0) +
    (filters.hasAttachments ? 1 : 0) +
    (filters.showFailed ? 1 : 0) +
    (filters.search?.trim() ? 1 : 0);

  return (
    <Layout>
      <div className="mx-auto space-y-4 max-w-7xl">
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

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="space-y-3">
              {/* Header */}
              <div className="flex flex-wrap gap-2 justify-between items-center min-h-[32px]">
                <div className="flex flex-wrap gap-2 items-center">
                  <div className="flex gap-2 items-center">
                    <Filter className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Filters</span>
                    <Badge variant="default" className="text-xs">
                      {activeFilterCount}
                    </Badge>
                  </div>
                  {pagination.total > 0 && (
                    <span className="text-xs whitespace-nowrap text-muted-foreground">
                      {(pagination.page - 1) * pagination.limit + 1}-
                      {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
                      {pagination.total}
                    </span>
                  )}
                </div>
                {activeFilterCount > 0 && (
                  <Button variant="ghost" size="sm" onClick={clearFilters} className="shrink-0">
                    <X className="mr-1 w-3 h-3" />
                    Clear
                  </Button>
                )}
              </div>

              {/* Filter Controls */}
              <div className="flex flex-wrap gap-3 items-center">
                {/* Search Input */}
                <SearchInput
                  value={pendingSearch}
                  onChange={(value) => handleFilterChange('search', value)}
                  onSearch={handleSearch}
                  onBlur={handleSearchBlur}
                  showSearchButton={true}
                  placeholder="Search by ID, email, subject, content..."
                  className="w-[300px]"
                  size="sm"
                />

                {/* Group 1: Status */}
                <div className="flex gap-2 items-center">
                  <span className="text-xs font-medium whitespace-nowrap text-muted-foreground">
                    Status:
                  </span>
                  <div className="inline-flex rounded-md shadow-sm">
                    <Button
                      variant={filters.processed === 'false' ? 'primary' : 'outline'}
                      size="sm"
                      onClick={() => handleFilterChange('processed', 'false')}
                      className="h-8 text-xs rounded-l-md rounded-r-none border-r-0"
                    >
                      Unprocessed
                    </Button>
                    <Button
                      variant={filters.processed === 'true' ? 'primary' : 'outline'}
                      size="sm"
                      onClick={() => handleFilterChange('processed', 'true')}
                      className="h-8 text-xs rounded-none border-r-0"
                    >
                      Processed
                    </Button>
                    <Button
                      variant={filters.processed === 'all' ? 'primary' : 'outline'}
                      size="sm"
                      onClick={() => handleFilterChange('processed', 'all')}
                      className="h-8 text-xs rounded-r-md rounded-l-none"
                    >
                      All
                    </Button>
                  </div>
                </div>

                {/* Group 2: Channel */}
                <div className="flex gap-2 items-center">
                  <span className="text-xs font-medium whitespace-nowrap text-muted-foreground">
                    Channel:
                  </span>
                  <Select
                    value={filters.channel}
                    onChange={(e) => handleFilterChange('channel', e.target.value)}
                    className="px-2 py-1 pr-8 h-8 text-xs"
                    aria-label="Filter by channel"
                  >
                    <option value="all">All</option>
                    <option value="email">Email</option>
                    <option value="telegram">Telegram</option>
                    <option value="slack">Slack</option>
                  </Select>
                </div>

                {/* Group 3: AI Filter */}
                <div className="flex gap-2 items-center">
                  <span className="text-xs font-medium whitespace-nowrap text-muted-foreground">
                    AI Filter:
                  </span>
                  <Select
                    value={
                      filters.showSpam
                        ? 'spam'
                        : filters.showWorthy
                          ? 'worthy'
                          : filters.showNeedsInfo
                            ? 'needsInfo'
                            : 'none'
                    }
                    onChange={(e) => {
                      const value = e.target.value;
                      setFilters({
                        ...filters,
                        showSpam: value === 'spam',
                        showWorthy: value === 'worthy',
                        showNeedsInfo: value === 'needsInfo',
                      });
                    }}
                    className="px-2 py-1 pr-8 h-8 text-xs compact"
                    aria-label="Filter by AI analysis"
                  >
                    <option value="none">None</option>
                    <option value="spam">Spam</option>
                    <option value="worthy">Ticket Worthy</option>
                    <option value="needsInfo">Needs Info</option>
                  </Select>
                </div>

                {/* Group 4a: Has Attachments */}
                <label className="flex gap-2 items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filters.hasAttachments ?? false}
                    onChange={(e) => setFilters({ ...filters, hasAttachments: e.target.checked })}
                    className="w-4 h-4 rounded text-primary border-border focus:ring-2 focus:ring-primary"
                  />
                  <div className="flex gap-1 items-center text-xs font-medium whitespace-nowrap">
                    <Paperclip className="w-3 h-3" />
                    <span>Has Attachments</span>
                  </div>
                </label>
                {/* Group 4b: Failed Processing */}
                <label className="flex gap-2 items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filters.showFailed ?? false}
                    onChange={(e) => setFilters({ ...filters, showFailed: e.target.checked })}
                    className="w-4 h-4 rounded text-primary border-border focus:ring-2 focus:ring-primary"
                  />
                  <div className="flex gap-1 items-center text-xs font-medium whitespace-nowrap text-red-600 dark:text-red-400">
                    <XCircle className="w-3 h-3" />
                    <span>Failed Processing</span>
                  </div>
                </label>
                {/* Group 5: Sorting */}
                <div className="flex gap-2 items-center">
                  <span className="text-xs font-medium whitespace-nowrap text-muted-foreground">
                    Order:
                  </span>
                  <Select
                    value={sorting.sortOrder}
                    onChange={(e) => setSorting({ sortOrder: e.target.value as 'asc' | 'desc' })}
                    className="px-2 py-1 pr-8 h-8 text-xs"
                    aria-label="Sort order"
                  >
                    <option value="desc">Newest First</option>
                    <option value="asc">Oldest First</option>
                  </Select>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {loading ? (
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
                {activeFilterCount > 0 ? 'No messages match your filters' : 'No messages available'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {messages.map((message) => {
              const analysis = message.metadata?.analysis as
                | {
                    isTicketWorthy?: boolean;
                    needsMoreInfo?: boolean;
                    suggestedPriority?: string;
                    suggestedCategory?: string;
                    confidence?: number;
                  }
                | undefined;

              const spamCheck = message.metadata?.spamCheck as
                | {
                    isSpam?: boolean;
                    category?: string;
                  }
                | undefined;

              // Get category display name (handle both ID and name formats)
              const getCategoryDisplay = (suggestedCat?: string) => {
                if (!suggestedCat) {
                  return null;
                }
                // If it's a numeric ID, just show "Category #X", otherwise show the name
                if (/^\d+$/.test(suggestedCat)) {
                  return `Category #${suggestedCat}`;
                }
                // If it contains letters, it's likely a name - show it directly
                return suggestedCat;
              };

              // Check if message has attachments
              const hasAttachments =
                message.rawData?.attachments &&
                Array.isArray(message.rawData.attachments) &&
                message.rawData.attachments.length > 0;

              return (
                <ListCard
                  key={message.id}
                  header={
                    <>
                      {getChannelIcon(message.channel)}
                      <Badge variant="secondary">{message.channel}</Badge>
                      {message.processed && <Badge variant="success">Processed</Badge>}
                      {message.processingError && (
                        <Badge variant="danger" title={message.processingError} className="flex gap-1 items-center">
                          <XCircle className="w-3 h-3" />
                          Failed
                        </Badge>
                      )}
                      {hasAttachments && (
                        <Badge
                          variant="default"
                          title={`${(message.rawData?.attachments as unknown[])?.length || 0} attachment(s)`}
                          className="flex gap-1 items-center"
                        >
                          <Paperclip className="w-3 h-3" />
                          {(message.rawData?.attachments as unknown[])?.length || 0}
                        </Badge>
                      )}

                      {/* AI Analysis Badges */}
                      {spamCheck?.isSpam === true && (
                        <Badge variant="danger" title={spamCheck.category} className="flex gap-1 items-center">
                          <ShieldX className="w-3 h-3" />
                          Spam
                        </Badge>
                      )}
                      {!spamCheck?.isSpam && analysis?.isTicketWorthy && (
                        <Badge
                          variant="default"
                          title={`Confidence: ${Math.round((analysis.confidence ?? 0) * 100)}%`}
                          className="flex gap-1 items-center"
                        >
                          <Ticket className="w-3 h-3" />
                          Ticket Worthy
                        </Badge>
                      )}
                      {analysis?.needsMoreInfo && (
                        <Badge variant="warning" className="flex gap-1 items-center">
                          <AlertTriangle className="w-3 h-3" />
                          Needs Info
                        </Badge>
                      )}
                      {analysis?.suggestedPriority && (
                        <Badge
                          variant={
                            analysis.suggestedPriority === 'critical'
                              ? 'danger'
                              : analysis.suggestedPriority === 'high'
                                ? 'warning'
                                : 'default'
                          }
                          title="AI Suggested Priority"
                        >
                          Priority: {analysis.suggestedPriority}
                        </Badge>
                      )}
                      {analysis?.suggestedCategory &&
                        getCategoryDisplay(analysis.suggestedCategory) && (
                          <Badge variant="secondary" title="AI Suggested Category" className="flex gap-1 items-center">
                            <Folder className="w-3 h-3" />
                            {getCategoryDisplay(analysis.suggestedCategory)}
                          </Badge>
                        )}
                    </>
                  }
                  content={
                    <>
                      <div className="space-y-1">
                        <p className="text-sm font-semibold break-all">{message.sender}</p>
                        {message.subject && (
                          <p className="text-xs break-all text-muted-foreground">
                            Subject: {message.subject}
                          </p>
                        )}
                      </div>
                      <p className="text-sm break-all text-muted-foreground line-clamp-2">
                        {message.content}
                      </p>
                    </>
                  }
                  metadata={
                    <>
                      <span className="font-mono text-xs">ID: {message.id}</span>
                      <span className="break-all">• From: {message.sender}</span>
                      {message.channel && <span>• {message.channel}</span>}
                      {hasAttachments && (
                        <span className="flex gap-1 items-center">
                          • <Paperclip className="w-3 h-3" />
                          {(message.rawData?.attachments as unknown[])?.length || 0} file(s)
                        </span>
                      )}
                      {message.processingError && (
                        <span className="text-red-600 dark:text-red-400 font-medium" title="Processing Error">
                          • Error: {message.processingError}
                        </span>
                      )}
                      <span
                        className="whitespace-nowrap"
                        title={`Imported: ${formatDate(message.createdAt)}`}
                      >
                        •{' '}
                        {formatDate(
                          (message.metadata as { receivedAt?: string })?.receivedAt ??
                            message.createdAt
                        )}
                      </span>
                    </>
                  }
                  actions={
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setSelectedMessage(message)}
                      >
                        <ExternalLink className="mr-1 w-3 h-3" />
                        Open
                      </Button>
                      <PermissionGuard permission={Permission.PROCESS_MESSAGES}>
                        {!message.processed ? (
                          <>
                            <Button size="sm" onClick={() => handleApprove(message)}>
                              <Check className="mr-1 w-3 h-3" />
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleReject(message)}
                            >
                              <X className="mr-1 w-3 h-3" />
                              Reject
                            </Button>
                          </>
                        ) : (
                          !message.ticketId && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleReopen(message)}
                            >
                              <RotateCcw className="mr-1 w-3 h-3" />
                              Reopen
                            </Button>
                          )
                        )}
                      </PermissionGuard>
                      <PermissionGuard
                        permissions={[Permission.DELETE_MESSAGES, Permission.MANAGE_ORGANIZATION]}
                      >
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleDeleteClick(message)}
                        >
                          <Trash2 className="mr-1 w-3 h-3" />
                          Delete
                        </Button>
                      </PermissionGuard>
                    </>
                  }
                />
              );
            })}
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
      </div>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogHeader>
          <DialogTitle>Delete Message</DialogTitle>
          <DialogClose onClose={() => setDeleteDialogOpen(false)} />
        </DialogHeader>
        <DialogContent>
          <p>Are you sure you want to delete this message? This action cannot be undone.</p>
          {messageToDelete && (
            <div className="p-4 mt-4 bg-gray-50 rounded">
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
          onClose={() => setSelectedMessage(null)}
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
              setSelectedMessage(null);
            }}
            onDelete={() => {
              handleDeleteClick(selectedMessage);
              setSelectedMessage(null);
            }}
          />
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
