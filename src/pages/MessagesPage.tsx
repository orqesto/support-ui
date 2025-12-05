import { useEffect, useState, useCallback, useRef } from 'react';
import { Mail, RefreshCw, ShieldX } from 'lucide-react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { PermissionGuard } from '@/components/auth/PermissionGuard';
import { SpamLogListItem } from '@/components/SpamLogListItem';
import { SpamFilters } from '@/components/SpamFilters';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { Dialog, DialogHeader, DialogTitle, DialogClose, DialogContent, DialogFooter, } from '@/components/ui/Dialog';
import { Drawer } from '@/components/ui/Drawer';
import { Pagination } from '@/components/ui/Pagination';
import { apiClient } from '@/lib/api-client';
import { SpamLogDetail } from '@/pages/SpamLogDetail';
import { messageService } from '@/services/message.service';
import { spamLogService, type SpamLog, type SpamLogFilters } from '@/services/spamLog.service';
import { useAuthStore } from '@/stores/authStore';
import { useMessagesStore } from '@/stores/messagesStore';
import type { Message } from '@/types';
import { Permission } from '@/types/roles';
import { MessageFilters } from '@/components/messages/MessageFilters';
import { MessageListItem } from '@/components/messages/MessageListItem';
import { MessageDetail } from '@/components/messages/MessageDetail';
import { Layout } from '@/components/layout/Layout';

type TabType = 'messages' | 'spam';

