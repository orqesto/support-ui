import { Button } from '@/components/ui/Button';
import type { KbListStatus } from '@/services/kb.service';

export type KbFilterStatus = 'all' | KbListStatus;
export const KB_FILTER_STATUSES: readonly KbFilterStatus[] = [
  'needs_decision',
  'suggested_change',
  'set_aside',
  'approved',
  'pending',
  'hidden',
  'rejected',
  'all',
];
const LABEL: Record<KbFilterStatus, string> = {
  needs_decision: 'Needs your decision',
  suggested_change: 'Suggested change',
  set_aside: 'Set aside',
  approved: 'Approved',
  pending: 'Pending',
  hidden: 'Hidden',
  rejected: 'Rejected',
  all: 'All',
};
const TITLE: Partial<Record<KbFilterStatus, string>> = {
  needs_decision: 'Saved answers waiting for a reviewer to approve or reject them.',
  suggested_change:
    'Entries the nightly review proposes to merge, add to a case, rewrite or remove.',
  set_aside: 'Entries the cases report leaves out, with the reason.',
  rejected:
    'Rejected by a reviewer or automatically — deleted 90 days after the reject; Approve restores one before then.',
};

export const KbStatusFilter = ({
  value,
  onChange,
}: {
  value: KbFilterStatus;
  onChange: (next: KbFilterStatus) => void;
}) => (
  <div className="flex flex-col gap-2">
    <span className="text-xs font-semibold text-muted-foreground">Status:</span>
    <div className="flex flex-wrap gap-1 w-fit">
      {KB_FILTER_STATUSES.map((status) => (
        <Button
          key={status}
          variant={value === status ? 'primary' : 'outline'}
          size="sm"
          className="h-8 text-xs"
          title={TITLE[status]}
          onClick={() => onChange(status)}
        >
          {LABEL[status]}
        </Button>
      ))}
    </div>
  </div>
);
