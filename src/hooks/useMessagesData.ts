import { useState, useCallback, useRef, useEffect } from 'react';
import { assigneeApiParams } from './assigneeApiParams';
import { legacyAiStateParam } from './legacyAiStateParam';
import { negateApiParam } from './negateApiParam';
import { logger } from '@/lib/logger';
import type { MutableRefObject, Dispatch, SetStateAction } from 'react';
import { messageService, type MessageThread } from '@/services/message.service';
import { useMessagesStore } from '@/stores/messagesStore';
import { useDepartmentContextKey } from './useDepartmentContextKey';

type MessagesDataReturn = {
  threads: MessageThread[];
  loading: boolean;
  refreshing: boolean;
  setRefreshing: Dispatch<SetStateAction<boolean>>;
  messagesPagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
  fetchMessages: (page?: number, force?: boolean) => Promise<void>;
  handlePageChange: (page: number) => Promise<void>;
  handleRefresh: () => Promise<void>;
  clearCache: () => void;
};

interface UseMessagesDataProps {
  urlSyncedRef: MutableRefObject<boolean>;
  /**
   * On the kanban board, `lifecycle` / `queue` / `read` are dropped from this query.
   *
   * Each column requests `{ ...shared, ...col.fixedFilters }` and hard-sets its own
   * lifecycle, so those three cannot move a card there. This query still runs — it feeds
   * the header's "1–17 of 17" — and honouring a filter the board ignores made the two
   * disagree: the number said 7 while seventeen cards sat on screen.
   */
  isKanban?: boolean;
}

const DEFAULT_LIMIT = 50;

