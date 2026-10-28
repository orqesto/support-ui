import { useState, useCallback, useRef, useEffect } from 'react';
import { logger } from '@/lib/logger';
import type { MutableRefObject, Dispatch, SetStateAction } from 'react';
import {
  messageService,
  type MessageThread,
  type PaginationMeta,
  type SearchReading,
} from '@/services/message.service';
import { messagesCacheKey, useMessagesStore } from '@/stores/messagesStore';
import { useAuthStore } from '@/stores/authStore';
import { threadApiFilters } from './threadApiFilters';
import { useDepartmentContextKey } from './useDepartmentContextKey';

type MessagesDataReturn = {
  threads: MessageThread[];
  loading: boolean;
  refreshing: boolean;
  /** A read for a DIFFERENT search than the rows on screen is in flight — the rows are stale. */
  searching: boolean;
  /** How the backend read the search on screen (e.g. as one phrase); null when unknown. */
  searchReading: SearchReading | null;
  /** The list ran out of time and was stopped (backend search plan step 3½): not "empty". */
  listTimedOut: boolean;
  setRefreshing: Dispatch<SetStateAction<boolean>>;
  messagesPagination: PaginationMeta;
  fetchMessages: (page?: number, force?: boolean) => Promise<void>;
  handlePageChange: (page: number) => Promise<void>;
  handleRefresh: () => Promise<void>;
  clearCache: () => void;
};

interface UseMessagesDataProps {
  urlSyncedRef: MutableRefObject<boolean>;
  /**
   * On the kanban board this list is NOT read.
   *
   * Each column reads its own lanes (`MessagesKanbanView`), and the header's "1–17 of 17" is the
   * board's own total (`onTotalChange`). Reading the list as well cost the page's heaviest search
   * (50 rows) on every board load and every server event, for rows nothing on the board drew
   * (staging, 2026-10-28: 10 searches per Threads click, this one of them). Switching back to the
   * list reads it: `isKanban` is a dependency of the fetch effect.
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
  const [searching, setSearching] = useState(false);
  const [searchReading, setSearchReading] = useState<SearchReading | null>(null);
  const [listTimedOut, setListTimedOut] = useState(false);
  /** The search the rows on screen answer. A read for another one shades the list. */
  const shownSearchRef = useRef('');
  /** Aborts the in-flight list read once a newer one replaces it. */
  const inFlightAbortRef = useRef<AbortController | null>(null);
  const [messagesPagination, setMessagesPagination] = useState<PaginationMeta>({
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
  const fetchMessagesRef = useRef<((page?: number, force?: boolean) => Promise<void>) | null>(null);
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
      if (isKanban) {
        // An older list read still in flight must not land on the board's state.
        inFlightAbortRef.current?.abort();
        setLoading(false);
        setSearching(false);
        return;
      }
      const snapshot = useMessagesStore.getState();
      const currentFilters = snapshot.filters;
      const currentSorting = snapshot.sorting;
      const cacheKey = messagesCacheKey(currentFilters, currentSorting, page, isKanban);

      if (!force) {
        const cached = getCached(cacheKey);
        if (cached) {
          // A read still in flight was asked for OTHER parameters (typing on, then back to a
          // search already seen). Left running it would land after this and overwrite it.
          inFlightAbortRef.current?.abort();
          setThreadsLocal(cached.threads);
          setMessagesPagination(cached.pagination);
          // Restore the notice with the rows it describes. Without this, paging back
          // to a cached page drops the "showing 5 of 3,014" line and the list goes
          // quiet again — which is the exact behaviour being fixed.
          setListScope(cached.listScope);
          setLoading(false);
          shownSearchRef.current = currentFilters.search?.trim() ?? '';
          setSearching(false);
          // The reading cached WITH these rows — a cut-short answer must still say so.
          setSearchReading(cached.searchReading);
          // A timed-out answer is never cached (below), so a cached page did finish.
          setListTimedOut(false);
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
        // …and stop waiting for the stale answer. Typing a search further issues a read per
        // pause; without this each one waited out the previous, slower one before it could
        // start. The aborted read settles at once, and its `finally` re-issues this page.
        // (This frees the list; the server still finishes the query it was given.)
        inFlightAbortRef.current?.abort();
        return;
      }

      messagesFetchingRef.current = true;
      const abort = new AbortController();
      inFlightAbortRef.current = abort;
      const requestedSearch = currentFilters.search?.trim() ?? '';
      if (requestedSearch !== shownSearchRef.current) {
        setSearching(true);
        // The notice describes the search ON SCREEN; a different one is on its way, and if it
        // fails the old notice would sit under the new search box.
        setSearchReading(null);
      }
      if (hasLoadedRef.current) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      try {
        const apiFilters = threadApiFilters(currentFilters, isKanban);

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
          currentSorting.sortBy,
          { signal: abort.signal, allowTimedOut: true }
        );

        if (response.success && response.data) {
          // The list ran out of time (backend search plan step 3½). NOT cached: the same
          // search or filter later must ask again, not replay "took too long".
          const timedOut = response.timedOut === true || response.search?.timedOut === true;
          setListTimedOut(timedOut);
          // `scope` is absent on a stale bundle/older backend and null when the count
          // could not be taken. Both mean "no information" — never a zeroed object.
          if (timedOut) {
            setListScope(response.scope ?? null);
          } else {
            setMessages(
              response.data,
              response.pagination,
              response.scope ?? null,
              cacheKey,
              response.search
            );
          }
          setThreadsLocal(response.data);
          setMessagesPagination(response.pagination);
          hasLoadedRef.current = true;
          shownSearchRef.current = requestedSearch;
          // Normalised by the service (an older backend sends no `search`).
          setSearchReading(response.search);

          if (
            page > 1 &&
            page > response.pagination.totalPages &&
            response.pagination.totalPages > 0
          ) {
            await fetchMessages(1);
          }
        }
      } catch (error) {
        // Aborted on purpose by the newer read above — not a failure.
        if (!abort.signal.aborted) logger.error('Failed to fetch messages:', error);
      } finally {
        setLoading(false);
        setRefreshing(false);
        // Only the LATEST read settles the shared state. A forced read (refresh, read-state
        // change) starts beside an unforced one; when the older finishes first it must not
        // drop the shade or free the slot while the newer is still on its way.
        if (inFlightAbortRef.current === abort) {
          inFlightAbortRef.current = null;
          setSearching(false);
          messagesFetchingRef.current = false;
        }
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
    filters.showKBOnly,
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
    searching,
    searchReading,
    listTimedOut,
    setRefreshing,
    messagesPagination,
    fetchMessages,
    handlePageChange,
    handleRefresh,
    clearCache,
  };
};
