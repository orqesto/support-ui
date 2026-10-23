import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
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
import { Lock, RotateCcw } from 'lucide-react';
import { AssigneeCell } from '@/components/tickets/list/AssigneeCell';
import { STATUS_LABELS } from '@/components/tickets/list/ticketFilterKeys';
import { ticketApiFilters } from '@/components/tickets/list/ticketFilters';
import {
  OwedCell,
  PriorityIcon,
  STATUS_DOT,
  ThreadCount,
} from '@/components/tickets/list/ticketRowBits';
import { useDepartmentContextKey } from '@/hooks/useDepartmentContextKey';
import { ticketService } from '@/services/ticket.service';
import { TicketTitle, ticketMatchLine } from '@/components/tickets/list/ticketSearchBits';
import { highlightTermsFor } from '@/lib/highlightTerms';
import { Button } from '@/components/ui/Button';
import { Tooltip } from '@/components/ui/Tooltip';
import { logger } from '@/lib/logger';
import { toast } from '@/lib/toast';
import { canTransition } from '@/lib/ticketStatus';
import { useAuthStore } from '@/stores/authStore';
import type { TicketFilters } from '@/stores/ticketsStore';
import type { Ticket as TicketType, TicketStatus } from '@/types';
import { TicketRef, useTicketDisplayId } from '@/components/tickets/TicketRef';

type KanbanColumnDef = {
  id: TicketStatus;
  status: TicketStatus;
  label: string;
};

// The lanes are the statuses, labelled and dotted as everywhere else (STATUS_LABELS / STATUS_DOT).
const COLUMNS: KanbanColumnDef[] = (
  ['open', 'in_progress', 'pending', 'resolved', 'closed'] as const
).map((status) => ({ id: status, status, label: STATUS_LABELS[status] }));

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

/** What a card needs to show its owner and offer Claim / re-assign, as the list rows do. */
export type AssignProps = {
  canManage: boolean;
  assignees: Array<{ id: number; name: string }>;
  currentUserId: number | null;
  onAssign: (ticketId: number, userId: number | null) => void;
};

// A card as the design's board: #id + priority · title · threads, owed · owner (or Claim).
function TicketCardContent({
  ticket,
  assign,
  terms,
}: {
  ticket: TicketType;
  assign?: AssignProps;
  /** The typed search's words as the backend read them. */
  terms?: string[];
}) {
  const matchLine = ticketMatchLine(ticket, terms);
  const jiraKey = (ticket as TicketWithExtras).jiraKey ?? ticket.externalId ?? null;
  return (
    <div className="grid gap-1.5">
      <div className="flex gap-1.5 items-center">
        <TicketRef ticket={ticket} className="text-[11.5px] text-muted-foreground" />
        <PriorityIcon priority={ticket.priority} />
        <span className="flex-1" />
        {jiraKey && (
          <Tooltip
            content={`Linked to Jira issue ${jiraKey} — Jira can change its status too`}
            size="sm"
          >
            <span className="inline-flex gap-1 items-center font-mono text-[10.5px] text-muted-foreground">
              <Lock className="w-3 h-3" aria-hidden />
              {jiraKey}
            </span>
          </Tooltip>
        )}
      </div>
      <p className="text-[13px] font-semibold leading-snug line-clamp-2">
        <TicketTitle ticket={ticket} terms={terms} />
      </p>
      {matchLine && <p className="text-xs text-muted-foreground line-clamp-2">{matchLine}</p>}
      <div className="flex gap-2 items-center">
        <ThreadCount count={ticket.threadCount} />
        {ticket.owedCount ? <OwedCell count={ticket.owedCount} /> : null}
        <span className="flex-1" />
        {assign && (
          <AssigneeCell
            ticket={ticket}
            canManage={assign.canManage}
            assignees={assign.assignees}
            currentUserId={assign.currentUserId}
            onAssign={assign.onAssign}
            compact
            keepActionLabel
          />
        )}
      </div>
    </div>
  );
}

