import { useRef, useState } from 'react';
import { apiErrorMessage } from '@/lib/apiError';
import { toast } from '@/lib/toast';
import type { KbFilterStatus } from '@/components/kb/KbStatusFilter';
import { kbAutoActionsService } from '@/services/kbAutoActions.service';

export type KbAutoRestore = {
  restore: (id: number) => void;
  /** Rows whose restore is in flight: their Restore is disabled until it answers. */
  pending: ReadonlySet<number>;
};

/**
 * Restore for the "Removed automatically" list: puts the entry back as it was before the nightly
 * removal (the Automatic actions restore route), which an Approve would not — Approve also marks
 * an entry the removal found unapproved as approved.
 *
 * Undefined unless the server APPLIED `status=auto_removed` to the rows on screen: an older
 * backend ignores the status, and its rows (rejected by a person, say) have no automatic removal
 * to undo — every other list keeps its own Restore (Approve). One call per row at a time.
 */
export const useKbAutoRestore = (
  canReview: boolean,
  filterStatus: KbFilterStatus,
  appliedStatus: { requested: KbFilterStatus; applied: boolean } | null,
  reread: () => void
): KbAutoRestore | undefined => {
  const inFlight = useRef(new Set<number>());
  const [pending, setPending] = useState<ReadonlySet<number>>(new Set());
  const settle = (id: number) => {
    inFlight.current.delete(id);
    setPending(new Set(inFlight.current));
  };
  const enabled =
    canReview &&
    filterStatus === 'auto_removed' &&
    appliedStatus?.requested === 'auto_removed' &&
    appliedStatus.applied;
  if (!enabled) return undefined;
  const restore = (id: number) => {
    if (inFlight.current.has(id)) return;
    inFlight.current.add(id);
    setPending(new Set(inFlight.current));
    kbAutoActionsService.restore(id).then(
      () => {
        settle(id);
        toast.success('Restored');
        reread();
      },
      (err: unknown) => {
        settle(id);
        toast.error('Could not restore', {
          description: apiErrorMessage(err, 'Please try again.'),
        });
      }
    );
  };
  return { restore, pending };
};
