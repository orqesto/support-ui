import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  useImperativeHandle,
  type ForwardedRef,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useDepartmentContextKey } from '@/hooks/useDepartmentContextKey';
import { useNotificationCounts } from '@/hooks/useNotificationCounts';
import { exactTotal } from '@/lib/listTotals';
import { logger } from '@/lib/logger';
import {
  messageService,
  type ListScope,
  type MessageThread,
  type ThreadsResponse,
} from '@/services/message.service';
import { type FilterState, type SortingState } from '@/features/messages/stores/messagesStore';
import { buildSharedFilters } from '../kanbanSharedFilters';
import { loadColSort, saveColSort } from './kanbanColSort';
import { COLUMNS, type ColumnAxis } from '../kanbanColumns';
import {
  BOARD_MAX_PAGES,
  BOARD_SCOPE_COUNT,
  COL_STATE_PATCH,
  HIDDEN_COLS_KEY,
  PAGE_SIZE,
  boardScopeFrom,
  countsTowardTriageBadge,
  initialColStates,
  loadHiddenCols,
  uniqueThreads,
  type ColumnState,
  type MessagesKanbanHandle,
} from './kanbanBoardModel';

/**
 * The board's state and its reads: columns, per-column sort, the unread badge, the scope count,
 * and the optimistic moves the page drives through the imperative handle. Extracted unchanged
 * from `MessagesKanbanView` (same hook order, same dependency arrays).
 */
