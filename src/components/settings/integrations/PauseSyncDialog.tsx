/**
 * Pause a syncing Gmail mailbox — the other half of "Start sync" (GmailCountReview).
 *
 * The app could start a mailbox but not stop one: pausing took an API call by hand (staging,
 * 2026-10-30). Pausing sends exactly what Start sync sends, with `enabled: false`; the card then
 * shows its "Paused — not syncing · Check count and start" strip, which is how it resumes. Mail
 * that arrives meanwhile is fetched on the next start, from the saved checkpoint.
 */
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { apiErrorMessage } from '@/lib/apiError';
import { integrationsService } from '@/services/integrations.service';
import type { IntegrationCardProps } from '@/components/settings/integrations/types';

export type PauseTarget = { id: number; name: string };

export const PauseSyncDialog = ({
  target,
  onClose,
  onPaused,
  onShowAlert,
}: {
  target: PauseTarget | null;
  onClose: () => void;
  onPaused: () => Promise<void> | void;
  onShowAlert: IntegrationCardProps['onShowAlert'];
}) => {
  const pause = async (source: PauseTarget) => {
    onClose();
    try {
      await integrationsService.update(source.id, { type: 'gmail', enabled: false });
      await onPaused();
      onShowAlert({
        open: true,
        title: 'Sync paused',
        description: `${source.name} is not syncing. Use "Check count and start" to resume.`,
        variant: 'success',
      });
    } catch (err) {
      onShowAlert({
        open: true,
        title: 'Could not pause sync',
        description: apiErrorMessage(err, 'Failed to pause this mailbox'),
        variant: 'error',
      });
    }
  };

  return (
    <ConfirmDialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      onConfirm={() => {
        if (target) void pause(target);
      }}
      title="Pause syncing?"
      description={
        target
          ? `${target.name} stops fetching new mail until you start it again. Nothing already imported is removed.`
          : ''
      }
      confirmText="Pause sync"
      variant="warning"
    />
  );
};
