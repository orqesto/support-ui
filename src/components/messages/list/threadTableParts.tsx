import { WORKFLOW_STATUS_META, type WorkflowStatus } from '@/components/messages/inboxCardHelpers';
import { cn } from '@/lib/utils';

/**
 * The thread table's columns (Messages list v4 / v3 `.lhd`): priority · from · subject · signals ·
 * status · assignee · updated. Signals show from xl; below md (and in the split pane) a row is the
 * design's two-line form instead. The header and every row use this one grid so they line up.
 */
export const THREAD_TABLE_GRID =
  'md:grid-cols-[18px_minmax(140px,180px)_minmax(0,1fr)_110px_96px_64px] xl:grid-cols-[18px_minmax(150px,200px)_minmax(0,1fr)_minmax(0,190px)_110px_96px_64px]';

/** Status colours — the tickets table's dots, with on-hold hollow (the design's `.tst.hollow`). */
const STATUS_DOT: Record<WorkflowStatus, string> = {
  open: 'bg-primary',
  in_progress: 'bg-caution-solid',
  pending: 'bg-pending',
  on_hold: 'border-2 border-pending',
  resolved: 'bg-success',
};

/** A thread's work status as a dot and its word; a dash for triage mail, which has none. */
export const ThreadStatusCell = ({ status }: { status: WorkflowStatus | null }) =>
  status ? (
    <span className="inline-flex gap-1.5 items-center text-[12.5px] font-medium whitespace-nowrap">
      <span className={cn('w-2 h-2 rounded-full shrink-0', STATUS_DOT[status])} />
      {WORKFLOW_STATUS_META[status].label}
    </span>
  ) : (
    <span className="text-muted-foreground/70">—</span>
  );
