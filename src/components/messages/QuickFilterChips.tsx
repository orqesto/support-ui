import { COLUMNS, type KanbanColumnDef } from './kanbanColumns';

type QuickFilterChipsProps = {
  /** Currently selected column id, or 'all' for none. */
  value: string;
  onChange: (columnId: string) => void;
  /** Live depth per column id, where known. Absent means "not counted", not zero. */
  counts?: Record<string, number>;
};

const AXIS_LABEL: Record<KanbanColumnDef['axis'], string> = {
  lifecycle: 'Status',
  triage: 'Triage',
};

/**
 * One-click filters for the list view, one chip per kanban column.
 *
 * The board has always offered these slices as columns; the list could only reach them by
 * TYPING a filter token, which meant an agent had to already know a queue existed to look in it.
 * That asymmetry is why filtered mail read as missing mail — the product was hiding the very
 * queues that explained where a message went.
 *
 * Chips are generated FROM `COLUMNS`, never from a parallel list. Adding a column to the board
 * gives the list its chip for free, and neither view can end up offering a slice the other does
 * not — which is the failure a hand-written second list guarantees eventually.
 */
export const QuickFilterChips = ({ value, onChange, counts }: QuickFilterChipsProps) => {
  const axes: KanbanColumnDef['axis'][] = ['lifecycle', 'triage'];

  return (
    <div className="flex flex-wrap gap-3 items-center" data-testid="quick-filter-chips">
      <button
        type="button"
        onClick={() => onChange('all')}
        aria-pressed={value === 'all'}
        className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
          value === 'all'
            ? 'bg-primary text-primary-foreground border-primary'
            : 'border-border text-muted-foreground hover:text-foreground'
        }`}
      >
        All
      </button>

      {axes.map((axis) => {
        const columns = COLUMNS.filter((col) => col.axis === axis);
        if (columns.length === 0) return null;

        return (
          <div key={axis} className="flex flex-wrap gap-1.5 items-center">
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {AXIS_LABEL[axis]}
            </span>
            {columns.map((col) => {
              const active = value === col.id;
              const count = counts?.[col.id];
              return (
                <button
                  key={col.id}
                  type="button"
                  onClick={() => onChange(active ? 'all' : col.id)}
                  aria-pressed={active}
                  className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                    active
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'border-border text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {col.label}
                  {/* `undefined` means the count is unknown — render nothing rather than a 0,
                      which would claim the queue is empty. */}
                  {typeof count === 'number' && (
                    <span className="ml-1.5 opacity-70">{count}</span>
                  )}
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
};
