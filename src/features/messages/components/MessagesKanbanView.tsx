import { forwardRef, useEffect } from 'react';
import { DndContext, DragOverlay, closestCenter } from '@dnd-kit/core';
import { type MessageThread } from '@/services/message.service';
import { type FilterState } from '@/features/messages/stores/messagesStore';
import { KanbanCard } from './KanbanCard';
import { COLUMNS, DRAGGABLE_COLS, DROPPABLE_COLS } from './kanbanColumns';
import { ApproveDropZone } from './kanbanBoard/ApproveDropZone';
import { KanbanBoardToolbar } from './kanbanBoard/KanbanBoardToolbar';
import { KanbanColumn } from './kanbanBoard/KanbanColumn';
import {
  ARRIVAL_KIND_BY_COL,
  HIDEABLE_COLS,
  countsTowardTriageBadge,
  notExact,
  type MessagesKanbanHandle,
} from './kanbanBoard/kanbanBoardModel';
import { useKanbanBoardData } from './kanbanBoard/useKanbanBoardData';
import { useKanbanBoardRefresh } from './kanbanBoard/useKanbanBoardRefresh';
import { useKanbanDrag } from './kanbanBoard/useKanbanDrag';

// Moved to kanbanBoard/ (F5 split); re-exported so every importer of this path keeps working.
export type { MessagesKanbanHandle } from './kanbanBoard/kanbanBoardModel';
export { uniqueThreads } from './kanbanBoard/kanbanBoardModel';

type MessagesKanbanViewProps = {
  filters: FilterState;
  onOpen: (thread: MessageThread) => void;
  refreshKey?: number;
  /**
   * Applies the lens holding a category the board cannot show. `needsListView` marks the
   * ones with no column at all — the caller must leave the board too, or the click sets a
   * filter and visibly does nothing, which is worse than not offering the link.
   */
  onScopeJump: (filters: Partial<FilterState>, needsListView?: boolean) => void;
  /**
   * How many threads the VISIBLE lanes hold, reported up so the page header can describe
   * the board instead of the list. Fires on tab switch and lane toggle as well as on
   * data, because all three change what the agent is actually looking at.
   */
  /** `partial`: a counted column did not finish, so `total` is a lower bound. */
  onTotalChange?: (total: number, partial: boolean) => void;
  /**
   * Bulk selection, owned by the page (it outlives a board refresh and is shared with the
   * action bar). Absent = no checkboxes: the board renders exactly as it did before.
   */
  isSelected?: (conversationId: number) => boolean;
  onToggleSelected?: (conversationId: number) => void;
  onToggleRange?: (conversationId: number, orderedIds: readonly number[]) => void;
  /** Anything is selected: every card shows its box, not only the hovered one. */
  selectMode?: boolean;
  onSelectMany?: (conversationIds: number[]) => void;
  onDeselectMany?: (conversationIds: number[]) => void;
};

