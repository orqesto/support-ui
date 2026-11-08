import { useState, useEffect } from 'react';
import { isTriageMessage } from '@/lib/messageHelpers';
import { usePermissions } from '@/hooks/usePermissions';
import type { Message } from '@/types';

/** In-flight flags, the confirm dialogs' open state and the per-user read state. */

export function useDetailDialogs(message: Message) {
  const [submitting, setSubmitting] = useState(false);
  const [resolving, setResolving] = useState(false);
  // Which resolve is in flight when it is "Resolve & save to KB" — its row shows "Saving to KB…".
  const [savingToKb, setSavingToKb] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [reopenDialogOpen, setReopenDialogOpen] = useState(false);
  const [resolveConfirmOpen, setResolveConfirmOpen] = useState(false);
  const [notCustomerWorkOpen, setNotCustomerWorkOpen] = useState(false);
  // Offered on a finished conversation: "Resolve & Save to KB" captures only while resolving.
  const [promoteToKbOpen, setPromoteToKbOpen] = useState(false);
  const { hasPermission } = usePermissions();
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  // Per-user read/unread state (triage queues only). Optimistically tracked so the
  // header toggle reflects instantly; synced whenever the message prop changes.
  const isTriage = isTriageMessage(message);
  const [readState, setReadState] = useState<boolean>(message.isRead ?? false);
  const [markReadPromptOpen, setMarkReadPromptOpen] = useState(false);
  useEffect(() => {
    setReadState(message.isRead ?? false);
  }, [message.id, message.isRead]);
  return {
    submitting,
    setSubmitting,
    resolving,
    setResolving,
    savingToKb,
    setSavingToKb,
    rejectDialogOpen,
    setRejectDialogOpen,
    reopenDialogOpen,
    setReopenDialogOpen,
    resolveConfirmOpen,
    setResolveConfirmOpen,
    notCustomerWorkOpen,
    setNotCustomerWorkOpen,
    promoteToKbOpen,
    setPromoteToKbOpen,
    hasPermission,
    closeConfirmOpen,
    setCloseConfirmOpen,
    isTriage,
    readState,
    setReadState,
    markReadPromptOpen,
    setMarkReadPromptOpen,
  };
}
