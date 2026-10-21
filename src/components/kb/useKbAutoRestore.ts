import { apiErrorMessage } from '@/lib/apiError';
import { toast } from '@/lib/toast';
import { kbAutoActionsService } from '@/services/kbAutoActions.service';

/**
 * Restore for the "Removed automatically" list: puts the entry back as it was before the nightly
 * removal (the Automatic actions restore route), which an Approve would not — Approve also marks
 * an entry the removal found unapproved as approved. Undefined when the list is not that filter,
 * so every other list keeps its own Restore (Approve).
 */
export const useKbAutoRestore = (
  enabled: boolean,
  reread: () => void
): ((id: number) => void) | undefined => {
  if (!enabled) return undefined;
  return (id: number) => {
    kbAutoActionsService.restore(id).then(
      () => {
        toast.success('Restored');
        reread();
      },
      (err: unknown) =>
        toast.error('Could not restore', { description: apiErrorMessage(err, 'Please try again.') })
    );
  };
};