export const MessagesKanbanView = forwardRef<MessagesKanbanHandle, MessagesKanbanViewProps>(
  (
    {
      filters,
      onOpen,
      refreshKey,
      onScopeJump,
      onTotalChange,
      isSelected,
      onToggleSelected,
      onToggleRange,
      selectMode,
      onSelectMany,
      onDeselectMany,
    },
    ref
  ) => {
    const {
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
    } = useKanbanBoardData(filters, ref);

    const { activeTabRef, loadMore } = useKanbanBoardRefresh({
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
    });

    const { sensors, handleDragStart, handleDragEnd } = useKanbanDrag({
      queryClient,
      colStatesRef,
      setColStates,
      setActiveThread,
      setActiveDragColId,
      activeTabRef,
      loadBoard,
    });

    /**
     * ⛔ FEATURE-GATED, for the same reason the board notice is — see `loadBoardScope`.
     *
     * The Other column asks for `view=no_lane`. A backend that predates it does not reject
     * that view, it DROPS it (`requestedView` returns undefined server-side) and answers with
     * the default browse lens, so the column would fill with ordinary open threads under the
     * heading "Other" — on every workspace, plausibly enough to survive a screenshot. The
     * frontend deploys on merge and the backend ships on a tag, so that skew is routine here,
     * not hypothetical.
     *
     * `scope.boardCoversAll` is the backend saying the column exists. Absent (old backend, a
     * failed scope request, or the notice's own feature-detect rejecting the shape) hides the
     * column. Hiding it is the safe direction: the rows are then exactly as reachable as they
     * were before this change, whereas showing it would be a new and confident lie.
     */
    const boardCoversAll = boardScope?.scope.boardCoversAll === true;
    const visibleColumns = COLUMNS.filter(
      (col) =>
        col.axis === activeTab &&
        !hiddenCols.has(col.id) &&
        (col.id !== 'no_lane' || boardCoversAll)
    );

    /**
     * The count the page header shows while the board is on screen.
     *
     * ⛔ Sum of the VISIBLE columns, not a fixed set. It has to follow the axis tab and the
     * lane toggles, or the header goes back to describing a question the screen is not
     * asking — which is the whole defect this reports away from.
     */
    const visibleTotal = visibleColumns.reduce(
      (sum, col) => sum + (colStates[col.id]?.unfinished ? 0 : (colStates[col.id]?.total ?? 0)),
      0
    );
    // A column that did not finish adds no number: the sum is then "at least" (review of #798).
    const visiblePartial = visibleColumns.some((col) => notExact(colStates[col.id]));
    useEffect(() => {
      onTotalChange?.(visibleTotal, visiblePartial);
    }, [visibleTotal, visiblePartial, onTotalChange]);

    // Triage-tab count badges: UNREAD first (what still needs a human's eyes), then
    // the all-items total. Both loaded even while the lifecycle board is showing, so
    // the badges stay live.
    //
    // The unread number cannot be derived from `colStates[].threads` — only the first
    // page is loaded (PAGE_SIZE), so counting `isRead === false` there would silently
    // undercount any queue deeper than one page and look plausible while being wrong.
    // It has to be a server-side count; see loadTriageUnread.
    const triageCount = COLUMNS.filter(countsTowardTriageBadge).reduce(
      (sum, col) => sum + (colStates[col.id]?.unfinished ? 0 : (colStates[col.id]?.total ?? 0)),
      0
    );
    const triagePartial = COLUMNS.filter(countsTowardTriageBadge).some((col) =>
      notExact(colStates[col.id])
    );
    // Board-tab count badge: active work across the non-reference lifecycle columns
    // (Open / In Progress / Pending). Excludes the hideable reference columns
    // (On-hold, Resolved) so the badge tracks live work, not the resolved archive.
    const boardCols = COLUMNS.filter(
      (col) => col.axis === 'lifecycle' && !HIDEABLE_COLS.has(col.id)
    );
    const boardCount = boardCols.reduce(
      (sum, col) => sum + (colStates[col.id]?.unfinished ? 0 : (colStates[col.id]?.total ?? 0)),
      0
    );
    const boardPartial = boardCols.some((col) => notExact(colStates[col.id]));

    return (
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={(event) => void handleDragEnd(event)}
      >
        <div className="space-y-3 xl:flex xl:flex-col xl:flex-1 xl:min-h-0">
          {/* Axis tabs: Board (lifecycle) | Triage (pre-lifecycle classification).
            On the Board, chips on the right show/hide the reference columns
            (On-hold, Resolved) so agents can focus on Open/In Progress/Pending.
            The scope notice — what the board has NO lane for — sits on this same row,
            after the tabs: it used to be a card of its own above them, and that row
            came straight out of the lanes' height. Still outside any empty-state branch,
            because an empty board while rows sit one lens away is the silence it removes. */}
          {/* One line, always. The scope caption is the element that yields width (it
            truncates); the tabs and all three Show counts are shrink-0. The counts move
            with the filter — they are how an agent sees that a search matched 1,352
            resolved threads — so they never go behind a menu. Holds at 1440 with the long
            sentence plus four-digit counts (Kanban space audit, 2026-09-07). */}
          <KanbanBoardToolbar
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            boardCount={boardCount}
            boardPartial={boardPartial}
            triageCount={triageCount}
            triagePartial={triagePartial}
            triageUnread={triageUnread}
            boardScope={boardScope}
            onScopeJump={onScopeJump}
            hiddenCols={hiddenCols}
            toggleCol={toggleCol}
            colStates={colStates}
          />

          {/* Approve bar — only on the Triage tab, only while a triaged card is dragged. */}
          {activeTab === 'triage' && <ApproveDropZone activeDragColId={activeDragColId} />}

          {/* No pb under the lanes: the 16px it reserved sat on top of the page frame's own
            16px, and overlay scrollbars need no room of their own. */}
          <div className="flex flex-col gap-4 xl:flex-row xl:flex-1 xl:min-h-0 xl:overflow-x-auto xl:gap-3">
            {visibleColumns.map((col) => (
              <KanbanColumn
                key={col.id}
                col={col}
                state={
                  colStates[col.id] ?? {
                    threads: [],
                    total: 0,
                    loading: true,
                    hasMore: false,
                    page: 1,
                  }
                }
                isDraggable={DRAGGABLE_COLS.has(col.id)}
                isDroppable={DROPPABLE_COLS.has(col.id)}
                activeDragColId={activeDragColId}
                activeThreadId={activeThread?.threadId ?? null}
                sort={getColSort(col.id)}
                onSortChange={(nextSort) => setColSort((prev) => ({ ...prev, [col.id]: nextSort }))}
                onLoadMore={() => loadMore(col.id)}
                onOpen={onOpen}
                isSelected={isSelected}
                onToggleSelected={onToggleSelected}
                onToggleRange={onToggleRange}
                selectMode={selectMode}
                onSelectMany={onSelectMany}
                onDeselectMany={onDeselectMany}
                newCount={
                  ARRIVAL_KIND_BY_COL[col.id]
                    ? (arrivalCounts[ARRIVAL_KIND_BY_COL[col.id]] ?? 0)
                    : 0
                }
                onClearNew={
                  ARRIVAL_KIND_BY_COL[col.id]
                    ? () => clearArrivalKind(ARRIVAL_KIND_BY_COL[col.id])
                    : undefined
                }
              />
            ))}
          </div>
        </div>

        <DragOverlay dropAnimation={null}>
          {activeThread ? (
            <div className="min-w-[260px] rounded-md shadow-xl rotate-1 opacity-95 cursor-grabbing">
              <KanbanCard thread={activeThread} onOpen={() => {}} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    );
  }
);
MessagesKanbanView.displayName = 'MessagesKanbanView';
