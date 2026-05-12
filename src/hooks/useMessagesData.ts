import { useState, useCallback, useRef, useEffect } from 'react';
import { logger } from '@/lib/logger';
import type { MutableRefObject, Dispatch, SetStateAction } from 'react';
import { messageService, type MessageThread } from '@/services/message.service';
import { useAuthStore } from '@/stores/authStore';
import { useMessagesStore } from '@/stores/messagesStore';

type MessagesDataReturn = {
  threads: MessageThread[];
  loading: boolean;
  refreshing: boolean;
  setRefreshing: Dispatch<SetStateAction<boolean>>;
  messagesPagination: { page: number; limit: number; total: number; totalPages: number; hasMore: boolean };
  fetchMessages: (page?: number, force?: boolean) => Promise<void>;
  handlePageChange: (page: number) => Promise<void>;
  handleRefresh: () => Promise<void>;
  clearCache: () => void;
};

interface UseMessagesDataProps {
  urlSyncedRef: MutableRefObject<boolean>;
}

const DEFAULT_LIMIT = 50;

export const useMessagesData = ({ urlSyncedRef }: UseMessagesDataProps): MessagesDataReturn => {
  const [threads, setThreadsLocal] = useState<MessageThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [messagesPagination, setMessagesPagination] = useState({
    page: 1,
    limit: DEFAULT_LIMIT,
    total: 0,
    totalPages: 0,
    hasMore: false,
  });
  const messagesFetchingRef = useRef(false);

  const filters = useMessagesStore((state) => state.filters);
  const sorting = useMessagesStore((state) => state.sorting);
  const setMessages = useMessagesStore((state) => state.setMessages);
  const clearCache = useMessagesStore((state) => state.clearCache);
  const getCached = useMessagesStore((state) => state.getCached);

  const fetchMessages = useCallback(
    async (page = 1, force = false) => {
      if (!force) {
        const cached = getCached(page);
        if (cached) {
          setThreadsLocal(cached.threads);
          setMessagesPagination(cached.pagination);
          setLoading(false);
          return;
        }
      }

      if (messagesFetchingRef.current && !force) {
        return;
      }

      messagesFetchingRef.current = true;
      setLoading(true);
      try {
        const apiFilters: Record<string, string> = {};
        const currentFilters = useMessagesStore.getState().filters;

        // SOURCE
        if (currentFilters.messageSourceId && currentFilters.messageSourceId !== 'all') {
          apiFilters.messageSourceId = currentFilters.messageSourceId;
        }

        // THREAD STATUS (lifecycle: open / in_progress / closed)
        const threadStatus = currentFilters.threadStatus ?? 'all';
        if (threadStatus !== 'all') {
          apiFilters.processed = threadStatus;
        }

        // STATUS → view param
        // When threadStatus is active, use view=active (not work_queue) so the status
        // restriction from work_queue doesn't block closed threads
        const status = currentFilters.status ?? 'all';
        if (status === 'all') {
          apiFilters.view = threadStatus !== 'all' ? 'active' : 'work_queue';
        } else if (status === 'active') {
          apiFilters.view = 'active';
        } else if (status === 'awaiting_response') {
          apiFilters.view = 'awaiting_response';
        } else if (status === 'client_replied') {
          apiFilters.view = 'client_replied';
        } else if (status === 'suspicious') {
          apiFilters.view = 'suspicious';
        } else if (status === 'not_analysed') {
          apiFilters.view = 'not_analysed';
        } else if (status === 'spam') {
          apiFilters.showSpam = 'true';
        } else if (status === 'resolved') {
          apiFilters.view = 'resolved';
        }

        // PRIORITY
        if (currentFilters.priority && currentFilters.priority !== 'all') {
          apiFilters.priority = currentFilters.priority;
        }

        // ASSIGNEE
        if (currentFilters.assigneeId && currentFilters.assigneeId !== 'all') {
          apiFilters.assigneeId =
            currentFilters.assigneeId === 'unassigned' ? '0' : currentFilters.assigneeId;
        }

        // AI STATE
        const aiState = currentFilters.aiState ?? 'all';
        if (aiState === 'needs_review') {
          apiFilters.needsHumanReview = 'true';
        } else if (aiState === 'needs_info') {
          apiFilters.showNeedsInfo = 'true';
        } else if (aiState === 'ai_suggested') {
          apiFilters.aiSuggested = 'true';
        } else if (aiState === 'bot_handled') {
          apiFilters.botHandled = 'true';
        } else if (aiState === 'lead') {
          apiFilters.isLead = 'true';
        } else if (aiState === 'contradiction') {
          apiFilters.hasContradiction = 'true';
        }

        // LABEL
        if (currentFilters.labelId && currentFilters.labelId !== 'all') {
          apiFilters.labelId = currentFilters.labelId;
        }

        // LINKED
        const linked = currentFilters.linked ?? 'all';
        if (linked === 'has_ticket') {
          apiFilters.hasTicket = 'true';
        } else if (linked === 'has_jira') {
          apiFilters.hasJiraTicket = 'true';
        }

        if (linked !== 'all' && currentFilters.linkedTicketStatus && currentFilters.linkedTicketStatus !== 'all') {
          apiFilters.linkedTicketStatus = currentFilters.linkedTicketStatus;
        }

        // SLA FILTER
        if (currentFilters.slaFilter === 'breached') {
          apiFilters.slaBreached = 'true';
        } else if (currentFilters.slaFilter === 'at_risk') {
          apiFilters.slaAtRisk = 'true';
        }

        // SEARCH
        if (currentFilters.search?.trim()) {
          apiFilters.search = currentFilters.search.trim();
        }

        // DEPARTMENT (syncs auth store, not sent as API param directly)
        if (currentFilters.departmentRole && currentFilters.departmentRole !== 'all') {
          useAuthStore.getState().setSelectedDepartment(currentFilters.departmentRole);
        }

        const currentSorting = useMessagesStore.getState().sorting;
        const response = await messageService.getThreads(
          Object.keys(apiFilters).length > 0 ? apiFilters : undefined,
          page,
          DEFAULT_LIMIT,
          currentSorting.sortOrder
        );

        if (response.success && response.data) {
          setMessages(response.data, response.pagination);
          setThreadsLocal(response.data);
          setMessagesPagination(response.pagination);

          if (page > 1 && page > response.pagination.totalPages && response.pagination.totalPages > 0) {
            await fetchMessages(1);
          }
        }
      } catch (error) {
        logger.error('Failed to fetch messages:', error);
      } finally {
        setLoading(false);
        messagesFetchingRef.current = false;
      }
    },
    [getCached, setMessages]
  );


  // Fetch on filter/sorting change
  useEffect(() => {
    if (!urlSyncedRef.current) return;

    fetchMessages(1).catch((error) => {
      logger.error('Failed to fetch messages:', error);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    filters.messageSourceId,
    filters.status,
    filters.threadStatus,
    filters.priority,
    filters.assigneeId,
    filters.aiState,
    filters.labelId,
    filters.linked,
    filters.linkedTicketStatus,
    filters.search,
    filters.departmentRole,
    filters.slaFilter,
    sorting.sortOrder,
  ]);

  const handlePageChange = async (page: number) => {
    await fetchMessages(page);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchMessages(messagesPagination.page, true);
    setRefreshing(false);
  };

  return {
    threads,
    loading,
    refreshing,
    setRefreshing,
    messagesPagination,
    fetchMessages,
    handlePageChange,
    handleRefresh,
    clearCache,
  };
};
