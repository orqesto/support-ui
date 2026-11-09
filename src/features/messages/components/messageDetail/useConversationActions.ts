import { useEffect, useCallback } from 'react';
import { messageService } from '@/services/message.service';
import { logger } from '@/lib/logger';
import { toast } from '@/lib/toast';
import { getApiErrorMessage } from '@/lib/errorMessages';
import type { Message } from '@/types';
import { noKbResolveDialog, type ResolveMode } from '../resolveMode';
import type { MessageDetailProps } from './types';
import type { useDetailDialogs } from './useDetailDialogs';

/** Resolve / close, the per-user read state and the prompt-aware close. */

export function useConversationActions({
  message,
  resolveMode,
  dialogs,
  onResolve,
  onReadChanged,
  onClose,
  onRegisterRequestClose,
}: {
  message: Message;
  resolveMode: ResolveMode;
  dialogs: ReturnType<typeof useDetailDialogs>;
} & Pick<
  MessageDetailProps,
  'onResolve' | 'onReadChanged' | 'onClose' | 'onRegisterRequestClose'
>) {
  const {
    isTriage,
    readState,
    setReadState,
    setResolving,
    setSavingToKb,
    setMarkReadPromptOpen,
    setRejectDialogOpen,
    setCloseConfirmOpen,
  } = dialogs;
  const handleResolveWithoutReply = useCallback(async () => {
    setResolving(true);
    setSavingToKb(true);
    try {
      await messageService.resolve(message.id);
      onResolve?.();
    } catch (err) {
      logger.error('Failed to resolve:', err);
    } finally {
      setResolving(false);
      setSavingToKb(false);
    }
  }, [message.id, onResolve, setResolving, setSavingToKb]);

  const handleClose = useCallback(async () => {
    setResolving(true);
    try {
      await messageService.close(message.id);
      onResolve?.();
    } catch (err) {
      logger.error('Failed to close:', err);
    } finally {
      setResolving(false);
    }
  }, [message.id, onResolve, setResolving]);

  // Per-user read/unread (triage). Optimistic with revert on failure; onReadChanged
  // lets the board refresh the unread dot without tearing down the detail.
  const applyRead = useCallback(
    async (next: boolean) => {
      setReadState(next);
      try {
        if (next) await messageService.markRead(message.id);
        else await messageService.markUnread(message.id);
        onReadChanged?.(next);
      } catch (err) {
        setReadState(!next);
        logger.error('Failed to update read state:', err);
        toast.error(getApiErrorMessage(err) ?? 'Could not update read state');
      }
    },
    [message.id, onReadChanged, setReadState]
  );

  const handleToggleRead = useCallback(() => {
    void applyRead(!readState);
  }, [applyRead, readState]);

  // Closing an unread triage thread prompts "mark as read?" first (per-user review
  // marker). Read threads, or non-triage threads, close immediately.
  const handleRequestClose = useCallback(() => {
    if (isTriage && !readState) {
      setMarkReadPromptOpen(true);
    } else {
      onClose?.();
    }
  }, [isTriage, readState, onClose, setMarkReadPromptOpen]);

  // Expose the prompt-aware close to the parent so out-of-panel close gestures
  // (the backdrop) go through the same "Mark as read?" prompt as the header X.
  // Re-registers whenever the handler identity changes (readState/isTriage), and
  // clears on unmount so a stale handler can't fire against a torn-down panel.
  useEffect(() => {
    onRegisterRequestClose?.(handleRequestClose);
    return () => onRegisterRequestClose?.(null);
  }, [handleRequestClose, onRegisterRequestClose]);

  // One-press Resolve, shared by the header button and the E shortcut so the two can never
  // disagree. It opens the SAME confirm the old footer did (resolveMode.ts) — E never resolves
  // in one keystroke; the dialog is the confirmation (owner decision, 2026-09-22).
  const openResolveDialog = useCallback(() => {
    if (resolveMode === null) return;
    if (noKbResolveDialog(resolveMode) === 'reject') setRejectDialogOpen(true);
    else setCloseConfirmOpen(true);
  }, [resolveMode, setCloseConfirmOpen, setRejectDialogOpen]);
  return {
    handleResolveWithoutReply,
    handleClose,
    applyRead,
    handleToggleRead,
    handleRequestClose,
    openResolveDialog,
  };
}
