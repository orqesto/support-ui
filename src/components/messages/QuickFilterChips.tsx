import { COLUMNS, type KanbanColumnDef } from './kanbanColumns';

type QuickFilterChipsProps = {
  /** Currently selected column id, or 'all' for none. */
  value: string;
  onChange: (columnId: string) => void;
  /** Live depth per column id, where known. Absent means "not counted", not zero. */
  counts?: Record<string, number>;
};

/**
 * Messages list v2: 28px chips on the 8px radius family the rest of the controls use, the lit
 * one INVERTED (ink ground) so it cannot be mistaken for the primary-blue saved-view pill
 * above it — those are two different kinds of choice. "Hide awaiting" and Sort, which used
 * to ride this row's right end, moved to the list caption with the other list settings.
 */
const chipClass = (active: boolean) =>
  `inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg border text-[12.5px] whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
    active
      ? 'bg-foreground border-foreground text-background font-semibold'
      : 'bg-card border-border text-muted-foreground font-medium hover:text-foreground hover:border-border-strong'
  }`;

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
    <div
      className="flex flex-nowrap md:flex-wrap gap-1 gap-y-1.5 items-center overflow-x-auto md:overflow-visible -mx-3 px-3 md:mx-0 md:px-0 [scrollbar-width:none]"
      data-testid="quick-filter-chips"
    >
      <button
        type="button"
        onClick={() => onChange('all')}
        aria-pressed={value === 'all'}
        className={chipClass(value === 'all')}
      >
        All
      </button>

      {axes.map((axis) => {
        const columns = COLUMNS.filter((col) => col.axis === axis);
        if (columns.length === 0) return null;

        return (
          <div key={axis} className="contents">
            <span className="font-display shrink-0 ml-2 mr-1 text-[10.5px] uppercase tracking-[0.09em] text-faint-foreground font-semibold">
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
                  className={chipClass(active)}
                >
                  {col.label}
                  {/* `undefined` means the count is unknown — render nothing rather than a 0,
                      which would claim the queue is empty. */}
                  {typeof count === 'number' && (
                    <span
                      className={`font-mono text-[11px] ${active ? 'opacity-70' : 'text-faint-foreground'}`}
                    >
                      {count}
                    </span>
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
