import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  useDroppable,
  useDraggable,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  Ticket,
  Loader2,
  Clock,
  CheckCircle2,
  XCircle,
  Hourglass,
  RotateCcw,
  User,
  GripVertical,
} from 'lucide-react';
import { ticketService } from '@/services/ticket.service';
import { Badge } from '@/components/ui/Badge';
import { formatAge } from '@/lib/utils';
import { logger } from '@/lib/logger';
import type { Ticket as TicketType, TicketStatus } from '@/types';

type KanbanColumnDef = {
  id: string;
  status: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  accentColor: string;
  iconClass: string;
  emptyText: string;
};

const COLUMNS: KanbanColumnDef[] = [
  {
    id: 'open',
    status: 'open',
    label: 'Open',
    icon: Ticket,
    accentColor: '#3b82f6',
    iconClass: 'text-blue-500',
    emptyText: 'No open tickets',
  },
  {
    id: 'in_progress',
    status: 'in_progress',
    label: 'In Progress',
    icon: Loader2,
    accentColor: '#f59e0b',
    iconClass: 'text-amber-500',
    emptyText: 'No tickets in progress',
  },
  {
    id: 'pending',
    status: 'pending',
    label: 'Pending',
    icon: Hourglass,
    accentColor: '#8b5cf6',
    iconClass: 'text-violet-500',
    emptyText: 'No pending tickets',
  },
  {
    id: 'resolved',
    status: 'resolved',
    label: 'Resolved',
    icon: CheckCircle2,
    accentColor: '#22c55e',
    iconClass: 'text-green-500',
    emptyText: 'No resolved tickets',
  },
  {
    id: 'closed',
    status: 'closed',
    label: 'Closed',
    icon: XCircle,
    accentColor: '#9ca3af',
    iconClass: 'text-gray-400',
    emptyText: 'No closed tickets',
  },
];

const PRIORITY_VARIANT = {
  critical: 'danger',
  high: 'warning',
  medium: 'secondary',
  low: 'default',
} as const;

const PAGE_SIZE = 20;

type ColumnState = {
  tickets: TicketType[];
  total: number;
  loading: boolean;
  hasMore: boolean;
  page: number;
};

type SharedFilters = Record<string, string>;

// Runtime extras that the API returns but are not in the base Ticket type
type TicketRuntimeExtras = {
  assignee?: { name?: string; email?: string };
  jiraKey?: string;
};
type TicketWithExtras = TicketType & TicketRuntimeExtras;

// Shared card content used by both draggable cards and the drag overlay ghost
function TicketCardContent({ ticket }: { ticket: TicketType }) {
  const priorityVariant = PRIORITY_VARIANT[ticket.priority as keyof typeof PRIORITY_VARIANT] ?? 'default';
  const t = ticket as TicketWithExtras;

  return (
    <div className="space-y-1.5">
      <p className="text-sm font-semibold leading-snug line-clamp-2 pr-5">{ticket.title}</p>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className="font-mono">#{ticket.id}</span>
        <span>·</span>
        <Clock className="w-3 h-3" />
        <span>{formatAge(ticket.createdAt)}</span>
      </div>
      <div className="flex gap-1 items-center flex-wrap">
        <Badge variant={priorityVariant} className="h-4 px-1 text-[10px]">
          {ticket.priority}
        </Badge>
        {t.assignee && (
          <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
            <User className="w-2.5 h-2.5" />
            {t.assignee.name ?? t.assignee.email}
          </span>
        )}
        {t.jiraKey && (
          <span className="text-[10px] font-mono text-blue-500">{t.jiraKey}</span>
        )}
      </div>
    </div>
  );
}

function TicketKanbanCard({
  ticket,
  colId,
  onOpen,
}: {
  ticket: TicketType;
  colId: string;
  onOpen: (t: TicketType) => void;
}) {
  // When using DragOverlay, do NOT apply transform to the original card.
  // The overlay handles the floating visual; the original becomes a semi-transparent placeholder.
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: ticket.id,
    data: { colId },
  });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`min-w-[240px] md:min-w-0 shrink-0 md:shrink relative rounded-md border bg-card shadow-sm transition-all cursor-grab active:cursor-grabbing touch-none select-none ${isDragging ? 'opacity-30' : 'hover:shadow-md hover:border-primary/40'}`}
    >
      {/* Grip hint — always visible, stronger on hover */}
      <GripVertical className="absolute top-2 right-2 w-3.5 h-3.5 text-muted-foreground/30 hover:text-muted-foreground/70 pointer-events-none" />

      {/* distance:8 activation means short taps still fire onClick without starting a drag */}
      <button
        type="button"
        onClick={() => onOpen(ticket)}
        className="w-full text-left p-3"
      >
        <TicketCardContent ticket={ticket} />
      </button>
    </div>
  );
}

