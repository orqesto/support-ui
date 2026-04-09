import { useState, useCallback, useRef, useEffect } from 'react';
import type { MutableRefObject } from 'react';
import { messageService } from '@/services/message.service';
import {
  spamLogService,
  type SpamLog,
  type SpamLogFilters as SpamFiltersType,
} from '@/services/spamLog.service';
import { useAuthStore } from '@/stores/authStore';
import { useMessagesStore } from '@/stores/messagesStore';
import type { Message } from '@/types';

interface UseMessagesDataProps {
  urlSyncedRef: MutableRefObject<boolean>;
  activeTab: 'messages' | 'spam';
  spamFilters: SpamFiltersType;
}

const DEFAULT_LIMIT = 50;

export const useMessagesData = ({ urlSyncedRef, activeTab, spamFilters }: UseMessagesDataProps) => {
  const [messages, setMessagesLocal] = useState<Message[]>([]);
  const [spamLogs, setSpamLogs] = useState<SpamLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [messagesPagination, setMessagesPagination] = useState({
    page: 1,
    limit: DEFAULT_LIMIT,
    total: 0,
    totalPages: 0,
    hasMore: false,
  });
  const [spamPagination, setSpamPagination] = useState({
    page: 1,
    limit: DEFAULT_LIMIT,
    total: 0,
    totalPages: 0,
    hasMore: false,
  });

  const messagesFetchingRef = useRef(false);
  const spamFetchingRef = useRef(false);

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
          setMessagesLocal(cached.messages);
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

        if (currentFilters.view) {
          apiFilters.view = currentFilters.view;
        }
        if (currentFilters.processed && currentFilters.processed !== 'all') {
          apiFilters.processed = currentFilters.processed;
        }
        if (currentFilters.channel !== 'all') {
          apiFilters.channel = currentFilters.channel ?? '';
        }
        if (currentFilters.messageSourceId && currentFilters.messageSourceId !== 'all') {
          apiFilters.messageSourceId = currentFilters.messageSourceId;
        }
        if (currentFilters.showSpam) apiFilters.showSpam = 'true';
        if (currentFilters.showSuspicious) apiFilters.showSuspicious = 'true';
        if (currentFilters.excludeSpam) apiFilters.excludeSpam = 'true';
        if (currentFilters.showWorthy) apiFilters.showWorthy = 'true';
        if (currentFilters.showNeedsInfo) apiFilters.showNeedsInfo = 'true';
        if (currentFilters.hasAttachments) apiFilters.hasAttachments = 'true';
        if (currentFilters.hasReplies) apiFilters.hasReplies = 'true';
        if (currentFilters.hasTicket !== undefined) {
          apiFilters.hasTicket = currentFilters.hasTicket ? 'true' : 'false';
        }
        if (currentFilters.showFailed) apiFilters.showFailed = 'true';
        if (currentFilters.showKBOnly) apiFilters.showKBOnly = 'true';
        if (currentFilters.excludeKB) apiFilters.excludeKB = 'true';
        if (currentFilters.awaitingCustomerResponse) apiFilters.awaitingCustomerResponse = 'true';
        if (currentFilters.customerResponded) apiFilters.customerResponded = 'true';
        if (currentFilters.assigneeId && currentFilters.assigneeId !== 'all') {
          apiFilters.assigneeId =
            currentFilters.assigneeId === 'unassigned' ? '0' : currentFilters.assigneeId;
        }
        if (currentFilters.needsHumanReview) apiFilters.needsHumanReview = 'true';
        if (currentFilters.isLead) apiFilters.isLead = 'true';
        if (currentFilters.isQualifiedLead) apiFilters.isQualifiedLead = 'true';
        if (currentFilters.ageRange) apiFilters.ageRange = currentFilters.ageRange;
        if (currentFilters.priority && currentFilters.priority !== 'all') {
          apiFilters.priority = currentFilters.priority;
        }
        if (currentFilters.departmentRole && currentFilters.departmentRole !== 'all') {
          useAuthStore.getState().setSelectedDepartment(currentFilters.departmentRole);
        }
        if (currentFilters.labelId && currentFilters.labelId !== 'all') {
          apiFilters.labelId = currentFilters.labelId;
        }
        if (currentFilters.search?.trim()) {
          apiFilters.search = currentFilters.search.trim();
        }

        const currentSorting = useMessagesStore.getState().sorting;
        const response = await messageService.getThreads(
          Object.keys(apiFilters).length > 0 ? apiFilters : undefined,
          page,
          DEFAULT_LIMIT,
          currentSorting.sortOrder
        );

        if (response.success && response.data) {
          const messagesFromThreads: Message[] = response.data.map((thread) => {
            const baseMessage = thread.latestMessage ?? {
              id: 0,
              content: '',
              sender: thread.sender,
              channel: thread.channel,
              createdAt: thread.lastMessageAt,
              metadata: {},
            };

            return {
              ...baseMessage,
              isLead: thread.isLead ?? (baseMessage as Message).isLead,
              metadata: {
                ...((baseMessage.metadata as Record<string, unknown>) ?? {}),
                isThreadView: true,
                threadId: thread.threadId,
                threadMessageCount: thread.messageCount,
                threadHasUnread: thread.hasUnread,
                threadHasTicket: thread.hasTicket,
                threadIsResolved: thread.isResolved,
                lastReplyFromClient: thread.lastReplyFromClient,
              },
            } as Message;
          });

          setMessages(messagesFromThreads, response.pagination);
          setMessagesLocal(messagesFromThreads);
          setMessagesPagination(response.pagination);

          if (page > 1 && page > response.pagination.totalPages && response.pagination.totalPages > 0) {
            await fetchMessages(1);
          }
        }
      } catch (error) {
        console.error('Failed to fetch messages:', error);
      } finally {
        setLoading(false);
        messagesFetchingRef.current = false;
      }
    },
    [getCached, setMessages]
  );

  const fetchSpamLogs = useCallback(
    async (page = 1, force = false) => {
      if (spamFetchingRef.current && !force) {
        return;
      }

      spamFetchingRef.current = true;
      setLoading(true);
      try {
        const response = await spamLogService.getAll(spamFilters, page, DEFAULT_LIMIT);

        if (response.success && response.data) {
          setSpamLogs(response.data);
          setSpamPagination(response.pagination);

          if (page > response.pagination.totalPages && response.pagination.totalPages > 0) {
            await fetchSpamLogs(1);
          }
        }
      } catch (error) {
        console.error('Failed to fetch spam logs:', error);
      } finally {
        setLoading(false);
        spamFetchingRef.current = false;
      }
    },
    [spamFilters]
  );

  // Fetch on filter/sorting change
  useEffect(() => {
    if (!urlSyncedRef.current) return;

    fetchMessages(1).catch((error) => {
      console.error('Failed to fetch messages:', error);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    filters.view,
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
    filters.showKBOnly,
    filters.excludeKB,
    filters.awaitingCustomerResponse,
    filters.customerResponded,
    filters.assigneeId,
    filters.search,
    filters.needsHumanReview,
    filters.isLead,
    filters.isQualifiedLead,
    filters.ageRange,
    filters.priority,
    filters.departmentRole,
    filters.labelId,
    sorting.sortOrder,
  ]);

  // Fetch messages when messages tab becomes active
  useEffect(() => {
    if (!urlSyncedRef.current) return;

    if (activeTab === 'messages') {
      fetchMessages(1).catch((error) => {
        console.error('Failed to fetch messages:', error);
      });
    }
  }, [activeTab, fetchMessages, urlSyncedRef]);

  // Fetch spam logs when spam tab becomes active
  useEffect(() => {
    if (!urlSyncedRef.current) return;

    if (activeTab === 'spam') {
      fetchSpamLogs(1).catch((error) => {
        console.error('Failed to fetch spam logs:', error);
      });
    }
  }, [activeTab, fetchSpamLogs, urlSyncedRef]);

  // Fetch spam logs when spam filters change
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

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchMessages(messagesPagination.page, true);
    setRefreshing(false);
  };

  return {
    messages,
    spamLogs,
    loading,
    refreshing,
    setRefreshing,
    messagesPagination,
    spamPagination,
    fetchMessages,
    fetchSpamLogs,
    handlePageChange,
    handleRefresh,
    clearCache,
  };
};
