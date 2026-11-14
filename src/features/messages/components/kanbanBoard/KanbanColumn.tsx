import { useDraggable, useDroppable } from '@dnd-kit/core';
import { GripVertical, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Select } from '@/components/ui/Select';
import { Tooltip } from '@/components/ui/Tooltip';
import { formatTotal } from '@/lib/listTotals';
import { cn } from '@/lib/utils';
import type { MessageThread } from '@/services/message.service';
import type { SortingState } from '@/features/messages/stores/messagesStore';
import type { ToggleSelected } from '../bulk/selectMode';
import { KanbanCard } from '../KanbanCard';
import { VALID_TARGETS, type KanbanColumnDef } from '../kanbanColumns';
import { SORT_PRESET_OPTIONS, presetToSorting, sortingToPreset } from '../sortPresets';
import { byLayout, type BoardLayout } from './boardLayout';
import { HorizontalPanStrip } from './HorizontalPanStrip';
import { UNFINISHED_HINT, type ColumnState } from './kanbanBoardModel';

// Draggable wrapper — only rendered for DND_COLS
function DraggableMessageCard({
  thread,
  colId,
  onOpen,
  weRepliedLast,
  selected,
  onToggleSelected,
  selectMode,
}: {
  thread: MessageThread;
  colId: string;
  onOpen: (t: MessageThread) => void;
  weRepliedLast?: boolean;
  selected?: boolean;
  onToggleSelected?: ToggleSelected;
  selectMode?: boolean;
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
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Drag to move card"
        {...attributes}
        {...listeners}
        className={cn(
          'absolute top-1.5 z-10 p-1 w-auto h-auto rounded text-muted-foreground opacity-30 group-hover:opacity-80 transition-opacity cursor-grab active:cursor-grabbing focus:outline-none focus-visible:ring-1 focus-visible:ring-primary',
          // The checkbox owns the corner in selection mode; the grip steps aside rather than
          // sitting under it.
          onToggleSelected ? 'right-7' : 'right-1.5'
        )}
      >
        <GripVertical className="w-3.5 h-3.5" />
      </Button>
      <KanbanCard
        thread={thread}
        onOpen={onOpen}
        weRepliedLast={weRepliedLast}
        colId={colId}
        selected={selected}
        onToggleSelected={onToggleSelected}
        selectMode={selectMode}
      />
    </div>
  );
}

type KanbanColumnProps = {
  col: KanbanColumnDef;
  /** The board's layout (boardLayout.ts); absent = by the window (xl). */
  layout?: BoardLayout;
  state: ColumnState;
  isDraggable: boolean;
  isDroppable: boolean;
  activeDragColId: string | null;
  activeThreadId: string | null;
  sort: SortingState;
  onSortChange: (sorting: SortingState) => void;
  onLoadMore: () => void;
  onOpen: (thread: MessageThread) => void;
  // P2: unread auto-arrival count for this column (Suspicious/Spam only) + clear handler.
  newCount?: number;
  onClearNew?: () => void;
  /** Bulk selection, threaded down to the cards. Absent = no checkboxes anywhere. */
  isSelected?: (conversationId: number) => boolean;
  onToggleSelected?: (conversationId: number) => void;
  /** Shift-click range, bounded by THIS column's cards in drawn order (see useBulkSelection). */
  onToggleRange?: (conversationId: number, orderedIds: readonly number[]) => void;
  /** Anything selected anywhere: every card shows its box (bulk/selectMode.ts). */
  selectMode?: boolean;
  /** Select / clear every LOADED card in this column (what "Load more" has fetched, no more). */
  onSelectMany?: (conversationIds: number[]) => void;
  onDeselectMany?: (conversationIds: number[]) => void;
};

