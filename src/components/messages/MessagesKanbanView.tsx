import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
import {
  Inbox,
  Hourglass,
  MessageCircle,
  CheckCircle2,
  RotateCcw,
  ShieldAlert,
  HelpCircle,
  GripVertical,
  Ban,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useDepartmentContextKey } from '@/hooks/useDepartmentContextKey';
import { messageService, type MessageThread } from '@/services/message.service';
import type { FilterState } from '@/stores/messagesStore';
import { KanbanCard } from './KanbanCard';
import { logger } from '@/lib/logger';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';

type KanbanColumnDef = {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  fixedFilters: Record<string, string>;
  accentColor: string;
  iconClass: string;
  emptyText: string;
};

const COLUMNS: KanbanColumnDef[] = [
  {
    id: 'active',
    label: 'Active',
    icon: Inbox,
    fixedFilters: { view: 'inbox', excludeNotAnalysed: 'true' },
    accentColor: '#3b82f6',
    iconClass: 'text-blue-500',
    emptyText: 'No active messages',
  },
  {
    id: 'not_analysed',
    label: 'Not Analysed',
    icon: HelpCircle,
    fixedFilters: { view: 'not_analysed' },
    accentColor: '#6b7280',
    iconClass: 'text-gray-500',
    emptyText: 'No unanalysed messages',
  },
  {
    id: 'suspicious',
    label: 'Suspicious',
    icon: ShieldAlert,
    fixedFilters: { view: 'suspicious' },
    accentColor: '#a855f7',
    iconClass: 'text-purple-500',
    emptyText: 'No suspicious messages',
  },
  {
    id: 'awaiting',
    label: 'Awaiting',
    icon: Hourglass,
    fixedFilters: {
      view: 'awaiting_response',
      excludeSuspicious: 'true',
      excludeNotAnalysed: 'true',
    },
    accentColor: '#f97316',
    iconClass: 'text-orange-500',
    emptyText: 'No awaiting messages',
  },
  {
    id: 'replied',
    label: 'Replied',
    icon: MessageCircle,
    fixedFilters: { view: 'client_replied', excludeSuspicious: 'true', excludeNotAnalysed: 'true' },
    accentColor: '#22c55e',
    iconClass: 'text-green-500',
    emptyText: 'No replied messages',
  },
  {
    id: 'spam',
    label: 'Spam',
    icon: Ban,
    fixedFilters: { showSpam: 'true' },
    accentColor: '#ef4444',
    iconClass: 'text-red-500',
    emptyText: 'No spam messages',
  },
  {
    id: 'resolved',
    label: 'Resolved / Closed',
    icon: CheckCircle2,
    fixedFilters: { view: 'resolved' }, // view='resolved' returns both resolved + closed (see messageFilters.ts)
    accentColor: '#9ca3af',
    iconClass: 'text-gray-400',
    emptyText: 'No resolved or closed messages',
  },
];

// Columns that participate in drag-and-drop
const DND_COLS = new Set(['active', 'not_analysed', 'suspicious', 'spam', 'resolved']);

// Valid drop targets per source column.
// not_analysed → active: approve + queues AI analysis (BE handles this automatically).
// not_analysed → suspicious: blocked by BE (filtered messages can't be marked suspicious directly).
// suspicious → spam: move_to_spam.
// spam → active: approve + queues AI analysis.
// resolved → active: reopen.
const VALID_TARGETS: Record<string, Set<string>> = {
  not_analysed: new Set(['active']),
  suspicious: new Set(['active', 'spam']),
  active: new Set(['suspicious', 'spam']),
  spam: new Set(['active']),
  resolved: new Set(['active']),
};

type DndAction = 'approve' | 'mark_suspicious' | 'move_to_spam' | 'reopen';

function getDndAction(from: string, to: string): DndAction | null {
  if ((from === 'not_analysed' || from === 'suspicious' || from === 'spam') && to === 'active')
    return 'approve';
  if (from === 'active' && to === 'suspicious') return 'mark_suspicious';
  if ((from === 'suspicious' || from === 'active') && to === 'spam') return 'move_to_spam';
  if (from === 'resolved' && to === 'active') return 'reopen';
  return null;
}

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
      <KanbanCard thread={thread} onOpen={onOpen} weRepliedLast={weRepliedLast} />
    </div>
  );
}