/** Exported for its test only. */
export function TicketKanbanCard({
  ticket,
  colId,
  onOpen,
  assign,
  terms,
}: {
  ticket: TicketType;
  colId: string;
  onOpen: (t: TicketType) => void;
  assign: AssignProps;
  terms?: string[];
}) {
  // When using DragOverlay, do NOT apply transform to the original card.
  // The overlay handles the floating visual; the original becomes a semi-transparent placeholder.
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: ticket.id,
    data: { colId },
  });
  // The card's name starts with the ID it draws (WCAG 2.5.3), not the row id.
  const shownId = useTicketDisplayId(ticket);

  return (
    // distance:8 activation means a short press still opens the card without starting a drag.
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      role="button"
      tabIndex={0}
      aria-label={`Open ticket ${shownId}`}
      onClick={() => onOpen(ticket)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && event.target === event.currentTarget) onOpen(ticket);
      }}
      className={`min-w-[240px] xl:min-w-0 shrink-0 xl:shrink p-3 rounded-[10px] border border-border bg-card cursor-grab active:cursor-grabbing touch-manipulation select-none outline-none focus-visible:ring-2 focus-visible:ring-primary transition-[opacity,border-color] ${isDragging ? 'opacity-30' : 'hover:border-primary/40'}`}
    >
      <TicketCardContent ticket={ticket} assign={assign} terms={terms} />
    </div>
  );
}

/** While a card is dragged, each lane says whether it can take it (`null`: nothing dragged). */
type DropState = 'from' | 'allowed' | 'blocked' | null;

type KanbanColumnProps = {
  col: KanbanColumnDef;
  state: ColumnState;
  activeTicketId: number | null;
  drop: DropState;
  assign: AssignProps;
  onLoadMore: () => void;
  onOpen: (ticket: TicketType) => void;
  terms?: string[];
};

