import { useCallback, useState } from 'react';
import { assignmentService } from '@/services/assignment.service';
import { getApiErrorMessage } from '@/lib/errorMessages';
import { toast } from '@/lib/toast';
import { logger } from '@/lib/logger';

/**
 * "Assign to me" in one press — the same assignment the Assigned picker makes, keyed
 * `conv_<id>` (HeaderMetaStrip explains why the old `subj::` key 500s).
 *
 * `canAssign` is false when there is no signed-in user or the conversation is already theirs,
 * so the button never offers a no-op.
 */
export const useAssignToMe = ({
  messageId,
  assigneeId,
  currentUserId,
  onAssigned,
}: {
  messageId: number;
  assigneeId: number | null | undefined;
  currentUserId: number | null;
  onAssigned?: () => void;
}) => {
  const [assigning, setAssigning] = useState(false);
  const canAssign = currentUserId !== null && assigneeId !== currentUserId;

  const assignToMe = useCallback(async () => {
    if (currentUserId === null) return;
    setAssigning(true);
    try {
      await assignmentService.assignThread(`conv_${messageId}`, currentUserId);
      onAssigned?.();
    } catch (err) {
      logger.error('Failed to assign to me:', err);
      // ⛔ Surfaced, not swallowed: the backend refuses an assignee outside the conversation's
      // department, and a button that silently does nothing reads as broken.
      toast.error(getApiErrorMessage(err) ?? 'Could not assign this conversation to you.');
    } finally {
      setAssigning(false);
    }
  }, [messageId, currentUserId, onAssigned]);

  return { canAssign, assigning, assignToMe };
};
