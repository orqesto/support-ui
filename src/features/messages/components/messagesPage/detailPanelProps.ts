import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import { NOTIFICATION_COUNTS_KEY } from '@/hooks/useNotificationCounts';
import { messageService, type MessageThread } from '@/services/message.service';
import type { Message, MessagesDisplayMode } from '@/types';
import type { useMessagesData } from '../../hooks/useMessagesData';
import type { MessageDetailProps } from '../MessageDetail';

type Data = ReturnType<typeof useMessagesData>;

export type DetailPanelDeps = {
  /** The page's one close (the backdrop's fallback uses the same). */
  closeDetail: () => void;
  setSelectedMessage: Dispatch<SetStateAction<Message | null>>;
  moveSelectedCard: (targetColId: string | null) => void;
  rereadSelectedMessage: () => Promise<void>;
  displayMode: MessagesDisplayMode;
  handleNavigate: (direction: 'next' | 'prev') => void;
  handleApprove: (message: Message) => void;
  handleRejected: () => Promise<void>;
  handleReopen: (message: Message) => Promise<void>;
  canDelete: boolean;
  handleDeleteClick: (message: Message) => void;
  handleResolve: () => Promise<void>;
  isKanban: boolean;
  threads: MessageThread[];
  handleRowReadChanged: (isRead: boolean, thread: MessageThread) => void;
  bumpKanban: () => void;
  fetchMessages: Data['fetchMessages'];
  messagesPagination: Data['messagesPagination'];
  detailRequestCloseRef: MutableRefObject<(() => void) | null>;
  handleRefreshMessage: () => Promise<void>;
  clearCache: Data['clearCache'];
  queryClient: QueryClient;
};

/**
 * The open thread's detail props, wired to the page. Moved unchanged from MessagesPage's JSX:
 * the same closures, re-created on each render as they were there. The page keeps the lazy
 * `MessageDetail` itself and spreads these onto it.
 */
export const detailPanelProps = (
  selectedMessage: Message,
  {
    closeDetail,
    setSelectedMessage,
    moveSelectedCard,
    rereadSelectedMessage,
    displayMode,
    handleNavigate,
    handleApprove,
    handleRejected,
    handleReopen,
    canDelete,
    handleDeleteClick,
    handleResolve,
    isKanban,
    threads,
    handleRowReadChanged,
    bumpKanban,
    fetchMessages,
    messagesPagination,
    detailRequestCloseRef,
    handleRefreshMessage,
    clearCache,
    queryClient,
  }: DetailPanelDeps
): Omit<MessageDetailProps, 'message'> => ({
  onClose: closeDetail,
  onReplied: () => moveSelectedCard('awaiting'),
  onStatusChanged: () => void rereadSelectedMessage(),
  // Only the threads view has one unambiguous order; in kanban "next" could mean
  // the next card in the column or across the board, so J/K stay off there.
  onNavigate: displayMode === 'threads' ? handleNavigate : undefined,
  onOptimisticMove: (columnId) => moveSelectedCard(columnId),
  onApprove: () => handleApprove(selectedMessage),
  // Async, as the JSX handlers were (that rule does not check JSX attributes).
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  onReject: async () => {
    await handleRejected();
    setSelectedMessage(null);
  },
  // Async, as the JSX handlers were (that rule does not check JSX attributes).
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  onReopen: async () => {
    await handleReopen(selectedMessage);
  },
  // The detail stays open until the delete succeeds: Cancel leaves it as it was,
  // with focus back on More (the header's focus return waits for the dialog).
  onDelete: canDelete ? () => handleDeleteClick(selectedMessage) : undefined,
  // Async, as the JSX handlers were (that rule does not check JSX attributes).
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  onResolve: handleResolve,
  onReadChanged: (isRead) => {
    // The board draws its own cards: it re-reads so the triage unread dot updates, without
    // tearing down the open detail panel. On the list the open thread's row is patched.
    const row =
      isRead === undefined || isKanban
        ? undefined
        : threads.find(
            (thread) =>
              thread.latestMessage?.id === selectedMessage.id ||
              thread.latestIncomingMessage?.id === selectedMessage.id
          );
    if (row && isRead !== undefined) handleRowReadChanged(isRead, row);
    else {
      bumpKanban();
      void fetchMessages(messagesPagination.page, true);
    }
  },
  onRegisterRequestClose: (fn) => {
    detailRequestCloseRef.current = fn;
  },
  // Async, as the JSX handlers were (that rule does not check JSX attributes).
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  onRefresh: handleRefreshMessage,
  onClassify: async (action, createDetectionRule, trainSpamFilter, confirm) => {
    await messageService.classify(
      selectedMessage.id,
      action,
      createDetectionRule,
      trainSpamFilter,
      confirm
    );
    clearCache();
    bumpKanban();
    void queryClient.invalidateQueries({ queryKey: NOTIFICATION_COUNTS_KEY });
    await fetchMessages(messagesPagination.page, true);
    setSelectedMessage(null);
  },
});