type KanbanColumnProps = {
  col: KanbanColumnDef;
  state: ColumnState;
  isDndEnabled: boolean;
  activeDragColId: string | null;
  activeThreadId: string | null;
  onLoadMore: () => void;
  onOpen: (thread: MessageThread) => void;
};

const KanbanColumn = ({
  col,
  state,
  isDndEnabled,
  activeDragColId,
  activeThreadId,
  onLoadMore,
  onOpen,
}: KanbanColumnProps) => {
  // Always call useDroppable — only attach ref when this column participates in DnD.
  // Without setNodeRef, the droppable has no bounding rect so collision detection ignores it.
  const { setNodeRef, isOver } = useDroppable({ id: col.id });
  const Icon = col.icon;

  // Only highlight when this column is a valid target for the currently dragged card.
  const isValidTarget =
    isDndEnabled &&
    activeDragColId !== null &&
    activeDragColId !== col.id &&
    (VALID_TARGETS[activeDragColId]?.has(col.id) ?? false);

  return (
    <div
      ref={isDndEnabled ? setNodeRef : undefined}
      className={cn(
        'flex flex-col w-full rounded-lg border-t-4 border border-border overflow-hidden md:min-w-[260px] md:flex-1 transition-colors',
        isValidTarget && isOver ? 'bg-muted/60' : 'bg-muted/30'
      )}
      style={{ borderTopColor: col.accentColor }}
      data-column={col.id}
    >
      {/* Column header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b bg-background">
        <Icon className={`w-4 h-4 shrink-0 ${col.iconClass}`} />
        <span className="flex-1 text-sm font-semibold">{col.label}</span>
        {!state.loading && (
          <span className="text-xs font-mono text-muted-foreground bg-muted rounded px-1.5 py-0.5">
            {state.total}
          </span>
        )}
      </div>

      {/* Cards */}
      <div className="flex flex-row overflow-x-auto gap-2 p-2 md:flex-col md:overflow-x-hidden md:overflow-y-auto md:flex-1 md:max-h-[calc(100vh-280px)]">
        {state.loading && state.threads.length === 0 ? (
          Array.from({ length: 3 }, (_, idx) => (
            <div
              key={idx}
              className="min-w-[260px] md:min-w-0 p-3 space-y-2 rounded-md border animate-pulse bg-card shrink-0"
            >
              <div className="w-3/4 h-3 rounded bg-muted" />
              <div className="w-1/2 h-3 rounded bg-muted" />
            </div>
          ))
        ) : state.threads.length === 0 ? (
          <p className="px-3 py-4 text-xs text-muted-foreground md:text-center">{col.emptyText}</p>
        ) : (
          <>
            {state.threads.map((thread) =>
              isDndEnabled && !thread.threadId.startsWith('spamlog_') ? (
                <div key={thread.threadId} className="min-w-[260px] md:min-w-0 shrink-0 md:shrink">
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
                  className="min-w-[260px] md:min-w-0 shrink-0 md:shrink"
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
                  />
                </div>
              )
            )}
            {isDndEnabled && activeThreadId !== null && <div className="min-h-[60px] shrink-0" />}
            {state.hasMore && (
              <button
                type="button"
                disabled={state.loading}
                onClick={onLoadMore}
                className="flex gap-1 justify-center items-center px-3 py-2 text-xs shrink-0 text-muted-foreground hover:text-foreground disabled:opacity-50 md:w-full"
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

const SWITCHABLE_COLUMNS = new Set(['not_analysed', 'spam', 'resolved', 'suspicious']);

const initialColStates = (): Record<string, ColumnState> =>
  Object.fromEntries(
    COLUMNS.map((col) => [
      col.id,
      { threads: [], total: 0, loading: true, hasMore: false, page: 1 },
    ])
  );

export const MessagesKanbanView = ({ filters, onOpen, refreshKey }: MessagesKanbanViewProps) => {
  const queryClient = useQueryClient();
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(
    new Set(['not_analysed', 'spam', 'resolved', 'suspicious'])
  );
  const [colStates, setColStates] = useState<Record<string, ColumnState>>(initialColStates);
  const [activeThread, setActiveThread] = useState<MessageThread | null>(null);
  const [activeDragColId, setActiveDragColId] = useState<string | null>(null);

  const sharedFilters = useMemo(() => buildSharedFilters(filters), [filters]);
  const filterKey = useMemo(() => JSON.stringify(sharedFilters), [sharedFilters]);

  const selectedDeptKey = useDepartmentContextKey();

  const colStatesRef = useRef(colStates);
  colStatesRef.current = colStates;
  const sharedFiltersRef = useRef(sharedFilters);
  sharedFiltersRef.current = sharedFilters;

  // Fetch all columns in parallel when filters change
  useEffect(() => {
    let cancelled = false;
    setColStates(initialColStates);

    COLUMNS.forEach((col) => {
      void (async () => {
        try {
          const res = await messageService.getThreads(
            { ...sharedFiltersRef.current, ...col.fixedFilters },
            1,
            PAGE_SIZE,
            'desc'
          );
          if (cancelled || !res.success) return;
          setColStates((prev) => ({
            ...prev,
            [col.id]: {
              threads: res.data.filter((thread) => thread.latestMessage !== null),
              total: res.pagination.total,
              loading: false,
              hasMore: res.pagination.page < res.pagination.totalPages,
              page: res.pagination.page,
            },
          }));
        } catch (err) {
          if (!cancelled) {
            logger.error(`Failed to fetch kanban column ${col.id}:`, err);
            setColStates((prev) => ({ ...prev, [col.id]: { ...prev[col.id], loading: false } }));
          }
        }
      })();
    });

    return () => {
      cancelled = true;
    };
  }, [filterKey, refreshKey, selectedDeptKey]);

  const loadMore = useCallback((colId: string) => {
    const col = COLUMNS.find((kanbanCol) => kanbanCol.id === colId);
    if (!col) return;
    setColStates((prev) => ({ ...prev, [colId]: { ...prev[colId], loading: true } }));
    const nextPage = colStatesRef.current[colId].page + 1;
    const filterSnapshot = { ...sharedFiltersRef.current, ...col.fixedFilters };
    void (async () => {
      try {
        const res = await messageService.getThreads(filterSnapshot, nextPage, PAGE_SIZE, 'desc');
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

  const toggleColumn = (id: string) => {
    setHiddenColumns((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

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

      // Optimistic move
      setColStates((prev) => ({
        ...prev,
        [fromColId]: {
          ...prev[fromColId],
          threads: prev[fromColId].threads.filter((thr) => thr.threadId !== threadId),
          total: Math.max(0, prev[fromColId].total - 1),
        },
        [toColId]: {
          ...prev[toColId],
          threads: [thread, ...prev[toColId].threads],
          total: prev[toColId].total + 1,
        },
      }));

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
          return {
            ...prev,
            [fromColId]: {
              ...prev[fromColId],
              threads: restored,
              total: prev[fromColId].total + 1,
            },
            [toColId]: {
              ...prev[toColId],
              threads: prev[toColId].threads.filter((thr) => thr.threadId !== threadId),
              total: Math.max(0, prev[toColId].total - 1),
            },
          };
        });
      }
    },
    [queryClient]
  );

  const visibleColumns = COLUMNS.filter((col) => !hiddenColumns.has(col.id));
  const switchableColumns = COLUMNS.filter((col) => SWITCHABLE_COLUMNS.has(col.id));

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={(event) => void handleDragEnd(event)}
    >
      <div className="space-y-3">
        {/* Column visibility toggles */}
        <div className="flex gap-2 items-center">
          <span className="text-xs text-muted-foreground">Show:</span>
          {switchableColumns.map((col) => {
            const Icon = col.icon;
            const visible = !hiddenColumns.has(col.id);
            return (
              <button
                key={col.id}
                type="button"
                onClick={() => toggleColumn(col.id)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
                  visible
                    ? 'border-transparent bg-muted text-foreground'
                    : 'border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon
                  className={cn(
                    'w-3 h-3',
                    visible && col.accentColor ? `text-${col.accentColor}` : ''
                  )}
                />
                {col.label}
              </button>
            );
          })}
        </div>

        <div className="flex flex-col gap-4 md:flex-row md:overflow-x-auto md:gap-3 md:pb-4">
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
              isDndEnabled={DND_COLS.has(col.id)}
              activeDragColId={activeDragColId}
              activeThreadId={activeThread?.threadId ?? null}
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
};
