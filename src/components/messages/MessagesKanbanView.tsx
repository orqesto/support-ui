// Over the 650-line cap: this file owns the whole kanban board — inline Draggable/
// Column subcomponents, the DnD move logic, per-column fetch/sort, and now the
// optimistic single-card move. Extracting the card/column subcomponents is the
// natural follow-up refactor; until then, disable the cap here (same as MessageDetailHeader).
/* eslint-disable max-lines */
import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  forwardRef,
  useImperativeHandle,
} from 'react';
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  closestCenter,
  useDroppable,
  useDraggable,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import { RotateCcw, GripVertical, ArrowRightCircle } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useDepartmentContextKey } from '@/hooks/useDepartmentContextKey';
import { messageService, type MessageThread } from '@/services/message.service';
import { type FilterState, type SortingState } from '@/stores/messagesStore';
import { ReactSelect } from '@/components/ui/ReactSelect';
import { SORT_PRESET_OPTIONS, sortingToPreset, presetToSorting } from './sortPresets';
import { KanbanCard } from './KanbanCard';
import { logger } from '@/lib/logger';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import {
  COLUMNS,
  APPROVE_TARGET,
  DRAGGABLE_COLS,
  DROPPABLE_COLS,
  VALID_TARGETS,
  getDndAction,
  type ColumnAxis,
  type KanbanColumnDef,
} from './kanbanColumns';

const PAGE_SIZE = 20;

function buildSharedFilters(filters: FilterState): Record<string, string> {
  const api: Record<string, string> = {};
  if (filters.messageSourceId && filters.messageSourceId !== 'all')
    api.messageSourceId = filters.messageSourceId;
  // 'needs_routing' sentinel is a view override, not a dept filter — handled at
  // the column level (a future 'needs_routing' column). For now, treat it as a
  // pass-through dept selector and rely on the column's fixedFilters.
  if (
    filters.departmentId &&
    filters.departmentId !== 'all' &&
    filters.departmentId !== 'needs_routing'
  )
    api.departmentId = filters.departmentId;
  if (filters.priority && filters.priority !== 'all') api.priority = filters.priority;
  if (filters.assigneeId && filters.assigneeId !== 'all')
    api.assigneeId = filters.assigneeId === 'unassigned' ? '0' : filters.assigneeId;
  if (filters.aiState === 'needs_review') api.needsHumanReview = 'true';
  else if (filters.aiState === 'needs_info') api.showNeedsInfo = 'true';
  else if (filters.aiState === 'ai_suggested') api.aiSuggested = 'true';
  else if (filters.aiState === 'bot_handled') api.botHandled = 'true';
  else if (filters.aiState === 'lead') api.isLead = 'true';
  else if (filters.aiState === 'contradiction') api.hasContradiction = 'true';
  if (filters.labelId && filters.labelId !== 'all') api.labelId = filters.labelId;
  // SLA toggles — same params the list view sends; every column spreads these.
  if (filters.slaBreached) api.slaBreached = 'true';
  if (filters.slaAtRisk) api.slaAtRisk = 'true';
  if (filters.linked === 'has_ticket') api.hasTicket = 'true';
  else if (filters.linked === 'has_jira') api.hasJiraTicket = 'true';
  if (filters.threadStatus && filters.threadStatus !== 'all')
    api.processed = filters.threadStatus as string;
  if (filters.search?.trim()) api.search = filters.search.trim();
  return api;
}

type ColumnState = {
  threads: MessageThread[];
  total: number;
  loading: boolean;
  hasMore: boolean;
  page: number;
};

// Draggable wrapper — only rendered for DND_COLS
function DraggableMessageCard({
  thread,
  colId,
  onOpen,
  weRepliedLast,
}: {
  thread: MessageThread;
  colId: string;
  onOpen: (t: MessageThread) => void;
  weRepliedLast?: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: thread.threadId,
    data: { colId },
  });

  return (
    <div
      ref={setNodeRef}
      className={`group relative touch-manipulation ${isDragging ? 'opacity-30' : ''}`}
    >
      {/* Grip is the drag handle — listeners on the grip only, not the wrapper,
          so the card body keeps native text-selection + click-to-open. opacity-30
          at rest (discoverable on hover) → opacity-80 on hover. */}
      <button
        type="button"
        aria-label="Drag to move card"
        {...attributes}
        {...listeners}
        className="absolute top-1.5 right-1.5 z-10 p-1 rounded text-muted-foreground opacity-30 group-hover:opacity-80 transition-opacity cursor-grab active:cursor-grabbing focus:outline-none focus-visible:ring-1 focus-visible:ring-primary"
      >
        <GripVertical className="w-3.5 h-3.5" />
      </button>
      <KanbanCard thread={thread} onOpen={onOpen} weRepliedLast={weRepliedLast} colId={colId} />
    </div>
  );
}

