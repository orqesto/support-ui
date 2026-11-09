import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { usePermissions } from '@/hooks/usePermissions';
import { holdReasonClearable } from '@/lib/holdNote';
import { getApiErrorMessage } from '@/lib/errorMessages';
import { logger } from '@/lib/logger';
import { toast } from '@/lib/toast';
import { messageService, type MessageNote } from '@/services/message.service';

/**
 * "Clear reason" on a hold note (owner, 2026-11-09): a workspace admin (org admin, or a global
 * admin) may remove the reason a thread was put on hold with — the note itself stays, marked
 * "reason removed". Agents never see it; the backend refuses them too (403). Only a `kind: 'hold'`
 * note that still has a reason offers it.
 */
export const ClearHoldReasonAction = ({
  conversationId,
  note,
  onCleared,
}: {
  conversationId: number;
  note: MessageNote;
  onCleared: () => void;
}) => {
  const { isOrgAdmin } = usePermissions();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!isOrgAdmin || !holdReasonClearable(note)) return null;

  const clear = async () => {
    setBusy(true);
    try {
      const res = await messageService.clearHoldNoteReason(conversationId, note.id);
      if (res.success) {
        toast.success('Hold reason removed');
        onCleared();
      } else {
        toast.error(res.error ?? 'Could not remove the reason');
      }
    } catch (err) {
      logger.error('Failed to clear hold reason:', err);
      // The backend's own words: "only a workspace admin…" (403), "not a hold note" (400).
      toast.error(getApiErrorMessage(err) ?? 'Could not remove the reason');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setConfirmOpen(true)}
        disabled={busy}
        className="p-0 h-auto text-[10px] text-pending hover:text-destructive"
      >
        Clear reason
      </Button>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        onConfirm={() => void clear()}
        title="Remove the hold reason?"
        description="The note stays and shows “reason removed”. The reason cannot be brought back."
        confirmText="Clear reason"
      />
    </>
  );
};
