import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { formatTotal } from '@/lib/listTotals';
import { cn } from '@/lib/utils';
import type { FilterState } from '@/features/messages/stores/messagesStore';
import { ListScopeNotice } from '../ListScopeNotice';
import { COLUMNS, type ColumnAxis } from '../kanbanColumns';
import { HIDEABLE_COLS, type ColumnState } from './kanbanBoardModel';
import type { useKanbanBoardData } from './useKanbanBoardData';

type KanbanBoardToolbarProps = {
  activeTab: ColumnAxis;
  setActiveTab: (axis: ColumnAxis) => void;
  boardCount: number;
  boardPartial: boolean;
  triageCount: number;
  triagePartial: boolean;
  triageUnread: number;
  boardScope: ReturnType<typeof useKanbanBoardData>['boardScope'];
  onScopeJump: (filters: Partial<FilterState>, needsListView?: boolean) => void;
  hiddenCols: Set<string>;
  toggleCol: (id: string) => void;
  colStates: Record<string, ColumnState>;
};

/** The board's top row: the Board | Triage tabs, the scope notice, and the Show chips. Extracted unchanged from `MessagesKanbanView`. */
export const KanbanBoardToolbar = ({
  activeTab,
  setActiveTab,
  boardCount,
  boardPartial,
  triageCount,
  triagePartial,
  triageUnread,
  boardScope,
  onScopeJump,
  hiddenCols,
  toggleCol,
  colStates,
}: KanbanBoardToolbarProps) => (
  <div className="flex gap-2 justify-between items-center min-w-0">
    <div className="flex gap-1 items-center flex-1 min-w-0">
      {(['lifecycle', 'triage'] as const).map((axis) => {
        const isActive = activeTab === axis;
        const count = axis === 'lifecycle' ? boardCount : triageCount;
        const countText = `${count}${(axis === 'lifecycle' ? boardPartial : triagePartial) ? '+' : ''}`;
        return (
          <Button
            key={axis}
            type="button"
            variant="ghost"
            onClick={() => setActiveTab(axis)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 h-auto rounded-md text-sm font-medium transition-colors shrink-0',
              isActive ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {axis === 'lifecycle' ? 'Board' : 'Triage'}
            {/* Triage carries TWO numbers: unread (amber — needs eyes) then
              the all-items total (muted). Order matters: the actionable
              number reads first. Both are hidden at zero, so a quiet queue
              shows "Triage" with no decoration at all. */}
            {axis === 'triage' && triageUnread > 0 && (
              <Badge
                variant="warning"
                size="sm"
                className="justify-center px-1.5 min-w-[18px] h-[18px] text-[11px] leading-none"
                title={`${triageUnread} unread`}
              >
                {triageUnread}
              </Badge>
            )}
            {axis === 'triage' && count > 0 && (
              <Badge
                variant="secondary"
                size="sm"
                className="justify-center px-1.5 min-w-[18px] h-[18px] text-[11px] leading-none"
                title={`${countText} in triage in total`}
              >
                {countText}
              </Badge>
            )}
            {axis === 'lifecycle' && count > 0 && (
              <span
                className={cn(
                  'inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[11px] font-semibold',
                  isActive
                    ? 'bg-foreground/15 text-foreground'
                    : 'bg-muted-foreground/15 text-muted-foreground'
                )}
              >
                {countText}
              </span>
            )}
          </Button>
        );
      })}
      {boardScope && (
        <div className="ml-2 flex-1 min-w-0">
          <ListScopeNotice
            scope={boardScope.scope}
            shown={boardScope.shown}
            shownCapped={boardScope.shownCapped}
            surface="board"
            onJump={onScopeJump}
          />
        </div>
      )}
    </div>

    {activeTab === 'lifecycle' && (
      <div className="flex gap-1.5 items-center text-xs shrink-0">
        <span className="text-muted-foreground">Show:</span>
        {COLUMNS.filter((col) => HIDEABLE_COLS.has(col.id)).map((col) => {
          const shown = !hiddenCols.has(col.id);
          const Icon = col.icon;
          const colState = colStates[col.id];
          // Loading is not 0: after a search change the column reads `total: 0` until it
          // answers, and the chip said "Resolved 0" meanwhile (release review).
          const count =
            colState === undefined || colState.unfinished
              ? '—'
              : // A refresh keeps the number it had; only a column with none yet says "…".
                colState.loading && colState.total === 0
                ? '…'
                : formatTotal(colState.total, colState.totalCapped);
          return (
            <Button
              key={col.id}
              type="button"
              variant="ghost"
              onClick={() => toggleCol(col.id)}
              aria-pressed={shown}
              className={cn(
                'flex items-center gap-1 px-2 py-0.5 h-auto rounded border font-medium transition-colors',
                shown
                  ? 'border-transparent bg-muted text-foreground'
                  : 'border-border text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon className="w-3 h-3" />
              {col.label}
              <span className="ml-0.5 tabular-nums opacity-70">{count}</span>
            </Button>
          );
        })}
      </div>
    )}
  </div>
);