export const useKanbanBoardData = (
  filters: FilterState,
  ref: ForwardedRef<MessagesKanbanHandle>
) => {
  const queryClient = useQueryClient();
  // Which axis's columns are shown. Lifecycle = the work board; Triage = the
  // pre-lifecycle classification queues. (Option A: separate tabs.)
  const [activeTab, setActiveTab] = useState<ColumnAxis>('lifecycle');
  // Hidden (collapsed) lifecycle columns — only On-hold/Resolved are hideable.
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(loadHiddenCols);
  const toggleCol = useCallback((id: string) => {
    setHiddenCols((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem(HIDDEN_COLS_KEY, JSON.stringify([...next]));
      } catch {
        /* ignore quota/availability errors */
      }
      return next;
    });
  }, []);
  const [colStates, setColStates] = useState<Record<string, ColumnState>>(initialColStates);
  const [triageUnread, setTriageUnread] = useState(0);
  const [activeThread, setActiveThread] = useState<MessageThread | null>(null);
  const [activeDragColId, setActiveDragColId] = useState<string | null>(null);

  // Per-column sort — each column sorts independently (kanban no longer reads the
  // global store `sorting`, which the list view still owns). Falls back to
  // newest-first for any column the user hasn't touched. Remembered for this user in this
  // workspace, like the list view's sort (kanbanColSort.ts).
  const DEFAULT_COL_SORT: SortingState = { sortBy: 'time', sortOrder: 'desc' };
  const [colSort, setColSort] = useState<Record<string, SortingState>>(loadColSort);
  const colSortLoaded = useRef(colSort);
  useEffect(() => {
    // Not on mount: the value just read needs no write.
    if (colSort === colSortLoaded.current) return;
    saveColSort(colSort);
  }, [colSort]);
  const getColSort = useCallback(
    (colId: string): SortingState => colSort[colId] ?? DEFAULT_COL_SORT,
    // DEFAULT_COL_SORT is a stable literal; only colSort drives changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [colSort]
  );

  const sharedFilters = useMemo(() => buildSharedFilters(filters), [filters]);
  // Shared-filter key drives a full reload of every column (filters apply to all).
  const filterKey = useMemo(() => JSON.stringify(sharedFilters), [sharedFilters]);
  // Serialize per-column sort so a single column's sort change reloads just that
  // column (see the colSort effect below), keyed off the previous snapshot.
  const colSortKey = useMemo(() => JSON.stringify(colSort), [colSort]);

  const selectedDeptKey = useDepartmentContextKey();
  // P2: unread auto-arrival counts for the Suspicious/Spam column badges.
  const { counts: arrivalCounts, clearKind: clearArrivalKind } = useNotificationCounts();

  const colStatesRef = useRef(colStates);
  colStatesRef.current = colStates;
  const sharedFiltersRef = useRef(sharedFilters);
  sharedFiltersRef.current = sharedFilters;
  const colSortRef = useRef(colSort);
  colSortRef.current = colSort;

  // Load a single column with ITS current sort. Reads sort + filters from refs so the
  // identity stays stable and effects can call it freely.
  // `keepDepth` (post-action reconcile, same scope): re-fetch EVERY page the agent has
  // already loaded, not just page 1. Reloading page 1 alone replaced the column with 20
  // rows, which threw away each "Load more" page and jumped the scroll back to the top
  // on every mark-as-read. One larger request can't stand in: the API caps `limit` at 50.
  // One column's pages, as loaded — by its own requests or by the board read.
  const applyColumnPages = useCallback((colId: string, results: ThreadsResponse[]) => {
    const last = results[results.length - 1];
    setColStates((prev) => ({
      ...prev,
      [colId]: {
        threads: uniqueThreads(
          results.flatMap((res) => res.data.filter((thread) => thread.latestMessage !== null))
        ),
        total: last.pagination.total,
        totalCapped: last.pagination.totalCapped === true,
        loading: false,
        unfinished: false,
        hasMore: last.pagination.page < last.pagination.totalPages,
        // Rows can leave the column between loads; never claim a page past the end,
        // or the next "Load more" would ask for one that does not exist.
        page: Math.max(1, Math.min(last.pagination.page, last.pagination.totalPages)),
      },
    }));
  }, []);

  const loadColumn = useCallback(
    (colId: string, keepDepth = false) => {
      const col = COLUMNS.find((kanbanCol) => kanbanCol.id === colId);
      if (!col) return () => {};
      let cancelled = false;
      setColStates((prev) => ({ ...prev, [colId]: { ...prev[colId], loading: true } }));
      const sort = colSortRef.current[colId] ?? { sortBy: 'time', sortOrder: 'desc' };
      const requestFilters = { ...sharedFiltersRef.current, ...col.fixedFilters };
      const pages = keepDepth ? Math.max(1, colStatesRef.current[colId]?.page ?? 1) : 1;
      void (async () => {
        try {
          const results = await Promise.all(
            Array.from({ length: pages }, (_, idx) =>
              messageService.getThreads(
                requestFilters,
                idx + 1,
                PAGE_SIZE,
                sort.sortOrder,
                sort.sortBy
              )
            )
          );
          if (cancelled) return;
          if (!results.every((res) => res.success)) {
            // Keep what is on screen rather than half a column; just stop "Loading…".
            setColStates((prev) => ({
              ...prev,
              [colId]: { ...prev[colId], loading: false, unfinished: true },
            }));
            return;
          }
          applyColumnPages(colId, results);
        } catch (err) {
          if (!cancelled) {
            logger.error(`Failed to fetch kanban column ${colId}:`, err);
            setColStates((prev) => ({
              ...prev,
              [colId]: { ...prev[colId], loading: false, unfinished: true },
            }));
          }
        }
      })();
      return () => {
        cancelled = true;
      };
    },
    [applyColumnPages]
  );

  // Server-side UNREAD count across the triage queues, for the Triage tab badge.
  // One count request per triage column with `limit=1` — we only read
  // `pagination.total`, never the rows, so this stays cheap and is correct
  // regardless of how deep a queue is (see the note by triageCount for why the
  // loaded page cannot be counted instead).
  //
  // `read=unread` is the SHARED org-wide read state (the same one the triage
  // read/unread filter drives): a thread any agent has read is read for the team, so
  // this number is "what the team has not looked at yet", not "what I have not looked
  // at yet". Deliberately not useNotificationCounts() — those are arrival
  // notifications for two kinds only, and they clear when a kind is marked reviewed,
  // not when a thread is read.
  const loadTriageUnread = useCallback(() => {
    let cancelled = false;
    // Same rule as the total badge — see `countsTowardTriageBadge`. Excluding it from one
    // badge and not the other is how "1,267 unread" would have appeared beside a total of 30.
    const triageCols = COLUMNS.filter(countsTowardTriageBadge);
    void (async () => {
      try {
        const totals = await Promise.all(
          triageCols.map(async (col) => {
            const res = await messageService.getThreads(
              { ...sharedFiltersRef.current, ...col.fixedFilters, read: 'unread' },
              1,
              1
            );
            // A refused, capped or cut-short count is not a number to add up: keep the previous
            // badge (a refusal used to count as 0, so the badge dropped though nothing was read).
            return res.success ? exactTotal(res.pagination) : undefined;
          })
        );
        if (totals.some((num) => num === undefined)) return;
        if (!cancelled) setTriageUnread(totals.reduce<number>((sum, num) => sum + (num ?? 0), 0));
      } catch (err) {
        // Non-fatal: the badge is informational. Leave the previous value rather
        // than flashing 0, which would read as "nothing unread" — the one wrong
        // answer this badge can give.
        logger.error('Failed to fetch triage unread count:', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * What this board CANNOT show, in numbers.
   *
   * The board fires one query per column and renders what comes back. Nothing ever asked
   * the complementary question, so a conversation matching none of the nine columns was
   * simply absent while the filter bar above it counted the row — `1–2 of 2` over a single
   * card, with nothing saying the other one had no lane. `view=board` is that question:
   * the union of the nine, so `pagination.total` is what the board holds and `scope.hidden`
   * is what it leaves out, broken down by reason.
   *
   * 🪤 It CANNOT be derived by summing the column totals. Three reasons, each enough on its
   * own: `boardCount` deliberately omits the hideable columns; the sum is only valid if all
   * nine predicates are disjoint, which is an assumption no code here checks; and the
   * columns resolve independently, so mid-load the sum is short and the notice would flash
   * a number that is briefly a lie. One server-side answer has none of those problems.
   *
   * ⚠️ Costs one aggregate over the org per filter change — the same query the list view
   * pays for, and the reason `useMessagesData` withholds `scope=1` from the board. It is
   * requested with `limit=1` so only the count comes back, never rows.
   */
  /**
   * ⚠️ SINCE THE TENTH COLUMN, THIS IS A TRIPWIRE — not a caption anyone should see.
   *
   * `view=board` covers every conversation now, so `scope.hidden` is 0 by construction and
   * `ListScopeNotice` renders nothing. Keeping the query is deliberate: the day a lane
   * narrows again — a predicate gains a clause, a column's filter drifts from the server's
   * — `hidden` goes positive and the sentence reappears above the board, naming the count.
   * That is the failure mode this whole feature exists for, and it stayed invisible for a
   * month the last two times precisely because nothing was watching.
   *
   * The cost is one aggregate per filter change, which was already being paid.
   */
  const [boardScope, setBoardScope] = useState<{
    scope: ListScope;
    shown: number;
    shownCapped?: boolean;
  } | null>(null);

  const loadBoardScope = useCallback((onLoaded?: () => void) => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await messageService.getThreads(
          { ...sharedFiltersRef.current, view: 'board', scope: '1' },
          1,
          1
        );
        if (cancelled || !res.success) return;
        /**
         * ⛔ FEATURE-DETECT, not an optional nicety. This repo deploys on merge while the
         * backend ships on a tag, so this bundle WILL run against a backend that predates
         * `view=board` — and an unknown view is not rejected there, it is dropped
         * (`requestedView` returns undefined for anything unrecognised). The request then
         * answers with the DEFAULT list lens, and we would render its count above the
         * kanban as though it described the board: a confidently wrong number, which is
         * the precise failure this notice exists to remove.
         *
         * `orphanOutgoing` is added by the same backend change as `view=board`, so its
         * presence is the signal that the answer means what we think. `scope` absent or
         * null already means "no information"; so does an old shape.
         */
        setBoardScope(boardScopeFrom(res));
        onLoaded?.();
      } catch (err) {
        // Non-fatal: the notice is informational, the board is not. Clear it rather than
        // leaving a stale count describing the previous filter.
        if (!cancelled) {
          logger.error('Failed to fetch board scope:', err);
          setBoardScope(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * The columns, the unread badge and (when asked) the scope in ONE request
   * (`POST /threads/board`), where the board used to send one search per column, one per unread
   * badge and one for the scope: nine on every refresh. Each entry is listed by the same backend
   * code as its own search, so what lands here is what those requests answered.
   *
   * A backend without the route (it ships on a tag, this repo on merge) answers `null`, and the
   * board reads itself the old way — `loadColumn`, `loadTriageUnread`, `loadBoardScope`.
   */
  const loadBoard = useCallback(
    ({
      colIds,
      keepDepth,
      unread,
      scope,
      onScopeLoaded,
    }: {
      colIds: string[];
      keepDepth: boolean;
      unread: boolean;
      scope: boolean;
      onScopeLoaded?: () => void;
    }) => {
      let cancelled = false;
      const pagesOf = (colId: string) =>
        keepDepth ? Math.max(1, colStatesRef.current[colId]?.page ?? 1) : 1;
      // A column deeper than the board read takes (BOARD_MAX_PAGES, "Load more" has no limit)
      // is read on its own, as before — one such column must not make the whole board a 400.
      const deep = COLUMNS.filter(
        (col) => colIds.includes(col.id) && pagesOf(col.id) > BOARD_MAX_PAGES
      );
      let fallbackCancels: Array<() => void> = deep.map((col) => loadColumn(col.id, keepDepth));
      const columns = COLUMNS.filter(
        (col) => colIds.includes(col.id) && pagesOf(col.id) <= BOARD_MAX_PAGES
      );
      const triageCols = unread ? COLUMNS.filter(countsTowardTriageBadge) : [];
      setColStates((prev) => {
        const next = { ...prev };
        for (const col of columns) next[col.id] = { ...prev[col.id], loading: true };
        return next;
      });
      void (async () => {
        try {
          const answer = await messageService.getThreadBoard({
            filters: sharedFiltersRef.current,
            columns: columns.map((col) => {
              const sort = colSortRef.current[col.id] ?? { sortBy: 'time', sortOrder: 'desc' };
              return {
                id: col.id,
                filters: col.fixedFilters,
                sortOrder: sort.sortOrder,
                ...(sort.sortBy !== 'time' ? { sortBy: sort.sortBy } : {}),
                limit: PAGE_SIZE,
                pages: pagesOf(col.id),
              };
            }),
            counts: [
              ...triageCols.map((col) => ({
                id: col.id,
                filters: { ...col.fixedFilters, read: 'unread' },
              })),
              ...(scope ? [{ id: BOARD_SCOPE_COUNT, filters: { view: 'board', scope: '1' } }] : []),
            ],
          });
          if (cancelled) return;
          if (!answer) {
            fallbackCancels = [
              ...fallbackCancels,
              ...columns.map((col) => loadColumn(col.id, keepDepth)),
              ...(unread ? [loadTriageUnread()] : []),
              ...(scope ? [loadBoardScope(onScopeLoaded)] : []),
            ];
            return;
          }
          for (const col of columns) {
            const pages = answer.columns[col.id];
            if (pages && pages.length > 0) applyColumnPages(col.id, pages);
            // Keep what is on screen rather than half a column; just stop "Loading…" — and
            // mark it: what is on screen is not this read's answer.
            else
              setColStates((prev) => ({
                ...prev,
                [col.id]: { ...prev[col.id], loading: false, unfinished: true },
              }));
          }
          if (unread) {
            // A count that failed, was capped or cut short is not a number to add up: keep the
            // previous badge, as loadTriageUnread does.
            const totals = triageCols.map((col) => {
              const count = answer.counts[col.id];
              return count ? exactTotal(count.pagination) : undefined;
            });
            if (!totals.some((num) => num === undefined)) {
              setTriageUnread(totals.reduce<number>((sum, num) => sum + (num ?? 0), 0));
            }
          }
          if (scope) {
            const count = answer.counts[BOARD_SCOPE_COUNT];
            setBoardScope(count ? boardScopeFrom(count) : null);
            if (count) onScopeLoaded?.();
          }
        } catch (err) {
          if (cancelled) return;
          logger.error('Failed to fetch the kanban board:', err);
          setColStates((prev) => {
            const next = { ...prev };
            // The board request failed (500, 429, network): no column has this read's answer.
            for (const col of columns) {
              next[col.id] = { ...prev[col.id], loading: false, unfinished: true };
            }
            return next;
          });
          if (scope) setBoardScope(null);
        }
      })();
      return () => {
        cancelled = true;
        fallbackCancels.forEach((cancel) => cancel());
      };
    },
    [applyColumnPages, loadColumn, loadTriageUnread, loadBoardScope]
  );

  // Optimistic single-card move — pull the card out of whichever column currently
  // holds it and drop it into the destination column, all in local state. No column
  // refetch (unlike bumpKanban), so the acting agent sees the card jump the instant
  // their reply/resolve/close succeeds. The next authoritative reload (if any) simply
  // confirms the same placement, so there's no visible second jump.
  // Pull every card matching `isMoved` out of whichever column holds it and drop it into the
  // destination column, all in local state. One card (the acting agent's reply/resolve) or many
  // (a bulk run). No refetch: the next authoritative reload confirms the same placement.
  const moveCards = useCallback(
    (isMoved: (thread: MessageThread) => boolean, targetColId: string | null) => {
      setColStates((prev) => {
        const moved: MessageThread[] = [];
        const next: Record<string, ColumnState> = {};
        for (const [colId, state] of Object.entries(prev)) {
          const leaving = state.threads.filter(isMoved);
          // The target column too: a card already there goes back on top, patched, as one did.
          if (leaving.length === 0) {
            next[colId] = state;
            continue;
          }
          moved.push(...leaving);
          next[colId] = {
            ...state,
            threads: state.threads.filter((thr) => !isMoved(thr)),
            total: Math.max(0, state.total - leaving.length),
          };
        }
        // No card on the loaded board (off-page / different filter) — nothing to do.
        if (moved.length === 0) return prev;
        if (targetColId && next[targetColId]) {
          const patched = moved.map((thr) => ({ ...thr, ...COL_STATE_PATCH[targetColId] }));
          next[targetColId] = {
            ...next[targetColId],
            threads: uniqueThreads([...patched, ...next[targetColId].threads]),
            total: next[targetColId].total + moved.length,
          };
        }
        return next;
      });
    },
    []
  );

  const optimisticMove = useCallback(
    (threadId: string, targetColId: string | null) =>
      moveCards((thr) => thr.threadId === threadId, targetColId),
    [moveCards]
  );

  const optimisticMoveMany = useCallback(
    (conversationIds: number[], targetColId: string | null) => {
      const ids = new Set(conversationIds);
      moveCards((thr) => ids.has(thr.latestMessage?.id ?? -1), targetColId);
    },
    [moveCards]
  );

  useImperativeHandle(ref, () => ({ optimisticMove, optimisticMoveMany }), [
    optimisticMove,
    optimisticMoveMany,
  ]);

  return {
    queryClient,
    activeTab,
    setActiveTab,
    hiddenCols,
    toggleCol,
    colStates,
    setColStates,
    triageUnread,
    activeThread,
    setActiveThread,
    activeDragColId,
    setActiveDragColId,
    colSort,
    setColSort,
    getColSort,
    filterKey,
    colSortKey,
    selectedDeptKey,
    arrivalCounts,
    clearArrivalKind,
    colStatesRef,
    sharedFiltersRef,
    colSortRef,
    loadColumn,
    boardScope,
    loadBoard,
  };
};
