import {
  useCallback,
  useEffect,
  useRef,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react';
import { logger } from '@/lib/logger';
import { messageService } from '@/services/message.service';
import type { SortingState } from '@/features/messages/stores/messagesStore';
import { COLUMNS, type ColumnAxis } from '../kanbanColumns';
import { PAGE_SIZE, initialColStates, uniqueThreads, type ColumnState } from './kanbanBoardModel';
import type { useKanbanBoardData } from './useKanbanBoardData';

type Board = ReturnType<typeof useKanbanBoardData>;

/** When the board re-reads (scope, refresh, tab, per-column sort) and "Load more". Extracted unchanged from `MessagesKanbanView`. */
export const useKanbanBoardRefresh = ({
  filterKey,
  refreshKey,
  selectedDeptKey,
  activeTab,
  colSort,
  colSortKey,
  setColStates,
  colStatesRef,
  sharedFiltersRef,
  colSortRef,
  loadColumn,
  loadBoard,
}: {
  filterKey: string;
  refreshKey?: number;
  selectedDeptKey: Board['selectedDeptKey'];
  activeTab: ColumnAxis;
  colSort: Record<string, SortingState>;
  colSortKey: string;
  setColStates: Dispatch<SetStateAction<Record<string, ColumnState>>>;
  colStatesRef: MutableRefObject<Record<string, ColumnState>>;
  sharedFiltersRef: Board['sharedFiltersRef'];
  colSortRef: MutableRefObject<Record<string, SortingState>>;
  loadColumn: Board['loadColumn'];
  loadBoard: Board['loadBoard'];
}) => {
  // Fetch all columns in parallel when shared filters / refresh / dept change.
  // A filter/dept change invalidates the current rows → wipe to skeletons first. A
  // plain refreshKey bump (post-action reconcile) reloads IN PLACE: loadColumn keeps
  // the existing threads visible (loading flag only) until fresh data arrives, so an
  // optimistically-moved card doesn't flash away and back.
  const prevFilterKeyRef = useRef(filterKey);
  const boardScopeLoadedRef = useRef(false);
  // Which load each column last answered for (`filter|team|refresh`), so a tab opened later
  // knows whether its columns are current. Set when a load starts; a cancelled one is redone by
  // the run that cancelled it.
  const loadGenRef = useRef('');
  const colLoadedGenRef = useRef<Record<string, string>>({});
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;
  const prevDeptKeyRef = useRef(selectedDeptKey);
  useEffect(() => {
    const scopeChanged =
      prevFilterKeyRef.current !== filterKey || prevDeptKeyRef.current !== selectedDeptKey;
    prevFilterKeyRef.current = filterKey;
    prevDeptKeyRef.current = selectedDeptKey;
    if (scopeChanged) setColStates(initialColStates);
    // Same scope ⇒ keep every loaded page (and so the scroll position); a new scope
    // starts again from page 1.
    // Only the tab on screen. The other tab's columns are 4–5 full queries nobody is looking
    // at; they load when their tab opens (the effect below). Its Triage total stays hidden
    // until then — the unread badge beside it is still counted here.
    loadGenRef.current = `${filterKey}|${selectedDeptKey}|${String(refreshKey)}`;
    const colIds = COLUMNS.filter((col) => col.axis === activeTabRef.current).map((col) => {
      colLoadedGenRef.current[col.id] = loadGenRef.current;
      return col.id;
    });
    // A scope count describing the PREVIOUS filter is worse than none, because it reads as a
    // fact about what is on screen now — so it re-reads when the SCOPE changes. Not on a plain
    // refresh: it is the single heaviest read on the board (an aggregate over the whole org,
    // the top statement on a customer's database, 2026-10), and a card moving between lanes
    // leaves the board's union — and so `hidden` — where it was.
    // The flag is set only by an answer that landed, so a load cancelled by a quick re-run is
    // retried on the next refresh instead of leaving the board without its scope.
    if (scopeChanged) boardScopeLoadedRef.current = false;
    // Same triggers as the columns themselves, so the unread badge can never drift
    // out of step with the totals beside it.
    return loadBoard({
      colIds,
      keepDepth: !scopeChanged,
      unread: true,
      scope: !boardScopeLoadedRef.current,
      onScopeLoaded: () => {
        boardScopeLoadedRef.current = true;
      },
    });
  }, [filterKey, refreshKey, selectedDeptKey, loadBoard, setColStates]);

  // A tab opened: load its columns unless they already answered for the current scope/refresh.
  useEffect(() => {
    const stale = COLUMNS.filter(
      (col) => col.axis === activeTab && colLoadedGenRef.current[col.id] !== loadGenRef.current
    );
    if (stale.length === 0) return undefined;
    for (const col of stale) colLoadedGenRef.current[col.id] = loadGenRef.current;
    return loadBoard({
      colIds: stale.map((col) => col.id),
      keepDepth: true,
      unread: false,
      scope: false,
    });
  }, [activeTab, loadBoard]);

  // When ONE column's sort changes, reload only that column (diff vs the previous
  // snapshot). Avoids refetching all seven columns on a single per-column change.
  const prevColSortRef = useRef<Record<string, SortingState>>({});
  useEffect(() => {
    const prev = prevColSortRef.current;
    const cancels: Array<() => void> = [];
    for (const col of COLUMNS) {
      const before = prev[col.id];
      const after = colSort[col.id];
      if (after && (before?.sortBy !== after.sortBy || before?.sortOrder !== after.sortOrder)) {
        cancels.push(loadColumn(col.id));
      }
    }
    prevColSortRef.current = colSort;
    return () => cancels.forEach((cancel) => cancel());
    // colSortKey is a stable string proxy for colSort's contents.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colSortKey, loadColumn]);

  const loadMore = useCallback(
    (colId: string) => {
      const col = COLUMNS.find((kanbanCol) => kanbanCol.id === colId);
      if (!col) return;
      setColStates((prev) => ({ ...prev, [colId]: { ...prev[colId], loading: true } }));
      const nextPage = colStatesRef.current[colId].page + 1;
      const filterSnapshot = { ...sharedFiltersRef.current, ...col.fixedFilters };
      const sort = colSortRef.current[colId] ?? { sortBy: 'time', sortOrder: 'desc' };
      // The scope this page belongs to. A filter / team change resets the column to page 1 of
      // the new scope (the effect above), and so does a change of this column's sort (its own
      // reload); a page of the old scope or order landing after that is dropped, not appended to
      // the new one — the reset's own load owns the column's state now.
      const scopeAt = () => {
        const colSortNow = colSortRef.current[colId];
        return `${prevFilterKeyRef.current}|${prevDeptKeyRef.current}|${colSortNow?.sortBy}|${colSortNow?.sortOrder}`;
      };
      const scope = scopeAt();
      void (async () => {
        try {
          const res = await messageService.getThreads(
            filterSnapshot,
            nextPage,
            PAGE_SIZE,
            sort.sortOrder,
            sort.sortBy
          );
          if (scopeAt() !== scope) return;
          if (!res.success) {
            // Refused: stop "Loading…" so Load more can be pressed again (it stayed on forever).
            setColStates((prev) => ({ ...prev, [colId]: { ...prev[colId], loading: false } }));
            return;
          }
          setColStates((prev) => ({
            ...prev,
            [colId]: {
              // Offset pages shift when a row leaves the column, so the next page can
              // repeat one already shown; a duplicate key would confuse React's reconcile.
              threads: uniqueThreads([
                ...prev[colId].threads,
                ...res.data.filter((thread) => thread.latestMessage !== null),
              ]),
              total: res.pagination.total,
              totalCapped: res.pagination.totalCapped === true,
              loading: false,
              hasMore: res.pagination.page < res.pagination.totalPages,
              page: res.pagination.page,
            },
          }));
        } catch (err) {
          logger.error(`Failed to load more for column ${colId}:`, err);
          if (scopeAt() !== scope) return;
          setColStates((prev) => ({ ...prev, [colId]: { ...prev[colId], loading: false } }));
        }
      })();
    },
    [colSortRef, colStatesRef, setColStates, sharedFiltersRef]
  );

  return { activeTabRef, loadMore };
};