type KanbanColumnProps = {
  col: KanbanColumnDef;
  state: ColumnState;
  activeTicketId: number | null;
  onLoadMore: () => void;
  onOpen: (ticket: TicketType) => void;
};

const KanbanColumn = ({ col, state, activeTicketId, onLoadMore, onOpen }: KanbanColumnProps) => {
  const { setNodeRef, isOver } = useDroppable({ id: col.id });
  const Icon = col.icon;

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col w-full rounded-lg border-t-4 border border-border overflow-hidden md:min-w-[240px] md:max-w-[300px] md:flex-1 transition-colors ${isOver ? 'bg-muted/60' : 'bg-muted/30'}`}
      style={{ borderTopColor: col.accentColor }}
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
      <div
        className="flex flex-row overflow-x-auto gap-2 p-2 md:flex-col md:overflow-x-hidden md:overflow-y-auto md:flex-1 md:max-h-[calc(100vh-280px)]"
      >
        {state.loading && state.tickets.length === 0 ? (
          Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="min-w-[240px] md:min-w-0 p-3 space-y-2 rounded-md border animate-pulse bg-card shrink-0">
              <div className="w-3/4 h-3 rounded bg-muted" />
              <div className="w-1/2 h-3 rounded bg-muted" />
            </div>
          ))
        ) : state.tickets.length === 0 ? (
          <div className={`py-4 px-3 flex-1 rounded-md transition-colors ${isOver ? 'bg-muted/40 border-2 border-dashed border-border' : ''}`}>
            <p className="text-xs text-muted-foreground md:text-center">{col.emptyText}</p>
          </div>
        ) : (
          <>
            {state.tickets.map((ticket) => (
              <TicketKanbanCard
                key={ticket.id}
                ticket={ticket}
                colId={col.id}
                onOpen={onOpen}
              />
            ))}
            {/* Drop target padding so there's always somewhere to drop at the bottom */}
            {activeTicketId !== null && (
              <div className="min-h-[60px] shrink-0" />
            )}
            {state.hasMore && (
              <button
                type="button"
                disabled={state.loading}
                onClick={onLoadMore}
                className="flex gap-1 justify-center items-center shrink-0 px-3 py-2 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50 md:w-full"
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

type TicketsKanbanViewProps = {
  filters: {
    priority?: string;
    assigneeId?: string;
    categoryId?: string;
    labelId?: string;
    search?: string;
    linked?: string;
  };
  onOpen: (ticket: TicketType) => void;
};

const initialColStates = (): Record<string, ColumnState> =>
  Object.fromEntries(
    COLUMNS.map((c) => [c.id, { tickets: [], total: 0, loading: true, hasMore: false, page: 1 }])
  );

export const TicketsKanbanView = ({ filters, onOpen }: TicketsKanbanViewProps) => {
  // Memoize to avoid rebuilding on every parent re-render (colStates updates, etc.)
  const sharedFilters = useMemo((): SharedFilters => {
    const f: SharedFilters = {};
    if (filters.priority && filters.priority !== 'all') f.priority = filters.priority;
    if (filters.assigneeId && filters.assigneeId !== 'all')
      f.assigneeId = filters.assigneeId === 'unassigned' ? '0' : filters.assigneeId;
    if (filters.categoryId && filters.categoryId !== 'all') f.categoryId = filters.categoryId;
    if (filters.labelId && filters.labelId !== 'all') f.labelId = filters.labelId;
    if (filters.search?.trim()) f.search = filters.search.trim();
    if (filters.linked === 'synced_to_jira') f.syncedToJira = 'true';
    else if (filters.linked === 'not_synced') f.syncedToJira = 'false';
    return f;
  }, [filters.priority, filters.assigneeId, filters.categoryId, filters.labelId, filters.search, filters.linked]);

  const filterKey = useMemo(() => JSON.stringify(sharedFilters), [sharedFilters]);

  const [colStates, setColStates] = useState<Record<string, ColumnState>>(initialColStates);
  const [activeTicket, setActiveTicket] = useState<TicketType | null>(null);

  // Refs to avoid stale closures in loadMore
  const colStatesRef = useRef(colStates);
  colStatesRef.current = colStates;
  const sharedFiltersRef = useRef(sharedFilters);
  sharedFiltersRef.current = sharedFilters;

  // Fetch all columns in parallel when filters change
  useEffect(() => {
    let cancelled = false;
    setColStates(
      Object.fromEntries(
        COLUMNS.map((c) => [c.id, { tickets: [], total: 0, loading: true, hasMore: false, page: 1 }])
      )
    );

    COLUMNS.forEach((col) => {
      void (async () => {
        try {
          const res = await ticketService.getAll(
            { ...sharedFiltersRef.current, status: col.status },
            1,
            PAGE_SIZE,
            'updatedAt',
            'desc'
          );
          if (cancelled || !res.success) return;
          setColStates((prev) => ({
            ...prev,
            [col.id]: {
              tickets: res.data ?? [],
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  const loadMore = useCallback((colId: string) => {
    const col = COLUMNS.find((c) => c.id === colId);
    if (!col) return;
    setColStates((prev) => ({ ...prev, [colId]: { ...prev[colId], loading: true } }));
    const nextPage = colStatesRef.current[colId].page + 1;
    const filterSnapshot = { ...sharedFiltersRef.current, status: col.status };
    void (async () => {
      try {
        const res = await ticketService.getAll(filterSnapshot, nextPage, PAGE_SIZE, 'updatedAt', 'desc');
        if (!res.success) return;
        setColStates((prev) => ({
          ...prev,
          [colId]: {
            tickets: [...prev[colId].tickets, ...(res.data ?? [])],
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
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const ticketId = event.active.id as number;
    const colId = event.active.data.current?.colId as string;
    const ticket = colStatesRef.current[colId]?.tickets.find((t) => t.id === ticketId);
    setActiveTicket(ticket ?? null);
  }, []);

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveTicket(null);

    if (!over) return;

    const ticketId = active.id as number;
    const fromColId = active.data.current?.colId as string;
    const toColId = over.id as string;

    if (fromColId === toColId) return;

    const toCol = COLUMNS.find((c) => c.id === toColId);
    if (!toCol) return;

    const ticket = colStatesRef.current[fromColId]?.tickets.find((t) => t.id === ticketId);
    if (!ticket) return;

    const movedTicket: TicketType = { ...ticket, status: toCol.status as TicketStatus };

    // Optimistic update
    setColStates((prev) => ({
      ...prev,
      [fromColId]: {
        ...prev[fromColId],
        tickets: prev[fromColId].tickets.filter((t) => t.id !== ticketId),
        total: Math.max(0, prev[fromColId].total - 1),
      },
      [toColId]: {
        ...prev[toColId],
        tickets: [movedTicket, ...prev[toColId].tickets],
        total: prev[toColId].total + 1,
      },
    }));

    try {
      await ticketService.update(ticketId, { status: toCol.status as TicketStatus });
    } catch (err) {
      logger.error(`Failed to move ticket ${ticketId} to ${toColId}:`, err);
      // Rollback
      setColStates((prev) => ({
        ...prev,
        [fromColId]: {
          ...prev[fromColId],
          tickets: [ticket, ...prev[fromColId].tickets],
          total: prev[fromColId].total + 1,
        },
        [toColId]: {
          ...prev[toColId],
          tickets: prev[toColId].tickets.filter((t) => t.id !== ticketId),
          total: Math.max(0, prev[toColId].total - 1),
        },
      }));
    }
  }, []);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={(e) => void handleDragEnd(e)}
    >
      <div className="flex flex-col gap-4 md:flex-row md:gap-3 md:overflow-x-auto md:pb-4">
        {COLUMNS.map((col) => (
          <KanbanColumn
            key={col.id}
            col={col}
            state={colStates[col.id] ?? { tickets: [], total: 0, loading: true, hasMore: false, page: 1 }}
            activeTicketId={activeTicket?.id ?? null}
            onLoadMore={() => loadMore(col.id)}
            onOpen={onOpen}
          />
        ))}
      </div>

      <DragOverlay dropAnimation={null}>
        {activeTicket ? (
          <div className="min-w-[240px] rounded-md border bg-card p-3 shadow-xl rotate-1 opacity-95 cursor-grabbing">
            <TicketCardContent ticket={activeTicket} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
};
