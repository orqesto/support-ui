import {
  WORKFLOW_STATUS_META,
  type WorkflowStatus,
} from '@/features/messages/components/inboxCardHelpers';
import { cn } from '@/lib/utils';

/**
 * The thread table's columns (Messages list v4 / v3 `.lhd`): priority · from · subject · signals ·
 * status · assignee · updated. Signals show from xl; below md (and in the split pane) a row is the
 * design's two-line form instead. The header and every row use this one grid so they line up.
 */
export const THREAD_TABLE_GRID =
  'md:grid-cols-[18px_minmax(140px,180px)_minmax(0,1fr)_110px_96px_76px] xl:grid-cols-[18px_minmax(150px,200px)_minmax(0,1fr)_minmax(0,190px)_110px_96px_76px]';

/**
 * How the table fits a column whose width was MEASURED — the split pane, where the window says
 * little about the room the list has: the list gets 42% of what the sidebar leaves, so a 1920px
 * window gives it ~745px beside the rail and ~665px beside the expanded sidebar.
 * `undefined` everywhere else: the full-width list keeps the window breakpoints above.
 *   two-line — the design's two-line row, no column headers (what the split pane always drew)
 *   table    — the md columns: priority · from · subject · status · assignee · updated
 *   signals  — the xl columns, signals included
 */
export type TableFit = 'two-line' | 'table' | 'signals';

/** Below this the subject column drops under ~150px and the two-line row reads better. */
export const TABLE_MIN_WIDTH = 720;
/** The signals column (up to 190px) only once the subject keeps ~200px beside it. */
export const SIGNALS_MIN_WIDTH = 1000;

export const tableFitFor = (width: number): TableFit =>
  width >= SIGNALS_MIN_WIDTH ? 'signals' : width >= TABLE_MIN_WIDTH ? 'table' : 'two-line';

/**
 * The grid for a fit, spelled out in full: Tailwind finds classes by reading the source, so the
 * columns cannot be built from THREAD_TABLE_GRID by stripping its prefixes.
 */
export const threadTableGrid = (fit: TableFit | undefined): string => {
  if (fit === undefined) return THREAD_TABLE_GRID;
  if (fit === 'signals')
    return 'grid-cols-[18px_minmax(150px,200px)_minmax(0,1fr)_minmax(0,190px)_110px_96px_76px]';
  if (fit === 'table') return 'grid-cols-[18px_minmax(140px,180px)_minmax(0,1fr)_110px_96px_76px]';
  return '';
};

/**
 * A class that the window breakpoints switch on (`md:grid`, `xl:flex`), resolved for a fit: on
 * when the fit has that column, hidden when it has not, and left to the breakpoint without one.
 */
export const fitClass = (
  fit: TableFit | undefined,
  breakpointClass: `${'md' | 'xl'}:${string}`
): string => {
  const [breakpoint, cls] = breakpointClass.split(':') as ['md' | 'xl', string];
  if (fit === undefined) return `hidden ${breakpointClass}`;
  const shown = breakpoint === 'md' ? fit !== 'two-line' : fit === 'signals';
  return shown ? cls : 'hidden';
};

/**
 * Status colours — the tickets table's dots, with on-hold hollow (the design's `.tst.hollow`).
 * Pending (waiting on the customer) is amber like its chip; violet is On-hold's alone.
 */
const STATUS_DOT: Record<WorkflowStatus, string> = {
  open: 'bg-primary',
  in_progress: 'bg-caution-solid',
  pending: 'bg-warning',
  on_hold: 'border-2 border-pending',
  resolved: 'bg-success',
};

/**
 * A thread's work status as a dot and its word; a dash for not-analysed and archived mail, which
 * has none. Suspicious and spam threads keep theirs — the card shows it, and they sit in the queues.
 */
export const ThreadStatusCell = ({ status }: { status: WorkflowStatus | null }) =>
  status ? (
    <span className="inline-flex gap-1.5 items-center text-[12.5px] font-medium whitespace-nowrap">
      <span className={cn('w-2 h-2 rounded-full shrink-0', STATUS_DOT[status])} />
      {WORKFLOW_STATUS_META[status].label}
    </span>
  ) : (
    <span className="text-muted-foreground/70">—</span>
  );