export const KanbanColumn = ({
  col,
  layout,
  state,
  isDraggable,
  isDroppable,
  activeDragColId,
  activeThreadId,
  sort,
  onSortChange,
  onLoadMore,
  onOpen,
  newCount,
  onClearNew,
  isSelected,
  onToggleSelected,
  onToggleRange,
  selectMode,
  onSelectMany,
  onDeselectMany,
}: KanbanColumnProps) => {
  // Always call useDroppable — only attach ref when this column can receive a drop.
  // Without setNodeRef, the droppable has no bounding rect so collision detection ignores it.
  const { setNodeRef, isOver } = useDroppable({ id: col.id });
  const Icon = col.icon;

  // What this lane can offer a bulk run: the loaded cards that are real conversations
  // (a `spamlog_` row has none behind it, so it can never be acted on).
  const selectableIds = state.threads
    .filter(
      (thread) => !thread.threadId.startsWith('spamlog_') && (thread.latestMessage?.id ?? 0) > 0
    )
    .map((thread) => thread.latestMessage!.id);
  const selectedHere = isSelected ? selectableIds.filter((id) => isSelected(id)).length : 0;

  // A shift-click ranges over THIS lane only: "between" has no single meaning across two
  // columns (their orders are independent sorts), so an anchor in another lane is no anchor.
  const toggleCard: ToggleSelected | undefined = onToggleSelected
    ? (conversationId, options) =>
        options?.range && onToggleRange
          ? onToggleRange(conversationId, selectableIds)
          : onToggleSelected(conversationId)
    : undefined;

  // A card's box: a fixed width in a row, the column's width in a column.
  const cardClass = cn(
    'min-w-[260px] shrink-0',
    byLayout(layout, { xl: 'xl:min-w-0 xl:shrink', columns: 'min-w-0 shrink' })
  );

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
        // xl:h-full: the column fills the flex-bounded board height (set by the
        // page → kanban-root → column-row chain), so every column is uniform full
        // height; the cards body below flex-fills + scrolls inside it. No page scroll.
        // Trello mode starts at xl (was lg): on smaller windows the per-column
        // scroll forced people to scroll each lane separately, so below xl the
        // columns stack and the page scrolls naturally instead.
        'flex flex-col w-full rounded-lg border-t-4 border border-border overflow-hidden transition-colors',
        byLayout(layout, {
          xl: 'xl:min-w-[260px] xl:flex-1 xl:h-full',
          columns: 'min-w-[260px] flex-1 h-full',
        }),
        isValidTarget && isOver ? 'bg-muted/60' : 'bg-muted/30'
      )}
      style={{ borderTopColor: col.accentColor }}
      data-column={col.id}
    >
      {/* Column header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b bg-background">
        {/* Select every LOADED card in this lane — the point of filtering first and then
            selecting. Deliberately NOT "all 74 in the column": it can only pick what has been
            fetched, and claiming otherwise would select rows the agent has never seen. */}
        {onSelectMany && onDeselectMany && (
          <Checkbox
            checked={selectableIds.length > 0 && selectedHere === selectableIds.length}
            ref={(node) => {
              // Indeterminate is a DOM property, not an attribute: it cannot be set in JSX.
              if (node)
                node.indeterminate = selectedHere > 0 && selectedHere < selectableIds.length;
            }}
            aria-label={`Select the loaded ${col.label} cards`}
            disabled={selectableIds.length === 0}
            onChange={() =>
              selectedHere === selectableIds.length
                ? onDeselectMany(selectableIds)
                : onSelectMany(selectableIds)
            }
            className="shrink-0"
          />
        )}
        <Icon className={`w-4 h-4 shrink-0 ${col.iconClass}`} />
        <span className="flex-1 min-w-0 text-sm font-semibold truncate">{col.label}</span>
        {/* P2: unread auto-arrival badge (Suspicious/Spam). Click = "reviewed" → clears
            for this user (PATCH /read-all?kind=). Distinct from the neutral total count. */}
        {typeof newCount === 'number' && newCount > 0 && (
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={onClearNew}
            title={`${newCount} new — click to mark reviewed`}
            aria-label={`${newCount} new ${col.label.toLowerCase()} — mark reviewed`}
            className="shrink-0 flex items-center justify-center min-w-[1.25rem] h-5 px-1 text-[10px] font-bold rounded-full bg-primary text-primary-foreground hover:opacity-80 transition-opacity"
          >
            {newCount > 99 ? '99+' : newCount}
          </Button>
        )}
        {!state.loading &&
          (state.unfinished ? (
            <Tooltip content={UNFINISHED_HINT} size="sm">
              <span className="text-xs font-mono text-muted-foreground bg-muted rounded px-1.5 py-0.5 shrink-0">
                <span aria-hidden="true">—</span>
                {/* An aria-label on a plain span is not a reliable name: the words, visually hidden. */}
                <span className="sr-only">{UNFINISHED_HINT}</span>
              </span>
            </Tooltip>
          ) : (
            <span className="text-xs font-mono text-muted-foreground bg-muted rounded px-1.5 py-0.5 shrink-0">
              {formatTotal(state.total, state.totalCapped)}
            </span>
          ))}
        {/* Per-column sort — each column sorts independently. Compact chip select
            keeps the header tight; icon-only trigger avoids crowding the label. */}
        <Select
          variant="chip"
          value={sortingToPreset(sort)}
          onChange={(value) => onSortChange(presetToSorting(value))}
          options={SORT_PRESET_OPTIONS}
          searchable={false}
          aria-label={`Sort ${col.label} column`}
          className="shrink-0"
        />
      </div>

      {/* Cards */}
      {/* In rows the strip pans sideways with a mouse drag and has ‹ › arrows (HorizontalPanStrip). */}
      <HorizontalPanStrip
        wrapperClassName={byLayout(layout, { xl: 'xl:flex-1', columns: 'flex-1' })}
        className={cn(
          'flex flex-row overflow-x-auto gap-2 p-2',
          byLayout(layout, {
            xl: 'xl:flex-col xl:overflow-x-hidden xl:overflow-y-auto xl:flex-1 xl:min-h-0',
            columns: 'flex-col overflow-x-hidden overflow-y-auto flex-1 min-h-0',
          })
        )}
      >
        {state.loading && state.threads.length === 0 ? (
          Array.from({ length: 3 }, (_, idx) => (
            <div
              key={idx}
              className={cn(
                'min-w-[260px] p-3 space-y-2 rounded-md border animate-pulse bg-card shrink-0',
                byLayout(layout, { xl: 'xl:min-w-0', columns: 'min-w-0' })
              )}
            >
              <div className="w-3/4 h-3 rounded bg-muted" />
              <div className="w-1/2 h-3 rounded bg-muted" />
            </div>
          ))
        ) : state.threads.length === 0 ? (
          <p
            className={cn(
              'px-3 py-4 text-xs text-muted-foreground',
              byLayout(layout, { xl: 'xl:text-center', columns: 'text-center' })
            )}
          >
            {state.unfinished
              ? `${UNFINISHED_HINT}. Refresh to try again, or narrow the search.`
              : col.emptyText}
          </p>
        ) : (
          <>
            {state.threads.map((thread) =>
              isDraggable && !thread.threadId.startsWith('spamlog_') ? (
                <div key={thread.threadId} className={cardClass}>
                  <DraggableMessageCard
                    thread={thread}
                    colId={col.id}
                    onOpen={onOpen}
                    weRepliedLast={col.id === 'awaiting'}
                    selected={thread.latestMessage ? isSelected?.(thread.latestMessage.id) : false}
                    onToggleSelected={toggleCard}
                    selectMode={selectMode}
                  />
                </div>
              ) : (
                <div
                  key={thread.threadId}
                  className={cardClass}
                  title={
                    thread.threadId.startsWith('spamlog_')
                      ? 'Spam-rule record — cannot be moved'
                      : undefined
                  }
                >
                  <KanbanCard
                    thread={thread}
                    onOpen={onOpen}
                    weRepliedLast={col.id === 'awaiting'}
                    colId={col.id}
                    selected={thread.latestMessage ? isSelected?.(thread.latestMessage.id) : false}
                    onToggleSelected={toggleCard}
                    selectMode={selectMode}
                  />
                </div>
              )
            )}
            {isDroppable && activeThreadId !== null && <div className="min-h-[60px] shrink-0" />}
            {state.hasMore && (
              <Button
                type="button"
                variant="ghost"
                disabled={state.loading}
                onClick={onLoadMore}
                className={cn(
                  'flex gap-1 justify-center items-center px-3 py-2 h-auto text-xs shrink-0 text-muted-foreground hover:text-foreground data-[inactive]:opacity-50',
                  byLayout(layout, { xl: 'xl:w-full', columns: 'w-full' })
                )}
              >
                <RotateCcw className="w-3 h-3" />
                {state.loading ? 'Loading…' : 'Load more'}
              </Button>
            )}
          </>
        )}
      </HorizontalPanStrip>
    </div>
  );
};
