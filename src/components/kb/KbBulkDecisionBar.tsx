import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { toast } from '@/lib/toast';
import type { BulkOutcome, useKbBulkDecisions } from '@/hooks/useKbBulkDecisions';

type Bulk = ReturnType<typeof useKbBulkDecisions>;

/** "Approved 3 · 1 already decided elsewhere · 1 failed" — nothing is dropped silently. */
export const describeBulkOutcome = (verb: string, outcome: BulkOutcome) =>
  [
    `${verb} ${outcome.done}`,
    outcome.skipped > 0 ? `${outcome.skipped} already decided elsewhere` : null,
    outcome.failed > 0 ? `${outcome.failed} failed` : null,
  ]
    .filter(Boolean)
    .join(' · ');

/** The bar belongs to the two decision filters only. */
export const bulkModeFor = (status: string) =>
  status === 'needs_decision' || status === 'suggested_change' ? status : null;

type Props = { bulk: Bulk; mode: 'needs_decision' | 'suggested_change' };

export const KbBulkDecisionBar = ({ bulk, mode }: Props) => {
  const [confirming, setConfirming] = useState(false);
  const count = mode === 'needs_decision' ? bulk.captureCount : bulk.removeCount;
  const allSelected =
    bulk.selectableIds.length > 0 && bulk.selectableIds.every((id) => bulk.selected.has(id));

  const run = async (verb: string, action: () => Promise<BulkOutcome>) => {
    try {
      const outcome = await action();
      const message = describeBulkOutcome(verb, outcome);
      if (outcome.failed > 0) toast.error(message);
      else toast.success(message);
    } catch {
      toast.error(`${verb} failed — the list was refreshed`);
    }
  };

  if (bulk.selectableIds.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
      <Checkbox
        label={`Select all (${bulk.selectableIds.length})`}
        checked={allSelected}
        disabled={bulk.busy}
        onChange={(event) => {
          for (const id of bulk.selectableIds) bulk.toggle(id, event.target.checked);
        }}
      />
      {mode === 'needs_decision' ? (
        <>
          <Button
            size="sm"
            disabled={bulk.busy || count === 0}
            onClick={() => void run('Approved', bulk.approveSelected)}
          >
            Approve selected ({count})
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={bulk.busy || count === 0}
            onClick={() => setConfirming(true)}
          >
            Reject selected ({count})
          </Button>
        </>
      ) : (
        <Button
          size="sm"
          variant="outline"
          disabled={bulk.busy || count === 0}
          onClick={() => setConfirming(true)}
        >
          Remove selected ({count})
        </Button>
      )}
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        onConfirm={() =>
          mode === 'needs_decision'
            ? void run('Rejected', bulk.rejectSelected)
            : void run('Removed', bulk.removeSelected)
        }
        title={mode === 'needs_decision' ? 'Reject selected answers?' : 'Remove selected entries?'}
        description={`${count} selected ${count === 1 ? 'entry' : 'entries'} will be ${
          mode === 'needs_decision' ? 'rejected' : 'removed from the knowledge base'
        }.`}
        confirmText={mode === 'needs_decision' ? 'Reject' : 'Remove'}
      />
    </div>
  );
};