type KanbanColumnProps = {
  col: KanbanColumnDef;
  state: ColumnState;
  isDraggable: boolean;
  isDroppable: boolean;
  activeDragColId: string | null;
  activeThreadId: string | null;
  sort: SortingState;
  onSortChange: (sorting: SortingState) => void;
  onLoadMore: () => void;
  onOpen: (thread: MessageThread) => void;
};

const KanbanColumn = ({
  col,
  state,
  isDraggable,
  isDroppable,
  activeDragColId,
  activeThreadId,
  sort,
  onSortChange,
  onLoadMore,
  onOpen,
}: KanbanColumnProps) => {
  // Always call useDroppable — only attach ref when this column can receive a drop.
  // Without setNodeRef, the droppable has no bounding rect so collision detection ignores it.
  const { setNodeRef, isOver } = useDroppable({ id: col.id });
  const Icon = col.icon;

  // Only highlight when this column is a valid target for the currently dragged card.
  const isValidTarget =
    isDroppable &&
    activeDragColId !== null &&
    activeDragColId !== col.id &&
    (VALID_TARGETS[activeDragColId]?.has(col.id) ?? false);

  return (
    <div
      ref={isDroppable ? setNodeRef : undefined}
      className={cn(
        // lg:h-full: the column fills the flex-bounded board height (set by the
        // page → kanban-root → column-row chain), so every column is uniform full
        // height; the cards body below flex-fills + scrolls inside it. No page scroll.
        'flex flex-col w-full rounded-lg border-t-4 border border-border overflow-hidden lg:min-w-[260px] lg:flex-1 lg:h-full transition-colors',
        isValidTarget && isOver ? 'bg-muted/60' : 'bg-muted/30'
      )}
      style={{ borderTopColor: col.accentColor }}
      data-column={col.id}
    >
      {/* Column header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b bg-background">
        <Icon className={`w-4 h-4 shrink-0 ${col.iconClass}`} />
        <span className="flex-1 min-w-0 text-sm font-semibold truncate">{col.label}</span>
        {!state.loading && (
          <span className="text-xs font-mono text-muted-foreground bg-muted rounded px-1.5 py-0.5 shrink-0">
            {state.total}
          </span>
        )}
        {/* Per-column sort — each column sorts independently. Compact chip select
            keeps the header tight; icon-only trigger avoids crowding the label. */}
        <ReactSelect
          variant="chip"
          value={sortingToPreset(sort)}
          onChange={(value) => onSortChange(presetToSorting(value))}
          options={SORT_PRESET_OPTIONS}
          isSearchable={false}
          aria-label={`Sort ${col.label} column`}
          className="shrink-0"
        />
      </div>

      {/* Cards */}
      <div className="flex flex-row overflow-x-auto gap-2 p-2 lg:flex-col lg:overflow-x-hidden lg:overflow-y-auto lg:flex-1 lg:min-h-0">
        {state.loading && state.threads.length === 0 ? (
          Array.from({ length: 3 }, (_, idx) => (
            <div
              key={idx}
              className="min-w-[260px] lg:min-w-0 p-3 space-y-2 rounded-md border animate-pulse bg-card shrink-0"
            >
              <div className="w-3/4 h-3 rounded bg-muted" />
              <div className="w-1/2 h-3 rounded bg-muted" />
            </div>
          ))
        ) : state.threads.length === 0 ? (
          <p className="px-3 py-4 text-xs text-muted-foreground lg:text-center">{col.emptyText}</p>
        ) : (
          <>
            {state.threads.map((thread) =>
              isDraggable && !thread.threadId.startsWith('spamlog_') ? (
                <div key={thread.threadId} className="min-w-[260px] lg:min-w-0 shrink-0 lg:shrink">
                  <DraggableMessageCard
                    thread={thread}
                    colId={col.id}
                    onOpen={onOpen}
                    weRepliedLast={col.id === 'awaiting'}
                  />
                </div>
              ) : (
                <div
                  key={thread.threadId}
                  className="min-w-[260px] lg:min-w-0 shrink-0 lg:shrink"
                  title={
                    thread.threadId.startsWith('spamlog_')
                      ? 'Rule-blocked — cannot be moved'
                      : undefined
                  }
                >
                  <KanbanCard
                    thread={thread}
                    onOpen={onOpen}
                    weRepliedLast={col.id === 'awaiting'}
                    colId={col.id}
                  />
                </div>
              )
            )}
            {isDroppable && activeThreadId !== null && <div className="min-h-[60px] shrink-0" />}
            {state.hasMore && (
              <button
                type="button"
                disabled={state.loading}
                onClick={onLoadMore}
                className="flex gap-1 justify-center items-center px-3 py-2 text-xs shrink-0 text-muted-foreground hover:text-foreground disabled:opacity-50 lg:w-full"
              >
                <RotateCcw className="w-3 h-3" />
                {state.loading ? 'Loading…' : 'Load more'}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
};

type MessagesKanbanViewProps = {
  filters: FilterState;
  onOpen: (thread: MessageThread) => void;
  refreshKey?: number;
};

export type MessagesKanbanHandle = {
  /**
   * Optimistically move a single card to its new lifecycle column WITHOUT
   * refetching the whole board — the instant-feedback path for the acting agent's
   * own reply / resolve / close. `targetColId` null just removes the card (it left
   * the lifecycle board, e.g. classified to a triage queue). A no-op if the card
   * isn't currently on the board. The card's column-derived badge + spine follow
   * the destination column, so no server round-trip is needed to render correctly.
   */
  optimisticMove: (threadId: string, targetColId: string | null) => void;
};

// Column-implied conversation state, so a moved card's spine/direction (which read
// the thread's own lastReplyFromClient) match the destination column immediately.
const COL_STATE_PATCH: Record<string, Partial<MessageThread>> = {
  open: { lastReplyFromClient: null },
  in_progress: { lastReplyFromClient: true },
  awaiting: { lastReplyFromClient: false },
  resolved: { isResolved: true },
};

const initialColStates = (): Record<string, ColumnState> =>
  Object.fromEntries(
    COLUMNS.map((col) => [
      col.id,
      { threads: [], total: 0, loading: true, hasMore: false, page: 1 },
    ])
  );

// Lifecycle columns the agent can hide to focus on live work. Open/In Progress/
// Pending are always shown; On-hold (paused) and Resolved (done) are reference
// columns, so they're toggleable. Preference persists per browser.
const HIDEABLE_COLS = new Set(['on_hold', 'resolved']);
const HIDDEN_COLS_KEY = 'kanban_hidden_cols';

const loadHiddenCols = (): Set<string> => {
  try {
    const raw = localStorage.getItem(HIDDEN_COLS_KEY);
    // Default (no saved preference): On-hold + Resolved hidden, so the board opens
    // focused on live work (Open / In Progress / Pending). Once the agent toggles,
    // their choice is saved and wins.
    return raw
      ? new Set((JSON.parse(raw) as string[]).filter((id) => HIDEABLE_COLS.has(id)))
      : new Set(HIDEABLE_COLS);
  } catch {
    return new Set(HIDEABLE_COLS);
  }
};

// Triage-tab approve bar: drop a triaged card here to approve it (classify='approve').
// The item then leaves triage and re-enters the lifecycle at "Open". Rendered only
// while a triaged card that CAN be approved is being dragged, so it's non-intrusive.
const ApproveDropZone = ({ activeDragColId }: { activeDragColId: string | null }) => {
  const { setNodeRef, isOver } = useDroppable({ id: APPROVE_TARGET });
  const canApprove =
    activeDragColId !== null && (VALID_TARGETS[activeDragColId]?.has(APPROVE_TARGET) ?? false);
  if (!canApprove) return null;
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex items-center justify-center gap-2 rounded-lg border-2 border-dashed py-3 text-sm font-medium transition-colors',
        isOver
          ? 'border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
          : 'border-border text-muted-foreground'
      )}
    >
      <ArrowRightCircle className="w-4 h-4" />
      Drop here to approve → moves to Open
    </div>
  );
};

export const MessagesKanbanView = forwardRef<MessagesKanbanHandle, MessagesKanbanViewProps>(
  ({ filters, onOpen, refreshKey }, ref) => {
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
  const [activeThread, setActiveThread] = useState<MessageThread | null>(null);
  const [activeDragColId, setActiveDragColId] = useState<string | null>(null);

  // Per-column sort — each column sorts independently (kanban no longer reads the
  // global store `sorting`, which the list view still owns). Falls back to
  // newest-first for any column the user hasn't touched.
  const DEFAULT_COL_SORT: SortingState = { sortBy: 'time', sortOrder: 'desc' };
  const [colSort, setColSort] = useState<Record<string, SortingState>>({});
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

  const colStatesRef = useRef(colStates);
  colStatesRef.current = colStates;
  const sharedFiltersRef = useRef(sharedFilters);
  sharedFiltersRef.current = sharedFilters;
  const colSortRef = useRef(colSort);
  colSortRef.current = colSort;

  // Load (reset to page 1) a single column with ITS current sort. Reads sort +
  // filters from refs so the identity stays stable and effects can call it freely.
  const loadColumn = useCallback((colId: string) => {
    const col = COLUMNS.find((kanbanCol) => kanbanCol.id === colId);
    if (!col) return () => {};
    let cancelled = false;
    setColStates((prev) => ({ ...prev, [colId]: { ...prev[colId], loading: true } }));
    const sort = colSortRef.current[colId] ?? { sortBy: 'time', sortOrder: 'desc' };
    const requestFilters = { ...sharedFiltersRef.current, ...col.fixedFilters };
    void (async () => {
      try {
        const res = await messageService.getThreads(
          requestFilters,
          1,
          PAGE_SIZE,
          sort.sortOrder,
          sort.sortBy
        );
        if (cancelled || !res.success) return;
        setColStates((prev) => ({
          ...prev,
          [colId]: {
            threads: res.data.filter((thread) => thread.latestMessage !== null),
            total: res.pagination.total,
            loading: false,
            hasMore: res.pagination.page < res.pagination.totalPages,
            page: res.pagination.page,
          },
        }));
      } catch (err) {
        if (!cancelled) {
          logger.error(`Failed to fetch kanban column ${colId}:`, err);
          setColStates((prev) => ({ ...prev, [colId]: { ...prev[colId], loading: false } }));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Optimistic single-card move — pull the card out of whichever column currently
  // holds it and drop it into the destination column, all in local state. No column
  // refetch (unlike bumpKanban), so the acting agent sees the card jump the instant
  // their reply/resolve/close succeeds. The next authoritative reload (if any) simply
  // confirms the same placement, so there's no visible second jump.
  const optimisticMove = useCallback((threadId: string, targetColId: string | null) => {
    setColStates((prev) => {
      let moved: MessageThread | undefined;
      const next: Record<string, ColumnState> = {};
      for (const [colId, state] of Object.entries(prev)) {
        const idx = state.threads.findIndex((thr) => thr.threadId === threadId);
        if (idx >= 0) {
          moved = state.threads[idx];
          next[colId] = {
            ...state,
            threads: state.threads.filter((thr) => thr.threadId !== threadId),
            total: Math.max(0, state.total - 1),
          };
        } else {
          next[colId] = state;
        }
      }
      // Card isn't on the loaded board (off-page / different filter) — nothing to do.
      if (!moved) return prev;
      if (targetColId && next[targetColId]) {
        const patched: MessageThread = { ...moved, ...COL_STATE_PATCH[targetColId] };
        next[targetColId] = {
          ...next[targetColId],
          threads: [patched, ...next[targetColId].threads],
          total: next[targetColId].total + 1,
        };
      }
      return next;
    });
  }, []);

  useImperativeHandle(ref, () => ({ optimisticMove }), [optimisticMove]);

  // Fetch all columns in parallel when shared filters / refresh / dept change.
  // A filter/dept change invalidates the current rows → wipe to skeletons first. A
  // plain refreshKey bump (post-action reconcile) reloads IN PLACE: loadColumn keeps
  // the existing threads visible (loading flag only) until fresh data arrives, so an
  // optimistically-moved card doesn't flash away and back.
  const prevFilterKeyRef = useRef(filterKey);
  const prevDeptKeyRef = useRef(selectedDeptKey);
  useEffect(() => {
    const scopeChanged =
      prevFilterKeyRef.current !== filterKey || prevDeptKeyRef.current !== selectedDeptKey;
    prevFilterKeyRef.current = filterKey;
    prevDeptKeyRef.current = selectedDeptKey;
    if (scopeChanged) setColStates(initialColStates);
    const cancels = COLUMNS.map((col) => loadColumn(col.id));
    return () => cancels.forEach((cancel) => cancel());
  }, [filterKey, refreshKey, selectedDeptKey, loadColumn]);

  // When ONE column's sort changes, reload only that column (diff vs the previous
  // snapshot). Avoids refetching all seven columns on a single per-column change.
  const prevColSortRef = useRef<Record<string, SortingState>>({});
  useEffect(() => {
    const prev = prevColSortRef.current;
    const cancels: Array<() => void> = [];
    for (const col of COLUMNS) {
      const before = prev[col.id];
      const after = colSort[col.id];
      if (
        after &&
        (before?.sortBy !== after.sortBy || before?.sortOrder !== after.sortOrder)
      ) {
        cancels.push(loadColumn(col.id));
      }
    }
    prevColSortRef.current = colSort;
    return () => cancels.forEach((cancel) => cancel());
    // colSortKey is a stable string proxy for colSort's contents.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colSortKey, loadColumn]);

  const loadMore = useCallback((colId: string) => {
    const col = COLUMNS.find((kanbanCol) => kanbanCol.id === colId);
    if (!col) return;
    setColStates((prev) => ({ ...prev, [colId]: { ...prev[colId], loading: true } }));
    const nextPage = colStatesRef.current[colId].page + 1;
    const filterSnapshot = { ...sharedFiltersRef.current, ...col.fixedFilters };
    const sort = colSortRef.current[colId] ?? { sortBy: 'time', sortOrder: 'desc' };
    void (async () => {
      try {
        const res = await messageService.getThreads(
          filterSnapshot,
          nextPage,
          PAGE_SIZE,
          sort.sortOrder,
          sort.sortBy
        );
        if (!res.success) return;
        setColStates((prev) => ({
          ...prev,
          [colId]: {
            threads: [
              ...prev[colId].threads,
              ...res.data.filter((thread) => thread.latestMessage !== null),
            ],
            total: res.pagination.total,
            loading: false,
            hasMore: res.pagination.page < res.pagination.totalPages,
            page: res.pagination.page,
          },
        }));
      } catch (err) {
        logger.error(`Failed to load more for column ${colId}:`, err);
        setColStates((prev) => ({ ...prev, [colId]: { ...prev[colId], loading: false } }));
      }
    })();
  }, []);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } })
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const threadId = event.active.id as string;
    const colId = event.active.data.current?.colId as string;
    const thread = colStatesRef.current[colId]?.threads.find((thr) => thr.threadId === threadId);
    setActiveThread(thread ?? null);
    setActiveDragColId(colId);
  }, []);

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveThread(null);
      setActiveDragColId(null);

      if (!over) return;

      const threadId = active.id as string;
      const fromColId = active.data.current?.colId as string;
      const toColId = over.id as string;

      if (fromColId === toColId) return;

      const action = getDndAction(fromColId, toColId);
      if (!action) return;

      const thread = colStatesRef.current[fromColId]?.threads.find(
        (thr) => thr.threadId === threadId
      );
      if (!thread?.latestMessage) return;

      // Spam-log synthetic threads have negative message IDs and cannot be classified
      // via the API. Guard here to prevent a silent 400 error and confusing card jump.
      const msgId = thread.latestMessage.id;
      if (threadId.startsWith('spamlog_') || msgId <= 0) {
        logger.warn(`Attempted DnD on spam-log synthetic thread ${threadId} — no-op`);
        return;
      }

      // Capture original index before optimistic move so rollback restores the card
      // to its original position rather than prepending at index 0.
      const originalIndex = colStatesRef.current[fromColId].threads.findIndex(
        (thr) => thr.threadId === threadId
      );

      // Optimistic move. "Approve" has no destination column (the item leaves triage
      // and enters the lifecycle at "Open" on the other tab), so only add to a real,
      // currently-loaded destination column.
      setColStates((prev) => {
        const next: Record<string, ColumnState> = {
          ...prev,
          [fromColId]: {
            ...prev[fromColId],
            threads: prev[fromColId].threads.filter((thr) => thr.threadId !== threadId),
            total: Math.max(0, prev[fromColId].total - 1),
          },
        };
        if (toColId !== APPROVE_TARGET && prev[toColId]) {
          next[toColId] = {
            ...prev[toColId],
            threads: [thread, ...prev[toColId].threads],
            total: prev[toColId].total + 1,
          };
        }
        return next;
      });

      try {
        if (action === 'reopen') {
          await messageService.reopen(msgId);
        } else {
          await messageService.classify(msgId, action);
          // approve/move_to_spam on a needs_routing conv changes the badge — invalidate
          // so the sidebar count doesn't lag behind the 60s auto-refetch interval.
          void queryClient.invalidateQueries({ queryKey: ['needs-routing-count'] });
        }
      } catch (err) {
        logger.error(`Failed to move thread ${threadId} from ${fromColId} to ${toColId}:`, err);
        // Surface the server reason (e.g. a 409 "cannot be reopened") — the optimistic
        // move is about to roll back, so without this the card silently snaps back.
        toast.failure(action === 'reopen' ? 'reopen message' : 'move message', err);
        // Rollback: restore card at its original position
        setColStates((prev) => {
          const restored = [...prev[fromColId].threads];
          restored.splice(Math.min(originalIndex, restored.length), 0, thread);
          const next: Record<string, ColumnState> = {
            ...prev,
            [fromColId]: {
              ...prev[fromColId],
              threads: restored,
              total: prev[fromColId].total + 1,
            },
          };
          if (toColId !== APPROVE_TARGET && prev[toColId]) {
            next[toColId] = {
              ...prev[toColId],
              threads: prev[toColId].threads.filter((thr) => thr.threadId !== threadId),
              total: Math.max(0, prev[toColId].total - 1),
            };
          }
          return next;
        });
      }
    },
    [queryClient]
  );

  const visibleColumns = COLUMNS.filter(
    (col) => col.axis === activeTab && !hiddenCols.has(col.id)
  );
  // Triage-tab count badge: total across all triage queues (loaded even while the
  // lifecycle board is showing, so the badge is always live).
  const triageCount = COLUMNS.filter((col) => col.axis === 'triage').reduce(
    (sum, col) => sum + (colStates[col.id]?.total ?? 0),
    0
  );
  // Board-tab count badge: active work across the non-reference lifecycle columns
  // (Open / In Progress / Pending). Excludes the hideable reference columns
  // (On-hold, Resolved) so the badge tracks live work, not the resolved archive.
  const boardCount = COLUMNS.filter(
    (col) => col.axis === 'lifecycle' && !HIDEABLE_COLS.has(col.id)
  ).reduce((sum, col) => sum + (colStates[col.id]?.total ?? 0), 0);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={(event) => void handleDragEnd(event)}
    >
      <div className="space-y-3 lg:flex lg:flex-col lg:flex-1 lg:min-h-0">
        {/* Axis tabs: Board (lifecycle) | Triage (pre-lifecycle classification).
            On the Board, chips on the right show/hide the reference columns
            (On-hold, Resolved) so agents can focus on Open/In Progress/Pending. */}
        <div className="flex flex-wrap gap-2 justify-between items-center">
          <div className="flex gap-1 items-center">
            {(['lifecycle', 'triage'] as const).map((axis) => {
              const isActive = activeTab === axis;
              const count = axis === 'lifecycle' ? boardCount : triageCount;
              return (
                <button
                  key={axis}
                  type="button"
                  onClick={() => setActiveTab(axis)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-muted text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {axis === 'lifecycle' ? 'Board' : 'Triage'}
                  {count > 0 && (
                    <span
                      className={cn(
                        'inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[11px] font-semibold',
                        axis === 'triage'
                          ? isActive
                            ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300'
                            : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                          : isActive
                            ? 'bg-foreground/15 text-foreground'
                            : 'bg-muted-foreground/15 text-muted-foreground'
                      )}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {activeTab === 'lifecycle' && (
            <div className="flex gap-1.5 items-center text-xs">
              <span className="text-muted-foreground">Show:</span>
              {COLUMNS.filter((col) => HIDEABLE_COLS.has(col.id)).map((col) => {
                const shown = !hiddenCols.has(col.id);
                const Icon = col.icon;
                return (
                  <button
                    key={col.id}
                    type="button"
                    onClick={() => toggleCol(col.id)}
                    aria-pressed={shown}
                    className={cn(
                      'flex items-center gap-1 px-2 py-0.5 rounded border font-medium transition-colors',
                      shown
                        ? 'border-transparent bg-muted text-foreground'
                        : 'border-border text-muted-foreground hover:text-foreground'
                    )}
                  >
                    <Icon className="w-3 h-3" />
                    {col.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Approve bar — only on the Triage tab, only while a triaged card is dragged. */}
        {activeTab === 'triage' && <ApproveDropZone activeDragColId={activeDragColId} />}

        <div className="flex flex-col gap-4 lg:flex-row lg:flex-1 lg:min-h-0 lg:overflow-x-auto lg:gap-3 lg:pb-4">
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
              onSortChange={(nextSort) =>
                setColSort((prev) => ({ ...prev, [col.id]: nextSort }))
              }
              onLoadMore={() => loadMore(col.id)}
              onOpen={onOpen}
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