export const useMessagesData = ({
  urlSyncedRef,
  isKanban = false,
}: UseMessagesDataProps): MessagesDataReturn => {
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
  // After the first successful fetch, subsequent refetches keep the list
  // visible — flipping `loading` would swap the rows for skeleton cards on
  // every filter change, which reads as a blink.
  const hasLoadedRef = useRef(false);

  const filters = useMessagesStore((state) => state.filters);
  const sorting = useMessagesStore((state) => state.sorting);
  const setMessages = useMessagesStore((state) => state.setMessages);
  const clearCache = useMessagesStore((state) => state.clearCache);
  const getCached = useMessagesStore((state) => state.getCached);
  // The checkbox-driven DepartmentSwitcher writes the X-Department-Context CSV
  // header. Subscribing here makes the effect re-run when the user toggles.
  const selectedDeptKey = useDepartmentContextKey();

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
      if (hasLoadedRef.current) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      try {
        const apiFilters: Record<string, string> = {};
        const currentFilters = useMessagesStore.getState().filters;

        // SOURCE
        if (currentFilters.messageSourceId && currentFilters.messageSourceId !== 'all') {
          apiFilters.messageSourceId = currentFilters.messageSourceId;
        }

        // RECEIVED — a bucket or an explicit window. The UI clears one when setting the
        // other, so only one of these three is ever populated; the API would honour both
        // (as an intersection) if they were.
        if (currentFilters.ageRange && currentFilters.ageRange !== 'all') {
          apiFilters.ageRange = currentFilters.ageRange;
        }
        if (currentFilters.receivedFrom) apiFilters.receivedFrom = currentFilters.receivedFrom;
        if (currentFilters.receivedTo) apiFilters.receivedTo = currentFilters.receivedTo;

        if (currentFilters.receivedAt && currentFilters.receivedAt !== 'all') {
          apiFilters.receivedAt = currentFilters.receivedAt;
        }

        // LIFECYCLE + QUEUE (new LIST-view dropdowns) — additive params. The BE
        // handles them independently of view/processed; they're mutually exclusive
        // in the FE (picking one resets the other to 'all'). When either is active
        // it fully defines the row set, so we suppress the legacy status→view and
        // threadStatus→processed derivation below (those two dropdowns are replaced
        // by Status+Queue in the list, and their store fields stay at 'all' there).
        const lifecycle = isKanban ? 'all' : (currentFilters.lifecycle ?? 'all');
        if (lifecycle !== 'all') {
          apiFilters.lifecycle = lifecycle;
        }
        const queue = isKanban ? 'all' : (currentFilters.queue ?? 'all');
        if (queue !== 'all') {
          apiFilters.queue = queue;
        }
        const read = isKanban ? 'all' : (currentFilters.read ?? 'all');
        if (read !== 'all') {
          apiFilters.read = read;
        }
        const lifecycleOrQueueActive = lifecycle !== 'all' || queue !== 'all';

        // THREAD STATUS (kanban lifecycle: open / in_progress / closed)
        const threadStatus = currentFilters.threadStatus ?? 'all';
        if (threadStatus !== 'all' && !lifecycleOrQueueActive) {
          apiFilters.processed = threadStatus;
        }

        // Inbox toolbar checkbox: hide "waiting on customer" so the list shows
        // only items needing agent attention.
        if (currentFilters.excludeAwaitingResponse) {
          apiFilters.excludeAwaitingResponse = 'true';
        }

        // STATUS → view param
        // When threadStatus is active, use view=active (not work_queue) so the status
        // restriction from work_queue doesn't block closed threads.
        // Skipped entirely when a lifecycle/queue filter is driving the list.
        const status = currentFilters.status ?? 'all';
        if (lifecycleOrQueueActive) {
          // lifecycle/queue define the set; leave view/showSpam unset so the BE's
          // base (org/dept) scope + the new params are the only status constraints.
        } else if (status === 'all') {
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

        // DEPARTMENT — 'needs_routing' sentinel overrides the view to the dedicated
        // needs_routing queue (org-wide, ignores user dept membership). A real dept id
        // just narrows the existing view to that dept.
        if (currentFilters.departmentId && currentFilters.departmentId !== 'all') {
          if (currentFilters.departmentId === 'needs_routing') {
            apiFilters.view = 'needs_routing';
            delete apiFilters.processed;
          } else {
            apiFilters.departmentId = currentFilters.departmentId;
          }
        }

        // PRIORITY
        if (currentFilters.priority && currentFilters.priority !== 'all') {
          apiFilters.priority = currentFilters.priority;
        }

        // ASSIGNEE — see assigneeApiParams for why 'me' is not an id.
        Object.assign(apiFilters, assigneeApiParams(currentFilters.assigneeId));

        // NEGATION — only for the filters this query is actually sending. In kanban
        // `lifecycle` and `queue` are dropped above, so their inversions go with them.
        const aiState = currentFilters.aiState ?? 'all';
        const negate = negateApiParam(currentFilters.negate, [
          ...(lifecycle !== 'all' ? ['lifecycle'] : []),
          ...(queue !== 'all' ? ['queue'] : []),
          ...(aiState !== 'all' ? ['aiState'] : []),
        ]);
        if (negate) apiFilters.negate = negate;

        // AI STATE — one param now, not six booleans translated from one control. The
        // booleans still exist server-side for their other callers, but they cannot be
        // negated: `aiSuggested=false` means "do not filter", not "not AI-suggested".
        if (aiState !== 'all') {
          apiFilters.aiState = aiState;
          // Send the legacy boolean alongside it, so the filter still works against a
          // backend that predates `aiState` — the frontend ships from main and can be
          // live before the API is. NEVER when inverted: the boolean is a positive test,
          // and a backend old enough to need it drops the negation, so the two would
          // contradict and match nothing. On a backend that has both, the boolean simply
          // repeats what `aiState` already says.
          if (!negate?.includes('aiState')) {
            Object.assign(apiFilters, legacyAiStateParam(aiState));
          }
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

        if (
          linked !== 'all' &&
          currentFilters.linkedTicketStatus &&
          currentFilters.linkedTicketStatus !== 'all'
        ) {
          apiFilters.linkedTicketStatus = currentFilters.linkedTicketStatus;
        }

        // SLA FILTER — independent flags. BE OR's them when both set.
        if (currentFilters.slaBreached) apiFilters.slaBreached = 'true';
        if (currentFilters.slaAtRisk) apiFilters.slaAtRisk = 'true';

        // ATTACHMENTS — show only convs with at least one attached file.
        if (currentFilters.hasAttachments) apiFilters.hasAttachments = 'true';

        // SEARCH
        if (currentFilters.search?.trim()) {
          apiFilters.search = currentFilters.search.trim();
        }

        const currentSorting = useMessagesStore.getState().sorting;
        const response = await messageService.getThreads(
          Object.keys(apiFilters).length > 0 ? apiFilters : undefined,
          page,
          DEFAULT_LIMIT,
          currentSorting.sortOrder,
          currentSorting.sortBy
        );

        if (response.success && response.data) {
          setMessages(response.data, response.pagination);
          setThreadsLocal(response.data);
          setMessagesPagination(response.pagination);
          hasLoadedRef.current = true;

          if (
            page > 1 &&
            page > response.pagination.totalPages &&
            response.pagination.totalPages > 0
          ) {
            await fetchMessages(1);
          }
        }
      } catch (error) {
        logger.error('Failed to fetch messages:', error);
      } finally {
        setLoading(false);
        setRefreshing(false);
        messagesFetchingRef.current = false;
      }
    },
    [getCached, setMessages, isKanban]
  );

  // Fetch on filter/sorting change — resets to page 1.
  // fetchMessages reads filters/sorting from store directly to avoid stale closure without listing them as deps
  useEffect(() => {
    if (!urlSyncedRef.current) return;
    fetchMessages(1).catch((error) => {
      logger.error('Failed to fetch messages:', error);
    });
  }, [
    filters.messageSourceId,
    filters.departmentId,
    filters.status,
    filters.threadStatus,
    filters.lifecycle,
    filters.queue,
    filters.read,
    filters.priority,
    filters.assigneeId,
    filters.aiState,
    filters.labelId,
    filters.ageRange,
    filters.receivedFrom,
    filters.receivedTo,
    filters.negate,
    filters.linked,
    filters.linkedTicketStatus,
    filters.search,
    filters.slaBreached,
    filters.slaAtRisk,
    filters.hasAttachments,
    filters.excludeAwaitingResponse,
    sorting.sortBy,
    sorting.sortOrder,
    selectedDeptKey,
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
