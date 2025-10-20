import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { Card, CardContent } from '@/components/ui/Card';
import { ListCard } from '@/components/ui/ListCard';
import { Drawer } from '@/components/ui/Drawer';
import { MessageDetail } from '@/components/MessageDetail';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Pagination } from '@/components/ui/Pagination';
import { messageService } from '@/services/message.service';
import { useMessagesStore } from '@/stores/messagesStore';
import { formatDate } from '@/lib/utils';
import {
  Mail,
  MessageSquare,
  Send,
  Check,
  X,
  RefreshCw,
  Trash2,
  Filter,
  ExternalLink,
  RotateCcw,
  Download,
} from 'lucide-react';
import type { Message } from '@/types';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogClose,
  DialogContent,
  DialogFooter,
} from '@/components/ui/Dialog';

export const MessagesPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [messageToDelete, setMessageToDelete] = useState<Message | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);

  // Zustand store
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
          apiFilters.processed = currentFilters.processed || 'false';
        }
        if (currentFilters.channel !== 'all') {
          apiFilters.channel = currentFilters.channel || '';
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
            fetchMessages(1);
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
    fetchMessages(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    filters.processed,
    filters.channel,
    filters.showSpam,
    filters.showWorthy,
    filters.showNeedsInfo,
    sorting.sortOrder,
  ]);

  const handlePageChange = (page: number) => {
    fetchMessages(page);
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
      fetchAndOpenMessage();
    }
  }, [searchParams, selectedMessage, setSearchParams]);

  const handleFilterChange = (key: string, value: string) => {
    setFilters({ ...filters, [key]: value });
  };

  const clearFilters = () => {
    clearFiltersStore();
    fetchMessages(pagination.page, true); // Keep current page, force refresh
  };

  const handleApprove = (message: Message) => {
    setSelectedMessage(message);
  };

  const handleReject = async (message: Message) => {
    try {
      await messageService.markAsProcessed(message.id);
      clearCache(); // Clear all cached data
      setSelectedMessage(null); // Close the drawer
      fetchMessages(pagination.page, true); // Keep current page, force refresh
    } catch (error) {
      console.error('Failed to mark message as processed:', error);
    }
  };

  const handleReopen = async (message: Message) => {
    try {
      await messageService.markAsUnprocessed(message.id);
      clearCache(); // Clear all cached data
      setSelectedMessage(null); // Close the drawer
      fetchMessages(pagination.page, true); // Keep current page, force refresh
    } catch (error: any) {
      console.error('Failed to reopen message:', error);
      // Show error to user if backend validation fails
      alert(error.response?.data?.error || 'Failed to reopen message');
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchMessages(pagination.page, true); // Keep current page, force refresh
    setRefreshing(false);
  };

  const handleSyncEmails = async () => {
    try {
      setRefreshing(true);
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/messages/check-emails`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      });

      if (response.ok) {
        // Wait a bit for emails to be processed, then refresh
        setTimeout(() => {
          fetchMessages(1, true);
          setRefreshing(false);
        }, 2000);
      } else {
        setRefreshing(false);
        alert('Failed to trigger email sync');
      }
    } catch (error) {
      console.error('Failed to sync emails:', error);
      setRefreshing(false);
      alert('Failed to sync emails');
    }
  };

  const handleBulkImport = async () => {
    const days = prompt('How many days of emails to import? (1-365)', '30');
    if (!days) return;

    const daysNum = parseInt(days);
    if (isNaN(daysNum) || daysNum < 1 || daysNum > 365) {
      alert('Please enter a valid number between 1 and 365');
      return;
    }

    try {
      setRefreshing(true);
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/messages/bulk-import`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({ days: daysNum, maxResults: 500 }),
      });

      if (response.ok) {
        const data = await response.json();
        alert(
          `Bulk import completed!\nTotal: ${data.data?.total || 0}\nProcessed: ${data.data?.processed || 0}\nTickets Created: ${data.data?.ticketsCreated || 0}`
        );
        fetchMessages(1, true);
        setRefreshing(false);
      } else {
        setRefreshing(false);
        alert('Failed to bulk import emails');
      }
    } catch (error) {
      console.error('Failed to bulk import:', error);
      setRefreshing(false);
      alert('Failed to bulk import emails');
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
      clearCache(); // Clear all cached data
      setDeleteDialogOpen(false);
      setMessageToDelete(null);
      setSelectedMessage(null); // Close the drawer
      fetchMessages(1, true); // Force refresh
    } catch (error) {
      console.error('Failed to delete message:', error);
      alert('Failed to delete message');
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
    (filters.showSpam || filters.showNeedsInfo || filters.showWorthy ? 1 : 0);

  return (
    <Layout>
      <div className="space-y-4 w-full">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-2xl font-bold">Messages</h2>
            <p className="text-sm text-muted-foreground">Manage and process incoming messages</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleBulkImport} disabled={refreshing} variant="outline">
              <Download className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              Bulk Import
            </Button>
            <Button onClick={handleSyncEmails} disabled={refreshing} variant="outline">
              <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              Sync New
            </Button>
            <Button onClick={handleRefresh} disabled={refreshing}>
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
                {/* Group 1: Status */}
                <div className="flex gap-2 items-center">
                  <span className="text-xs font-medium whitespace-nowrap text-muted-foreground">
                    Status:
                  </span>
                  <div className="inline-flex rounded-md shadow-sm">
                    <button
                      onClick={() => handleFilterChange('processed', 'false')}
                      className={`px-3 py-1 text-xs font-medium border rounded-l-md transition-colors ${
                        filters.processed === 'false'
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      Unprocessed
                    </button>
                    <button
                      onClick={() => handleFilterChange('processed', 'true')}
                      className={`px-3 py-1 text-xs font-medium border-t border-b transition-colors ${
                        filters.processed === 'true'
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      Processed
                    </button>
                    <button
                      onClick={() => handleFilterChange('processed', 'all')}
                      className={`px-3 py-1 text-xs font-medium border rounded-r-md transition-colors ${
                        filters.processed === 'all'
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      All
                    </button>
                  </div>
                </div>

                {/* Group 2: Channel */}
                <div className="flex gap-2 items-center">
                  <span className="text-xs font-medium whitespace-nowrap text-muted-foreground">
                    Channel:
                  </span>
                  <select
                    value={filters.channel}
                    onChange={(e) => handleFilterChange('channel', e.target.value)}
                    className="px-2 py-1 text-xs rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="all">All</option>
                    <option value="email">Email</option>
                    <option value="telegram">Telegram</option>
                    <option value="slack">Slack</option>
                  </select>
                </div>
                {/* Group 3: AI Filter */}
                <div className="flex gap-2 items-center">
                  <span className="text-xs font-medium whitespace-nowrap text-muted-foreground">
                    AI Filter:
                  </span>
                  <select
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
                    className="px-2 py-1 text-xs rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="none">None</option>
                    <option value="spam">🔴 Spam Only</option>
                    <option value="worthy">🟢 Worthy Only</option>
                    <option value="needsInfo">🟡 Needs Info</option>
                  </select>
                </div>
                {/* Group 4: Sorting */}
                <div className="flex gap-2 items-center">
                  <span className="text-xs font-medium whitespace-nowrap text-muted-foreground">
                    Order:
                  </span>
                  <select
                    value={sorting.sortOrder}
                    onChange={(e) => setSorting({ sortOrder: e.target.value as 'asc' | 'desc' })}
                    className="px-2 py-1 text-xs rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="desc">Newest First</option>
                    <option value="asc">Oldest First</option>
                  </select>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {loading ? (
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <Card key={i} className="animate-pulse">
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
          <div className="grid gap-4 w-full">
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
                if (!suggestedCat) return null;
                // If it's a numeric ID, just show "Category #X", otherwise show the name
                if (/^\d+$/.test(suggestedCat)) {
                  return `Category #${suggestedCat}`;
                }
                // If it contains letters, it's likely a name - show it directly
                return suggestedCat;
              };

              return (
                <ListCard
                  key={message.id}
                  header={
                    <>
                      {getChannelIcon(message.channel)}
                      <Badge variant="secondary">{message.channel}</Badge>
                      {message.processed && <Badge variant="success">Processed</Badge>}

                      {/* AI Analysis Badges */}
                      {spamCheck?.isSpam === true && (
                        <Badge variant="danger" title={spamCheck.category}>
                          🚫 Spam
                        </Badge>
                      )}
                      {!spamCheck?.isSpam && analysis?.isTicketWorthy && (
                        <Badge
                          variant="default"
                          title={`Confidence: ${Math.round((analysis.confidence || 0) * 100)}%`}
                        >
                          🎫 Ticket Worthy
                        </Badge>
                      )}
                      {analysis?.needsMoreInfo && <Badge variant="warning">⚠️ Needs Info</Badge>}
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
                          <Badge variant="secondary" title="AI Suggested Category">
                            📁 {getCategoryDisplay(analysis.suggestedCategory)}
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
                      <span className="break-all">From: {message.sender}</span>
                      {message.channel && <span>• {message.channel}</span>}
                      <span className="whitespace-nowrap">• {formatDate(message.createdAt)}</span>
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
                      {!message.processed ? (
                        <>
                          <Button size="sm" onClick={() => handleApprove(message)}>
                            <Check className="mr-1 w-3 h-3" />
                            Approve
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => handleReject(message)}>
                            <X className="mr-1 w-3 h-3" />
                            Reject
                          </Button>
                        </>
                      ) : (
                        !message.ticketId && (
                          <Button size="sm" variant="outline" onClick={() => handleReopen(message)}>
                            <RotateCcw className="mr-1 w-3 h-3" />
                            Reopen
                          </Button>
                        )
                      )}
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleDeleteClick(message)}
                      >
                        <Trash2 className="mr-1 w-3 h-3" />
                        Delete
                      </Button>
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
            onApprove={() => {
              handleApprove(selectedMessage);
              setSelectedMessage(null);
            }}
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
    </Layout>
  );
};
