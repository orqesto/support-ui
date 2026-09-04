import { useState, useCallback, useRef, useEffect } from 'react';
import { COLUMNS } from '@/components/messages/kanbanColumns';
import { assigneeApiParams } from './assigneeApiParams';
import { legacyAiStateParam } from './legacyAiStateParam';
import { negateApiParam } from './negateApiParam';
import { searchIsTheOnlyFilter } from '@/hooks/searchIsTheOnlyFilter';
import { logger } from '@/lib/logger';
import type { MutableRefObject, Dispatch, SetStateAction } from 'react';
import { messageService, type MessageThread } from '@/services/message.service';
import { messagesCacheKey, useMessagesStore } from '@/stores/messagesStore';
import { useAuthStore } from '@/stores/authStore';
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
  /**
   * The page a fetch asked for while another was in flight, or null.
   *
   * The in-flight guard used to return silently, which is only correct if the two calls
   * would produce the SAME request. They often would not — a filter change and the
   * board→list flip land a beat apart and each changes what gets sent — so the newer,
   * more correct request was the one thrown away.
   */
  const supersededPageRef = useRef<number | null>(null);
  /**
   * The CURRENT `fetchMessages`, for the superseded re-issue to call.
   *
   * A `useCallback` closure captures `isKanban` from the render that made it. The retry
   * runs after an await, by which time that value is exactly what has changed — so
   * calling the closure re-sends the request the retry exists to replace.
   */
  const fetchMessagesRef = useRef<((page?: number, force?: boolean) => Promise<void>) | null>(
    null
  );
  // After the first successful fetch, subsequent refetches keep the list
  // visible — flipping `loading` would swap the rows for skeleton cards on
  // every filter change, which reads as a blink.
  const hasLoadedRef = useRef(false);

  const filters = useMessagesStore((state) => state.filters);
  const sorting = useMessagesStore((state) => state.sorting);
  const setMessages = useMessagesStore((state) => state.setMessages);
  const setListScope = useMessagesStore((state) => state.setListScope);
  const clearCache = useMessagesStore((state) => state.clearCache);
  const getCached = useMessagesStore((state) => state.getCached);
  // The checkbox-driven DepartmentSwitcher writes the X-Department-Context CSV
  // header. Subscribing here makes the effect re-run when the user toggles.
  const selectedDeptKey = useDepartmentContextKey();
  // The X-Organization-Context header is read from this field at request time. It is part
  // of the cache key (`identityScope`) but was not a reason to refetch: an in-place org
  // switch (the console's WorkspaceShell repoints it on mount) missed the cache and then
  // issued nothing, leaving the previous workspace's rows on screen.
  const selectedOrganizationId = useAuthStore((state) => state.selectedOrganizationId);

  const fetchMessages = useCallback(
    async (page = 1, force = false) => {
      /**
       * ONE snapshot, taken before anything is decided, and used for all three of: the
       * cache lookup, the request, and the key the response is filed under.
       *
       * Reading the store again later means reading a DIFFERENT state — filters move
       * while a request is in flight, and that is exactly when this matters. The response
       * was previously stored against whatever the filters had become, so the board's
       * `queue`-stripped result landed under a key that named the queue.
       */
      const snapshot = useMessagesStore.getState();
      const currentFilters = snapshot.filters;
      const currentSorting = snapshot.sorting;
      const cacheKey = messagesCacheKey(currentFilters, currentSorting, page, isKanban);

      if (!force) {
        const cached = getCached(cacheKey);
        if (cached) {
          setThreadsLocal(cached.threads);
          setMessagesPagination(cached.pagination);
          // Restore the notice with the rows it describes. Without this, paging back
          // to a cached page drops the "showing 5 of 3,014" line and the list goes
          // quiet again — which is the exact behaviour being fixed.
          setListScope(cached.listScope);
          setLoading(false);
          return;
        }
      }

      if (messagesFetchingRef.current && !force) {
        /**
         * ⛔ Do NOT just drop it. The in-flight request was built from parameters that
         * have since CHANGED, so its answer is already stale when it lands — and nothing
         * asks again, because this return is silent.
         *
         * That is what survived two other fixes on the way to this one. Jumping from the
         * board to the list changes two things a beat apart (the filter, then the
         * board→list flip that stops the request builder zeroing `queue`). The first
         * fired a request; the second arrived while it was in flight and was discarded
         * here. The list then showed the BOARD's rows — 16 unrelated threads under a
         * notice promising 10 — with no second request on the wire to explain it.
         *
         * Remember the page instead and re-issue once the in-flight one settles. If
         * nothing really changed, the re-run hits the cache and costs no request, so this
         * terminates.
         */
        supersededPageRef.current = page;
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
        // A quick-filter chip in list view IS a kanban column. Applying that column's own
        // `fixedFilters` — the same object MessagesKanbanView spreads into its request — is what
        // guarantees the chip and the board return the same rows. A chip carrying its own copy
        // of the predicate would drift from the column within a release, and the two views would
        // quietly disagree about what "Spam" means.
        const columnId = isKanban ? 'all' : (currentFilters.columnId ?? 'all');
        const activeColumn =
          columnId !== 'all' ? COLUMNS.find((col) => col.id === columnId) : undefined;
        if (activeColumn) {
          Object.assign(apiFilters, activeColumn.fixedFilters);
        }

        const lifecycle = isKanban || activeColumn ? 'all' : (currentFilters.lifecycle ?? 'all');
        if (lifecycle !== 'all') {
          apiFilters.lifecycle = lifecycle;
        }
        const queue = isKanban || activeColumn ? 'all' : (currentFilters.queue ?? 'all');
        if (queue !== 'all') {
          apiFilters.queue = queue;
        }
        const read = isKanban ? 'all' : (currentFilters.read ?? 'all');
        if (read !== 'all') {
          apiFilters.read = read;
        }
        // An active column also fully defines the set, so the legacy status→view derivation
        // below must not layer a second, conflicting constraint on top of it.
        const lifecycleOrQueueActive = lifecycle !== 'all' || queue !== 'all' || !!activeColumn;

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

        const searchIsTheWholeFilter = searchIsTheOnlyFilter({
          search: currentFilters.search,
          threadStatus,
          lifecycleOrQueueActive,
        });

        // STATUS → view param
        // When threadStatus is active, use view=active (not work_queue) so the status
        // restriction from work_queue doesn't block closed threads.
        // Skipped entirely when a lifecycle/queue filter is driving the list.
        const status = currentFilters.status ?? 'all';
        if (lifecycleOrQueueActive) {
          // lifecycle/queue define the set; leave view/showSpam unset so the BE's
          // base (org/dept) scope + the new params are the only status constraints.
        } else if (status === 'all' && searchIsTheWholeFilter) {
          // ⛔ No view at all. A typed search is a request for a NAMED thing, not a browse
          // of the work queue, and `view=work_queue` is a lens: it reaches the BE's view
          // chain, which runs BEFORE the rule that drops the default lens for an explicit
          // search — so the bypass the backend already implements never fires, and the
          // answer comes back narrowed.
          //
          // Measured on a client deploy: searching a customer's address returned "No
          // messages found" over the banner "Showing 0 of 1 — 1 hidden by the current
          // view", while the same search with no `view` returned the thread. An agent
          // reads the first as "this mail never arrived".
          //
          // Only when the agent picked NOTHING. A chosen status, lifecycle, queue or
          // column is a deliberate narrowing and still applies — searching inside
          // "Resolved" must keep meaning that.
        } else if (status === 'all') {
          /**
           * The pill says "All". It must ask for all.
           *
           * It used to send `view=work_queue`, which is a real lens and a narrow one: it pins
           * `status IN (new, open, pending, awaiting_response, client_replied)` and drops spam,
           * suspicious and knowledge-base mail. On a client workspace that rendered
           * `1–50 of 0` beside a kanban showing 2,880 of the same 2,910 threads, because the
           * board applies neither a terminal filter nor a KB one. Two views of one mailbox
           * disagreeing by 2,880 rows, with the narrower one labelled "All".
           *
           * ⛔ NOT `view=all` — the API refuses that with a 400, deliberately, because it used
           * to be accepted and silently narrowed. `view=active&processed=all` is the widening
           * the backend sanctions, and its own 400 body names it.
           *
           * 🪤 `processed=all` was DISCARDED by the backend parser until BE #634: it had no
           * arm in the `processed` chain and fell through to `undefined`, which made it
           * indistinguishable from a typo. Sending it before that shipped would have made this
           * list NARROWER, not wider — `view=active` without the pin skip returns fewer rows
           * than `view=work_queue`. Requires BE >= the release carrying #634 and #635.
           *
           * What this does NOT widen, deliberately: knowledge-base mail stays excluded unless
           * it is live work (BE `NOT_ARCHIVED_KB`), and spam/suspicious keep their own chips.
           * `ListScopeNotice` reports whatever remains hidden, so the list still says when it
           * is a subset.
           */
          apiFilters.view = 'active';
          if (threadStatus === 'all') {
            apiFilters.processed = 'all';
          }
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

        // ⛔ LIST VIEW ONLY. The aggregate scans every conversation in the org and is
        // the slowest of the endpoint's three queries. The board fetches per column and
        // the dashboard fires ten `(…, 1, 1)` counter calls — none of them render this,
        // and all of them would pay for it. `isKanban` is the only discriminator here.
        if (!isKanban) apiFilters.scope = '1';

        const response = await messageService.getThreads(
          Object.keys(apiFilters).length > 0 ? apiFilters : undefined,
          page,
          DEFAULT_LIMIT,
          currentSorting.sortOrder,
          currentSorting.sortBy
        );

        if (response.success && response.data) {
          // `scope` is absent on a stale bundle/older backend and null when the count
          // could not be taken. Both mean "no information" — never a zeroed object.
          setMessages(response.data, response.pagination, response.scope ?? null, cacheKey);
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
        // A request arrived while this one was in flight and was held rather than
        // dropped. Issue it now that the slot is free — it was built from newer
        // parameters, so its answer supersedes the one just applied.
        //
        // ⛔ Through the REF, never `fetchMessages` directly. This closure was created
        // with the `isKanban` of the render that started the in-flight request, and that
        // is precisely the value that has since changed. Re-issuing through the closure
        // repeated the OLD request shape — the board's, with `queue` stripped — and then
        // found it in the cache, so the retry cost no request and changed nothing. That
        // is why this looked like a dead end with a silent network.
        const superseded = supersededPageRef.current;
        supersededPageRef.current = null;
        if (superseded !== null) {
          void fetchMessagesRef.current?.(superseded).catch((error) => {
            logger.error('Failed to fetch messages:', error);
          });
        }
      }
    },
    [getCached, setMessages, setListScope, isKanban]
  );

  // Keep the ref pointing at the latest closure, so a superseded re-issue runs with the
  // CURRENT `isKanban` rather than the one that produced the request it is replacing.
  fetchMessagesRef.current = fetchMessages;

  // Fetch on filter/sorting change — resets to page 1.
  // fetchMessages reads filters/sorting from store directly to avoid stale closure without listing them as deps
  useEffect(() => {
    if (!urlSyncedRef.current) return;
    fetchMessages(1).catch((error) => {
      logger.error('Failed to fetch messages:', error);
    });
  }, [
    filters.messageSourceId,
    // `columnId` (the quick-filter chips) and `receivedAt` (the "Received at" alias token) belong
    // here for the same reason every other field does: `fetchMessages` reads them out of the store
    // when it runs, so if they are not a dependency, changing them updates the store and the
    // highlighted control and issues no request. Both shipped that way, and both were intermittent
    // rather than dead — a chip appeared to work whenever the click also reset some other filter,
    // which is why it read as flakiness. `refetchCoversEveryFilter.test.ts` now fails if a future
    // field is read by the builder without being listed here.
    filters.columnId,
    filters.receivedAt,
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
    // The org the request is issued FOR (see the selector above). `orgSwitchRefetches` in
    // `refetchCoversEveryFilter.test.ts` fails if this is dropped.
    selectedOrganizationId,
    // Read by the request builder in five places — it ZEROES `lifecycle`, `queue`, `read`
    // and `columnId`, and withholds `scope=1` — so leaving it out is the same defect as an
    // unlisted filter field, one level up: switching board→list keeps whatever the BOARD's
    // request returned. Observed on staging: the scope notice's "10 outbound echoes" chip
    // landed on the list with the token rendered and 16 rows — the pre-jump result set,
    // because `queue` had already changed while `isKanban` was still true and nothing
    // triggered a second fetch once it flipped.
    isKanban,
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