export const MessagesPage = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [refreshing, setRefreshing] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [messageToDelete, setMessageToDelete] = useState<Message | null>(null);
  const [deleting, setDeleting] = useState(false);
  const urlSyncedRef = useRef(false);
  
  const getTabFromUrl = useCallback(() => {
    const tab = searchParams.get('tab') as TabType;
    if (!tab) return 'messages';
    return tab === 'messages' || tab === 'spam' ? tab : 'messages';
  }, [searchParams]);

  const [activeTab, setActiveTab] = useState<TabType>(getTabFromUrl);
  const [loading, setLoading] = useState(false);
  const [spamLogs, setSpamLogs] = useState<SpamLog[]>([]);
  const [selectedSpamLog, setSelectedSpamLog] = useState<SpamLog | null>(null);
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);

  // Alert dialog state
  const [alertDialog, setAlertDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    variant: 'success' | 'error' | 'warning' | 'info';
  }>({ open: false, title: '', description: '', variant: 'info' });

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
  const [spamLogFilters, setSpamLogFilters] = useState<SpamLogFilters>({
    status: 'all',
    category: 'all',
    channel: 'all',
    sortOrder: 'desc',
  });
  const [pendingSpamSearch, setPendingSpamSearch] = useState('');
  const fetchingRef = useRef(false);

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
    (filters.awaitingCustomerResponse ? 1 : 0) +
    (filters.search?.trim() ? 1 : 0);

  // Calculate active spam log filter count
  const activeSpamFilterCount =
    (spamLogFilters.status && spamLogFilters.status !== 'all' ? 1 : 0) +
    (spamLogFilters.category && spamLogFilters.category !== 'all' ? 1 : 0) +
    (spamLogFilters.channel && spamLogFilters.channel !== 'all' ? 1 : 0) +
    (spamLogFilters.minScore !== undefined || spamLogFilters.maxScore !== undefined ? 1 : 0) +
    (pendingSpamSearch?.trim() ? 1 : 0);

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    const newParams = new URLSearchParams(searchParams);
    newParams.set('tab', tab);
    setSearchParams(newParams);
  };

  const handleSpamFilterChange = (key: string, value: string | boolean) => {
    if (key === 'search') {
      setPendingSpamSearch(value as string);
    } else {
      setSpamLogFilters({ ...spamLogFilters, [key]: value });
    }
  };

  const handleSpamSearch = () => {
    void fetchSpamLogs(1, true);
  };

  const handleSpamSearchBlur = () => {
    if (!pendingSpamSearch.trim() && spamLogFilters.search) {
      setSpamLogFilters({ ...spamLogFilters, search: undefined });
    }
  };

  const clearSpamFilters = async () => {
    setSpamLogFilters({
      status: 'all',
      category: 'all',
      channel: 'all',
      sortOrder: 'desc',
    });
    setPendingSpamSearch('');
    await fetchSpamLogs(1, true);
  };

  const fetchSpamLogs = useCallback(async (page = 1, force = false) => {
    if (fetchingRef.current && !force) return;
    
    fetchingRef.current = true;
    setLoading(true);
    
    try {
      const apiFilters: SpamLogFilters = {
        sortOrder: spamLogFilters.sortOrder,
      };
      if (spamLogFilters.sortBy) {
        apiFilters.sortBy = spamLogFilters.sortBy;
      }
      
      if (spamLogFilters.status && spamLogFilters.status !== 'all') {
        apiFilters.status = spamLogFilters.status;
      }
      
      if (spamLogFilters.category && spamLogFilters.category !== 'all') {
        apiFilters.category = spamLogFilters.category;
      }
      
      if (spamLogFilters.channel && spamLogFilters.channel !== 'all') {
        apiFilters.channel = spamLogFilters.channel;
      }
      
      if (pendingSpamSearch?.trim()) {
        apiFilters.search = pendingSpamSearch.trim();
      }
      
      if (spamLogFilters.minScore !== undefined) {
        apiFilters.minScore = spamLogFilters.minScore;
      }
      
      if (spamLogFilters.maxScore !== undefined) {
        apiFilters.maxScore = spamLogFilters.maxScore;
      }
      
      if (spamLogFilters.minConfidence !== undefined) {
        apiFilters.minConfidence = spamLogFilters.minConfidence;
      }
      
      if (spamLogFilters.maxConfidence !== undefined) {
        apiFilters.maxConfidence = spamLogFilters.maxConfidence;
      }
      
      if (spamLogFilters.startDate) {
        apiFilters.startDate = spamLogFilters.startDate;
      }
      
      if (spamLogFilters.endDate) {
        apiFilters.endDate = spamLogFilters.endDate;
      }
      
      const response = await spamLogService.getAll(apiFilters, page, pagination.limit, spamLogFilters.sortOrder);
      
      if (response.success && response.data) {
        // Client-side filtering for severity and confidence
        let filteredData = response.data;
        
        // Filter by severity range
        if (spamLogFilters.minScore !== undefined || spamLogFilters.maxScore !== undefined) {
          filteredData = filteredData.filter(log => {
            const sev = log.severity ?? 0;
            const min = spamLogFilters.minScore ?? 0;
            const max = spamLogFilters.maxScore ?? 300;
            return sev >= min && sev <= max;
          });
        }
        
        // Filter by confidence range
        if (spamLogFilters.minConfidence !== undefined || spamLogFilters.maxConfidence !== undefined) {
          filteredData = filteredData.filter(log => {
            const conf = log.confidence ?? 0;
            const min = spamLogFilters.minConfidence ?? 0;
            const max = spamLogFilters.maxConfidence ?? 1;
            return conf >= min && conf <= max;
          });
        }
        
        // Filter by date range
        if (spamLogFilters.startDate || spamLogFilters.endDate) {
          filteredData = filteredData.filter(log => {
            const logDate = new Date(log.detectedAt).getTime();
            const start = spamLogFilters.startDate ? new Date(spamLogFilters.startDate).getTime() : 0;
            const end = spamLogFilters.endDate ? new Date(spamLogFilters.endDate).setHours(23, 59, 59, 999) : Infinity;
            return logDate >= start && logDate <= end;
          });
        }
        
        const sortSpamLogs = (logs: SpamLog[], order?: 'asc' | 'desc', sortBy?: string) => {
          const copy = [...logs];
          if (sortBy === 'severity') {
            return copy.sort((a, b) => {
              const va = a.severity ?? 0;
              const vb = b.severity ?? 0;
              return order === 'asc' ? va - vb : vb - va;
            });
          }
          if (sortBy === 'confidence') {
            return copy.sort((a, b) => {
              const va = a.confidence ?? 0;
              const vb = b.confidence ?? 0;
              return order === 'asc' ? va - vb : vb - va;
            });
          }
          // default: sort by detectedAt
          return copy.sort((a, b) => {
            const ta = new Date(a.detectedAt).getTime();
            const tb = new Date(b.detectedAt).getTime();
            return order === 'asc' ? ta - tb : tb - ta;
          });
        };

        const ordered = sortSpamLogs(filteredData, spamLogFilters.sortOrder, spamLogFilters.sortBy);
        setSpamLogs(ordered);
        setPaginationLocal(response.pagination);
      }
    } catch (error) {
      console.error('Failed to fetch spam logs:', error);
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  }, [spamLogFilters, pendingSpamSearch, pagination.limit, token]);

  // When sort order or sortBy changes client-side, re-order current spamLogs
  useEffect(() => {
    if (!spamLogs || spamLogs.length === 0) return;

    const sorted = [...spamLogs].sort((a, b) => {
      if (spamLogFilters.sortBy === 'severity') {
        const va = a.severity ?? 0;
        const vb = b.severity ?? 0;
        return spamLogFilters.sortOrder === 'asc' ? va - vb : vb - va;
      }
      if (spamLogFilters.sortBy === 'confidence') {
        const va = a.confidence ?? 0;
        const vb = b.confidence ?? 0;
        return spamLogFilters.sortOrder === 'asc' ? va - vb : vb - va;
      }
      const ta = new Date(a.detectedAt).getTime();
      const tb = new Date(b.detectedAt).getTime();
      return spamLogFilters.sortOrder === 'asc' ? ta - tb : tb - ta;
    });

    // Only update state if ordering actually changed to avoid extra renders
    const isSameOrder = sorted.every((s, i) => s.id === spamLogs[i].id);
    if (!isSameOrder) setSpamLogs(sorted);
  }, [spamLogFilters.sortOrder, spamLogFilters.sortBy, spamLogs]);

  const fetchMessages = useCallback(
    async (page = 1, force = false) => {
      if (!force) {
        const cached = getCached(page);
        if (cached) {
          setMessagesLocal(cached.messages);
          setPaginationLocal(cached.pagination);
          setLoading(false); 
          return;
        }
      }

      if (fetchingRef.current && !force) {
        return;
      }

      fetchingRef.current = true;
      setLoading(true);
      try {
        const apiFilters: Record<string, string> = {};
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
        if (currentFilters.search?.trim()) {
          apiFilters.search = currentFilters.search.trim();
        }

        const currentSorting = useMessagesStore.getState().sorting;
        const response = await messageService.getAll(
          Object.keys(apiFilters).length > 0 ? apiFilters : undefined,
          page,
          pagination.limit,
          currentSorting.sortOrder
        );

        if (response.success && response.data) {
          setMessages(response.data, response.pagination);
          setMessagesLocal(response.data);
          setPaginationLocal(response.pagination);

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

  // Load data based on active tab
  useEffect(() => {
    if (!urlSyncedRef.current) return;

    if (activeTab === 'spam') {
      void fetchSpamLogs(1);
    } else {
      void fetchMessages(1);
    }
  }, [activeTab, filters.search, filters.channel, sorting.sortOrder, spamLogFilters, fetchSpamLogs, fetchMessages]);

  const handlePageChange = async (page: number) => {
    if (activeTab === 'spam') {
      await fetchSpamLogs(page);
    } else {
      await fetchMessages(page);
    }
  };

  // Sync URL tab
  useEffect(() => {
    const newTab = getTabFromUrl();
    if (newTab !== activeTab) {
      setActiveTab(newTab);
    }
  }, [searchParams, activeTab, getTabFromUrl]);

  // Sync URL parameters with filters on mount
  useEffect(() => {
    const urlProcessed = searchParams.get('processed');
    const urlChannel = searchParams.get('channel');
    const urlMessageSource = searchParams.get('source');
    const urlSpam = searchParams.get('spam');
    const urlSuspicious = searchParams.get('suspicious');
    const urlExcludeSpam = searchParams.get('excludeSpam');
    const urlWorthy = searchParams.get('worthy');
    const urlNeedsInfo = searchParams.get('needsInfo');
    const urlAttachments = searchParams.get('attachments');
    const urlReplies = searchParams.get('replies');
    const urlTicket = searchParams.get('ticket');
    const urlFailed = searchParams.get('failed');
    const urlSearch = searchParams.get('search');
    const urlTab = searchParams.get('tab');

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

    const tabToLoad = urlTab && (urlTab === 'messages' || urlTab === 'spam') ? urlTab : 'messages';
    
    urlSyncedRef.current = true;
    setActiveTab(tabToLoad);

    if (hasUrlFilters) {
      setFilters(urlFilters);
    }

   
    if (tabToLoad === 'spam') {
      void fetchSpamLogs(1).catch((error) => {
        console.error('Failed to fetch spam logs:', error);
      });
    } else {
      void fetchMessages(1).catch((error) => {
        console.error('Failed to fetch messages:', error);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync filters to URL
  useEffect(() => {
    const params = new URLSearchParams();
    params.set('tab', activeTab);

    const messageIdParam = searchParams.get('id');
    if (messageIdParam) {
      params.set('id', messageIdParam);
    }

    if (filters.processed && filters.processed !== 'all') {
      params.set('processed', filters.processed);
    }

    const currentUrl = searchParams.toString();
    const newUrl = params.toString();
    
    if (currentUrl !== newUrl) {
      setSearchParams(params, { replace: true });
    }
  }, [filters, activeTab, setSearchParams, searchParams]);

  // Auto-open message from query param
  useEffect(() => {
    const messageIdParam = searchParams.get('id');
    const paramId = messageIdParam ? parseInt(messageIdParam) : null;
    const tab = searchParams.get('tab') as TabType;

    if (tab === 'spam' && paramId) {
      // Fetch spam log
      const fetchAndOpenSpamLog = async () => {
        try {
          const response = await spamLogService.getById(paramId);
          if (response.success && response.data) {
            setSelectedSpamLog(response.data);
          }
        } catch (error) {
          console.error('Failed to fetch spam log:', error);
        }
      };
      void fetchAndOpenSpamLog();
    } else if (paramId && (!selectedMessage || selectedMessage.id !== paramId)) {
      // Fetch regular message
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
      void fetchAndOpenMessage();
    } else if (!paramId) {
      setSelectedMessage(null);
      setSelectedSpamLog(null);
    }
  }, [searchParams, selectedMessage]);

  const handleFilterChange = (key: string, value: string | boolean) => {
    const primaryFilters = ['processed', 'channel', 'messageSourceId'];

    if (key === 'search') {
      setPendingSearch(value as string);
      if (!(value as string).trim()) {
        updateSecondaryFilter('search', '');
      }
    } else if (primaryFilters.includes(key)) {
      updatePrimaryFilter(key as 'processed' | 'channel' | 'messageSourceId', value as string);
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
    if (activeTab === 'spam') {
      await fetchSpamLogs(1, true);
    } else {
      await fetchMessages(1, true);
    }
  };

  const handleApprove = (message: Message) => {
    navigate(`/tickets/create?messageId=${message.id}`);
  };

  const handleResolve = async () => {
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

      await fetchMessages(pagination.page, true);

      const response = await messageService.getById(reopenedMessageId);
      if (response.success && response.data) {
        setSelectedMessage(response.data);
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
    if (activeTab === 'spam') {
      await fetchSpamLogs(pagination.page, true);
    } else {
      await fetchMessages(pagination.page, true);
    }
    setRefreshing(false);
  };

  const handleRefreshMessage = async () => {
    if (!selectedMessage) return;
    
    try {
      clearCache();
      const response = await messageService.getById(selectedMessage.id);
      if (response.success && response.data) {
        setSelectedMessage(response.data);
      }
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

      setTimeout(async () => {
        if (activeTab === 'spam') {
          await fetchSpamLogs(1, true);
        } else {
          await fetchMessages(1, true);
        }
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

  const handleDeleteSpamLog = async (_log: SpamLog) => {
    try {
      await spamLogService.cleanup({ maxEntries: 1 });
      setSelectedSpamLog(null);
      await fetchSpamLogs(pagination.page, true);
    } catch (error) {
      console.error('Failed to delete spam log:', error);
    }
  };

  const handleUpdateSpamLogStatus = async (log: SpamLog, status: SpamLog['status'], notes?: string) => {
    try {
      await spamLogService.updateStatus(log.id, status, notes);
      await fetchSpamLogs(pagination.page, true);
      const updated = await spamLogService.getById(log.id);
      if (updated.success && updated.data) {
        setSelectedSpamLog(updated.data);
      }
    } catch (error) {
      console.error('Failed to update spam log status:', error);
    }
  };

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
        <Card>
          <CardContent className="overflow-visible p-0">
            <div className="overflow-visible border-b">
              <div className="flex">
                <button
                  onClick={() => handleTabChange('messages')}
                  className={`flex flex-1 h-auto rounded-none items-center justify-center gap-1 sm:gap-2 px-1 py-2 sm:px-2 sm:py-3 md:px-4 md:py-4 border-b-2 transition-colors min-w-0 ${
                    activeTab === 'messages'
                      ? 'border-primary text-primary bg-primary/10'
                      : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-accent'
                  }`}
                >
                  <span className="text-[10px] hidden sm:block sm:text-xs md:text-sm font-medium truncate">
                    Messages
                  </span>
                </button>
                <button
                  onClick={() => handleTabChange('spam')}
                  className={`flex flex-1 h-auto rounded-none items-center justify-center gap-1 sm:gap-2 px-1 py-2 sm:px-2 sm:py-3 md:px-4 md:py-4 border-b-2 transition-colors min-w-0 ${
                    activeTab === 'spam'
                      ? 'border-primary text-primary bg-primary/10'
                      : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-accent'
                  }`}
                > 
                  <span className="text-[10px] hidden sm:block sm:text-xs md:text-sm font-medium truncate">
                    Spam Detection
                  </span>
                </button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Messages Tab */}
        {activeTab === 'messages' && (
          <> 
            {/* Filters */}
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
                {[1,2,3,4,5].map((id) => (
                  <Card key={`skeleton-${id}`} className="animate-pulse">
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
                {messages.map((message) => (
                  <MessageListItem
                    key={message.id}
                    message={message}
                    onOpen={(msg) => {
                      setSelectedMessage(msg);
                      const params = new URLSearchParams(searchParams);
                      params.set('id', msg.id.toString());
                      params.set('tab', 'messages');
                      setSearchParams(params);
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
        )}

        {/* Spam Tab */}
        {activeTab === 'spam' && (
          <>
            {/* Filters */}
            <div className="mb-6">
              <SpamFilters
                filters={spamLogFilters}
                pendingSearch={pendingSpamSearch}
                activeFilterCount={activeSpamFilterCount}
                detectedAt="detectedAt"
                pagination={pagination}
                onFilterChange={handleSpamFilterChange}
                onSearch={handleSpamSearch}
                onSearchBlur={handleSpamSearchBlur}
                onClearFilters={clearSpamFilters}
                onSortingChange={(sortBy, sortOrder) => setSpamLogFilters({ ...spamLogFilters, sortOrder, sortBy })}
                setPendingSearch={setPendingSpamSearch}
                setFilters={setSpamLogFilters}
              />
            </div>

            {loading ? (
              <div className="space-y-4">
                {[1,2,3,4,5].map((id) => (
                  <Card key={`spam-skeleton-${id}`} className="animate-pulse">
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
                  <ShieldX className="mx-auto mb-4 w-12 h-12 text-muted-foreground" />
                  <h3 className="mb-2 text-lg font-semibold">No spam logs found</h3>
                  <p className="text-muted-foreground">
                    {activeSpamFilterCount > 0 
                      ? 'No spam logs match your filters' 
                      : 'No spam logs available'}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4">
                {spamLogs.map((log) => (
                  <SpamLogListItem
                    key={log.id}
                    log={log}
                    onOpen={(log) => {
                      setSelectedSpamLog(log);
                      const params = new URLSearchParams(searchParams);
                      params.set('id', log.id.toString());
                      params.set('tab', 'spam');
                      setSearchParams(params);
                    }}
                  />
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

      {/* Delete Message Dialog */}
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
          onClose={() => {
            const params = new URLSearchParams(searchParams);
            params.delete('id');
            setSearchParams(params);
            setSelectedSpamLog(null);
          }}
          title="Spam Log Details"
        >
          <SpamLogDetail
            log={selectedSpamLog}
            onUpdateStatus={async (status, notes) => {
              await handleUpdateSpamLogStatus(selectedSpamLog, status, notes);
            }}
            onDelete={async () => {
              await handleDeleteSpamLog(selectedSpamLog);
            }}
            onClose={() => {
              const params = new URLSearchParams(searchParams);
              params.delete('id');
              setSearchParams(params);
              setSelectedSpamLog(null);
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