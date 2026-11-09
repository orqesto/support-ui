import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import { NOTIFICATION_COUNTS_KEY } from '@/hooks/useNotificationCounts';
import { apiClient } from '@/lib/api-client';
import { getApiErrorMessage } from '@/lib/errorMessages';
import { logger } from '@/lib/logger';
import { similarResultsCache } from '@/lib/similarResultsCache';
import { toast } from '@/lib/toast';
import { messageService, type MessageThread } from '@/services/message.service';
import type { Message } from '@/types';
import { threadIdForMessage } from '../components/threadForMessage';
import type { SetMessagesPageAlert } from './messagesPageAlert';
import type { useMessagesData } from './useMessagesData';

type Data = ReturnType<typeof useMessagesData>;

/** "Check mailboxes now" and deleting a thread. Plain functions, re-created each render as they were in MessagesPage. */
export const useThreadDeleteAndSync = ({
  setRefreshing,
  fetchMessages,
  setAlertDialog,
  setMessageToDelete,
  setDeleteDialogOpen,
  messageToDelete,
  deletingRef,
  setDeleting,
  selectedMessage,
  clearCache,
  queryClient,
  setSelectedMessage,
  threads,
  selectedThreadIdRef,
  moveSelectedCard,
  bumpKanban,
}: {
  setRefreshing: Data['setRefreshing'];
  fetchMessages: Data['fetchMessages'];
  setAlertDialog: SetMessagesPageAlert;
  setMessageToDelete: Dispatch<SetStateAction<Message | null>>;
  setDeleteDialogOpen: Dispatch<SetStateAction<boolean>>;
  messageToDelete: Message | null;
  deletingRef: MutableRefObject<boolean>;
  setDeleting: Dispatch<SetStateAction<boolean>>;
  selectedMessage: Message | null;
  clearCache: Data['clearCache'];
  queryClient: QueryClient;
  setSelectedMessage: Dispatch<SetStateAction<Message | null>>;
  threads: MessageThread[];
  selectedThreadIdRef: MutableRefObject<string | null>;
  moveSelectedCard: (targetColId: string | null) => void;
  bumpKanban: () => void;
}) => {
  const handleSyncEmails = async () => {
    // Auth is enforced by the httpOnly `jwt` cookie + BE 401 on the apiClient call.
    // No client-side gate — the catch below surfaces failures (including session-expired).
    try {
      setRefreshing(true);
      await apiClient.post('/api/messages/check-emails');

      // Poll for new messages — backend processes emails asynchronously
      let attempts = 0;
      const poll = async (): Promise<void> => {
        attempts++;
        await fetchMessages(1, true).catch((err) => logger.error('Failed to fetch messages:', err));
        if (attempts < 3) {
          setTimeout(() => void poll(), attempts * 1500);
        } else {
          setRefreshing(false);
        }
      };
      setTimeout(() => void poll(), 1000);
    } catch (error) {
      logger.error('Failed to sync emails:', error);
      setRefreshing(false);
      setAlertDialog({
        open: true,
        title: 'Sync Failed',
        description: 'Failed to sync emails',
        variant: 'error',
      });
    }
  };

  const handleDeleteClick = (message: Message) => {
    setMessageToDelete(message);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!messageToDelete || deletingRef.current) return;
    const target = messageToDelete;
    // Delete is offered from the open detail, so its card is the one captured when it opened.
    const deletingOpenThread = selectedMessage?.id === target.id;

    deletingRef.current = true;
    setDeleting(true);
    try {
      await messageService.delete(target.id);
    } catch (error) {
      logger.error('Failed to delete message:', error);
      // The full page's wording: the server's reason when it gave one (a 4xx), else generic.
      // The dialog stays up, so a retry is one press away.
      toast.error(getApiErrorMessage(error) ?? 'Failed to delete thread');
      return;
    } finally {
      deletingRef.current = false;
      setDeleting(false);
    }
    clearCache();
    void queryClient.invalidateQueries({ queryKey: NOTIFICATION_COUNTS_KEY });
    setDeleteDialogOpen(false);
    similarResultsCache.delete(target.id);
    setMessageToDelete(null);
    /*
      The detail stayed open behind the question (Cancel leaves it as it was); only now that the
      thread is gone does it close — and only if it is still the deleted one.
    */
    setSelectedMessage((current) => (current?.id === target.id ? null : current));
    /*
      The board too: the backend emits no delete event, so nothing else takes the card away. The
      open thread's card goes at once (a full board refetch where none was captured — list mode,
      a deep link); anything else is a refetch.
    */
    // The captured card is trusted only if it IS the deleted message's thread: Back / a merge's
    // navigation change the open message without touching the ref, and moving the captured card
    // would take a LIVE card off the board while the deleted one stayed.
    const deletedCard = threadIdForMessage(threads, target.id);
    if (deletingOpenThread && deletedCard !== null && selectedThreadIdRef.current === deletedCard) {
      moveSelectedCard(null);
    } else {
      bumpKanban();
    }
    if (deletingOpenThread) selectedThreadIdRef.current = null;
    await fetchMessages(1, true).catch((err) => logger.error('Failed to fetch messages:', err));
  };

  return { handleSyncEmails, handleDeleteClick, handleDeleteConfirm };
};