const KanbanColumn = ({
  col,
  state,
  activeTicketId,
  drop,
  assign,
  onLoadMore,
  onOpen,
  terms,
}: KanbanColumnProps) => {
  const { setNodeRef, isOver } = useDroppable({ id: col.id });

  return (
    <section
      ref={setNodeRef}
      aria-label={col.label}
      className={`flex flex-col min-w-0 rounded-[12px] border border-border transition-[background-color,opacity,box-shadow] ${
        drop === 'blocked'
          ? 'opacity-50 bg-muted/30'
          : drop === 'allowed'
            ? `ring-2 ring-primary/40 ${isOver ? 'bg-primary/10' : 'bg-muted/30'}`
            : 'bg-muted/30'
      }`}
    >
      <header className="flex gap-2 items-center px-3 pt-2.5 pb-1.5 text-[12.5px]">
        <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[col.status]}`} aria-hidden />
        <span className="font-semibold">{col.label}</span>
        {!state.loading && (
          <span className="font-mono text-xs text-muted-foreground">{state.total}</span>
        )}
        <span className="flex-1" />
        {drop === 'blocked' && (
          <span className="text-[11px] text-muted-foreground">Can’t move here</span>
        )}
      </header>

      <div className="flex flex-row overflow-x-auto gap-2 px-2 pb-2 xl:flex-col xl:overflow-x-hidden xl:overflow-y-auto xl:flex-1 xl:max-h-[calc(100vh-240px)]">
        {state.loading && state.tickets.length === 0 ? (
          Array.from({ length: 3 }, (_, idx) => (
            <div
              key={idx}
              className="min-w-[240px] xl:min-w-0 p-3 space-y-2 rounded-[10px] border border-border animate-pulse bg-card shrink-0"
            >
              <div className="w-3/4 h-3 rounded bg-muted" />
              <div className="w-1/2 h-3 rounded bg-muted" />
            </div>
          ))
        ) : state.tickets.length === 0 ? (
          <p className="px-1 py-1 text-xs text-muted-foreground">No tickets</p>
        ) : (
          <>
            {state.tickets.map((ticket) => (
              <TicketKanbanCard
                key={ticket.id}
                ticket={ticket}
                colId={col.id}
                onOpen={onOpen}
                assign={assign}
                terms={terms}
              />
            ))}
            {/* Drop target padding so there's always somewhere to drop at the bottom */}
            {activeTicketId !== null && <div className="min-h-[60px] shrink-0" />}
            {state.hasMore && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={state.loading}
                onClick={onLoadMore}
                className="gap-1 justify-center items-center shrink-0 px-3 py-2 h-auto text-xs text-muted-foreground hover:text-foreground xl:w-full"
              >
                <RotateCcw className="w-3 h-3" />
                {state.loading ? 'Loading…' : 'Load more'}
              </Button>
            )}
          </>
        )}
      </div>
    </section>
  );
};

type TicketsKanbanViewProps = AssignProps & {
  filters: TicketFilters;
  onOpen: (ticket: TicketType) => void;
};

const initialColStates = (): Record<string, ColumnState> =>
  Object.fromEntries(
    COLUMNS.map((col) => [
      col.id,
      { tickets: [], total: 0, loading: true, hasMore: false, page: 1 },
    ])
  );

export const TicketsKanbanView = ({
  filters,
  onOpen,
  canManage,
  assignees,
  currentUserId: assigneeSelf,
  onAssign,
}: TicketsKanbanViewProps) => {
  // Memoize to avoid rebuilding on every parent re-render (colStates updates, etc.)
  const currentUserId = useAuthStore((state) => state.user?.id ?? null);
  // The board's columns ARE the statuses, so a status filter never applies here.
  const sharedFilters = useMemo(
    (): SharedFilters => ticketApiFilters({ ...filters, status: 'all' }, currentUserId),
    [filters, currentUserId]
  );

  const filterKey = useMemo(() => JSON.stringify(sharedFilters), [sharedFilters]);
  const selectedDeptKey = useDepartmentContextKey();

  const [colStates, setColStates] = useState<Record<string, ColumnState>>(initialColStates);
  // The typed search's words as the backend read them (every column answers the same search).
  const [terms, setTerms] = useState<string[]>([]);
  const [activeTicket, setActiveTicket] = useState<TicketType | null>(null);
  const [dragFrom, setDragFrom] = useState<string | null>(null);

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
        COLUMNS.map((col) => [
          col.id,
          { tickets: [], total: 0, loading: true, hasMore: false, page: 1 },
        ])
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
          setTerms(highlightTermsFor(res.search));
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
  }, [filterKey, selectedDeptKey]);

  const loadMore = useCallback((colId: string) => {
    const col = COLUMNS.find((column) => column.id === colId);
    if (!col) return;
    setColStates((prev) => ({ ...prev, [colId]: { ...prev[colId], loading: true } }));
    const nextPage = colStatesRef.current[colId].page + 1;
    const filterSnapshot = { ...sharedFiltersRef.current, status: col.status };
    void (async () => {
      try {
        const res = await ticketService.getAll(
          filterSnapshot,
          nextPage,
          PAGE_SIZE,
          'updatedAt',
          'desc'
        );
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
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } })
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const ticketId = event.active.id as number;
    const colId = event.active.data.current?.colId as string;
    setDragFrom(colId);
    const ticket = colStatesRef.current[colId]?.tickets.find((tk) => tk.id === ticketId);
    setActiveTicket(ticket ?? null);
  }, []);

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveTicket(null);
    setDragFrom(null);

    if (!over) return;

    const ticketId = active.id as number;
    const fromColId = active.data.current?.colId as string;
    const toColId = over.id as string;

    if (fromColId === toColId) return;

    // Validate transition is allowed before doing anything — shared with the status
    // dropdown and mirrored from the backend contract (see @/lib/ticketStatus).
    if (!canTransition(fromColId as TicketStatus, toColId as TicketStatus)) {
      const label = (id: string) => COLUMNS.find((column) => column.id === id)?.label ?? id;
      toast.error(`${label(fromColId)} can’t move to ${label(toColId)}`);
      return;
    }

    const toCol = COLUMNS.find((column) => column.id === toColId);
    if (!toCol) return;

    const ticket = colStatesRef.current[fromColId]?.tickets.find((tk) => tk.id === ticketId);
    if (!ticket) return;

    const movedTicket: TicketType = { ...ticket, status: toCol.status };

    // Capture original index before optimistic move so rollback restores the card
    // to its original position rather than prepending at index 0.
    const originalIndex = colStatesRef.current[fromColId].tickets.findIndex(
      (tk) => tk.id === ticketId
    );

    // Optimistic update
    setColStates((prev) => ({
      ...prev,
      [fromColId]: {
        ...prev[fromColId],
        tickets: prev[fromColId].tickets.filter((tk) => tk.id !== ticketId),
        total: Math.max(0, prev[fromColId].total - 1),
      },
      [toColId]: {
        ...prev[toColId],
        tickets: [movedTicket, ...prev[toColId].tickets],
        total: prev[toColId].total + 1,
      },
    }));

    try {
      await ticketService.update(ticketId, { status: toCol.status });
    } catch (err) {
      logger.error(`Failed to move ticket ${ticketId} to ${toColId}:`, err);
      // Rollback: restore card at its original position
      setColStates((prev) => {
        const restored = [...prev[fromColId].tickets];
        restored.splice(Math.min(originalIndex, restored.length), 0, ticket);
        return {
          ...prev,
          [fromColId]: {
            ...prev[fromColId],
            tickets: restored,
            total: prev[fromColId].total + 1,
          },
          [toColId]: {
            ...prev[toColId],
            tickets: prev[toColId].tickets.filter((tk) => tk.id !== ticketId),
            total: Math.max(0, prev[toColId].total - 1),
          },
        };
      });
    }
  }, []);

  // The page assigns; the board shows the new owner at once (its lanes are its own lists).
  const assign: AssignProps = {
    canManage,
    assignees,
    currentUserId: assigneeSelf,
    onAssign: (ticketId, userId) => {
      onAssign(ticketId, userId);
      const name = assignees.find((user) => user.id === userId)?.name ?? null;
      setColStates((prev) =>
        Object.fromEntries(
          Object.entries(prev).map(([id, col]) => [
            id,
            {
              ...col,
              tickets: col.tickets.map((tk) =>
                tk.id === ticketId ? { ...tk, assigneeId: userId, assigneeName: name } : tk
              ),
            },
          ])
        )
      );
    },
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={(event) => void handleDragEnd(event)}
      onDragCancel={() => {
        setActiveTicket(null);
        setDragFrom(null);
      }}
    >
      <div className="grid gap-3 xl:grid-cols-5">
        {COLUMNS.map((col) => (
          <KanbanColumn
            key={col.id}
            col={col}
            state={
              colStates[col.id] ?? { tickets: [], total: 0, loading: true, hasMore: false, page: 1 }
            }
            activeTicketId={activeTicket?.id ?? null}
            drop={
              dragFrom === null
                ? null
                : dragFrom === col.id
                  ? 'from'
                  : canTransition(dragFrom as TicketStatus, col.id)
                    ? 'allowed'
                    : 'blocked'
            }
            assign={assign}
            onLoadMore={() => loadMore(col.id)}
            onOpen={onOpen}
            terms={terms}
          />
        ))}
      </div>

      <DragOverlay dropAnimation={null}>
        {activeTicket ? (
          <div className="min-w-[240px] rounded-[10px] border border-border bg-card p-3 shadow-xl rotate-1 opacity-95 cursor-grabbing">
            <TicketCardContent ticket={activeTicket} terms={terms} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
};
