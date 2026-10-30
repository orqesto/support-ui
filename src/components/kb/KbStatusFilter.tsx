import { Button } from '@/components/ui/Button';
import type { KbListStatus } from '@/services/kb.service';

export type KbFilterStatus = 'all' | KbListStatus;
export const KB_FILTER_STATUSES: readonly KbFilterStatus[] = [
  'needs_decision',
  'suggested_change',
  'set_aside',
  'auto_removed',
  'auto_changed',
  'approved',
  'pending',
  'hidden',
  'rejected',
  'all',
];
/**
 * What the page calls each status — the agent words (KB engine §8). Anything naming a status on
 * this page uses these. The URL values (the keys) stay as they are: old links and the API use them.
 */
export const KB_FILTER_STATUS_LABEL: Record<KbFilterStatus, string> = {
  approved: 'Live',
  pending: 'Not live yet',
  needs_decision: 'Question for you',
  suggested_change: 'Engine suggests a change',
  set_aside: 'Skipped by the engine',
  auto_removed: 'Removed by the engine',
  auto_changed: 'Changed by the engine',
  hidden: 'Hidden',
  rejected: 'Turned down',
  all: 'Everything',
};
/** The Restore button's title on a "Removed by the engine" row. */
export const RESTORE_AUTO_TITLE =
  'Restore — puts the entry back as it was before the engine removed it';
const TITLE: Partial<Record<KbFilterStatus, string>> = {
  approved: 'Entries the AI may use in drafts.',
  pending: 'Entries the AI does not use yet.',
  needs_decision: 'Saved answers waiting for a reviewer to approve or reject them.',
  suggested_change: 'Entries the engine proposes to merge, add to a case, rewrite or remove.',
  set_aside: 'Entries the engine leaves out of its cases, with the reason.',
  auto_removed:
    'Entries the engine removed at night — Restore puts one back as it was, for 90 days.',
  auto_changed:
    'Everything the engine did by itself in the last 90 days — removed, held, cleaned of customer details or made live. Each row has its own undo.',
  rejected:
    'Turned down by a person or by the engine — deleted 90 days later; Approve restores one before then.',
};

/**
 * The filter shows ONE of the two automatic-change statuses: "Changed automatically" where the
 * backend knows it (`autoChanged` true or not yet known), today's "Removed automatically" on an
 * older backend that answered without `filters.autoChangedStatus`. null: the backend has not
 * answered yet — NEITHER is offered (no flash of one that then turns into the other).
 */
export const KbStatusFilter = ({
  value,
  onChange,
  autoChanged = true,
}: {
  value: KbFilterStatus;
  onChange: (next: KbFilterStatus) => void;
  autoChanged?: boolean | null;
}) => (
  <div className="flex flex-col gap-2">
    <span className="text-xs font-semibold text-muted-foreground">Status</span>
    <div className="flex flex-wrap gap-1 w-fit">
      {KB_FILTER_STATUSES.filter((status) => {
        if (autoChanged === null && (status === 'auto_changed' || status === 'auto_removed'))
          return false;
        return (
          status !== (autoChanged && value !== 'auto_removed' ? 'auto_removed' : 'auto_changed')
        );
      }).map((status) => (
        <Button
          key={status}
          variant={value === status ? 'primary' : 'outline'}
          size="sm"
          className="h-8 text-xs"
          title={TITLE[status]}
          aria-pressed={value === status}
          onClick={() => onChange(status)}
        >
          {KB_FILTER_STATUS_LABEL[status]}
        </Button>
      ))}
    </div>
  </div>
);
