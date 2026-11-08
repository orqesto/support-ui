import { messageService } from '@/services/message.service';
import { getApiErrorMessage, getErrorStatus } from '@/lib/errorMessages';
import { logger } from '@/lib/logger';
import { toast } from '@/lib/toast';

export const DISMISS_UNAVAILABLE_MESSAGE =
  "Dismissing contradictions isn't available on this server yet.";

/**
 * "Not a contradiction" — POST /api/messages/:id/contradiction/dismiss. The backend stamps
 * `contradictionCheck.dismissedAt`, after which every badge, chip and the Conflict tab read the
 * thread as clean. Resolves true on success.
 *
 * A backend that predates the route answers 404 (the frontend deploys on merge, the backend on a
 * tag): one short line, not an error dump, and the flag stays as it was.
 */
export const dismissContradictionWithFeedback = async (messageId: number): Promise<boolean> => {
  try {
    await messageService.dismissContradiction(messageId);
    return true;
  } catch (err) {
    logger.error('Failed to dismiss contradiction:', err);
    toast.error(
      getErrorStatus(err) === 404
        ? DISMISS_UNAVAILABLE_MESSAGE
        : (getApiErrorMessage(err) ?? 'Could not dismiss the contradiction.')
    );
    return false;
  }
};
