import type { AlertDialogProps } from '@/components/ui/AlertDialog';
import { logger } from '@/lib/logger';
import { kbService, type KBEntry } from '@/services/kb.service';

type Alert = Pick<AlertDialogProps, 'open' | 'title' | 'description' | 'variant'>;

/** What the KB page says after a delete: restorable on a backend whose delete is soft. */
const kbDeletedNotice = (softDelete: boolean): string =>
  softDelete
    ? 'KB entry deleted. You can restore it from Deleted for 90 days.'
    : 'KB entry deleted';

/**
 * Restore of an entry or document a person deleted (soft delete, BE #1400): back as it was before
 * the delete, then the page re-reads. The server's refusal (outside the caller's teams, no longer
 * deleted) is shown as it worded it.
 */
export const makeKbRestoreDeleted =
  (reread: () => void, showAlert: (alert: Alert) => void) =>
  (entry: KBEntry): void => {
    kbService
      .restoreDeleted(entry.id)
      .then(() => {
        reread();
        showAlert({
          open: true,
          title: 'Restored',
          description: 'The entry is back as it was before it was deleted.',
          variant: 'success',
        });
      })
      .catch((error: unknown) => {
        logger.error('Failed to restore deleted entry:', error);
        showAlert({
          open: true,
          title: 'Restore Failed',
          description:
            error instanceof Error && error.message ? error.message : 'Failed to restore the entry',
          variant: 'error',
        });
      });
  };

/**
 * The KB page's Delete confirmation (moved out of KnowledgeBasePage, file size): delete, close
 * the dialog, re-read the list, say so — restorable for 90 days where the backend's delete is soft.
 */
export const confirmKbDelete = async (
  entry: KBEntry | null,
  softDelete: boolean,
  page: {
    setDeleting: (deleting: boolean) => void;
    close: () => void;
    reread: () => Promise<void>;
    showAlert: (alert: Alert) => void;
  }
): Promise<void> => {
  if (!entry) return;
  page.setDeleting(true);
  try {
    await kbService.delete(entry.id);
    page.close();
    await page.reread();
    page.showAlert({
      open: true,
      title: 'Success',
      description: kbDeletedNotice(softDelete),
      variant: 'success',
    });
  } catch (error) {
    logger.error('Failed to delete entry:', error);
    page.showAlert({
      open: true,
      title: 'Delete Failed',
      description: 'Failed to delete entry',
      variant: 'error',
    });
  } finally {
    page.setDeleting(false);
  }
};
