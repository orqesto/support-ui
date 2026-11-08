import {
  useCallback,
  useEffect,
  useRef,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react';
import type { NavigateFunction, SetURLSearchParams } from 'react-router-dom';
import { getApiErrorMessage, getErrorStatus } from '@/lib/errorMessages';
import { logger } from '@/lib/logger';
import { getConvUrlId } from '@/lib/messageHelpers';
import { toast } from '@/lib/toast';
import { messageService, type MessageThread } from '@/services/message.service';
import type { Message } from '@/types';
import { neighbourThread } from '../components/detailShortcuts';
import { threadIdForMessage } from '../components/threadForMessage';
import type { SetMessagesPageAlert } from './messagesPageAlert';
import type { useMessagesData } from './useMessagesData';

type Data = ReturnType<typeof useMessagesData>;

/** What the open thread's detail asks the page to do: step, resolve, reopen, re-read. Moved unchanged from MessagesPage. */
export const useThreadDetailActions = ({
  selectedMessage,
  setSelectedMessage,
  threads,
  drawnThreads,
  handleOpenThread,
  selectedThreadIdRef,
  navigate,
  clearCache,
  moveSelectedCard,
  fetchMessages,
  messagesPagination,
  bumpKanban,
  searchParams,
  setSearchParams,
  orgCode,
  setAlertDialog,
}: {
  selectedMessage: Message | null;
  setSelectedMessage: Dispatch<SetStateAction<Message | null>>;
  threads: MessageThread[];
  drawnThreads: MessageThread[];
  handleOpenThread: (thread: MessageThread) => Promise<void>;
  selectedThreadIdRef: MutableRefObject<string | null>;
  navigate: NavigateFunction;
  clearCache: Data['clearCache'];
  moveSelectedCard: (targetColId: string | null) => void;
  fetchMessages: Data['fetchMessages'];
  messagesPagination: Data['messagesPagination'];
  bumpKanban: () => void;
  searchParams: URLSearchParams;
  setSearchParams: SetURLSearchParams;
  orgCode: string | null | undefined;
  setAlertDialog: SetMessagesPageAlert;
}) => {
  // A thread opened from a deep link / reload never went through `handleOpenThread`, so the ref
  // below was null: J/K had nothing to step from, and a status change could not move the card.
  // Recover it from the loaded threads (threadForMessage.ts has the matching rule).
  useEffect(() => {
    if (!selectedMessage) return;
    if (selectedThreadIdRef.current) return;
    const recovered = threadIdForMessage(threads, selectedMessage.id);
    if (recovered) selectedThreadIdRef.current = recovered;
  }, [selectedMessage, threads, selectedThreadIdRef]);

  // J/K from the detail rail — neighbourThread (detailShortcuts.ts) has the rules.
  const handleNavigate = useCallback(
    (direction: 'next' | 'prev') => {
      const target = neighbourThread(drawnThreads, selectedThreadIdRef.current, direction);
      if (target) void handleOpenThread(target);
    },
    [drawnThreads, handleOpenThread, selectedThreadIdRef]
  );

  const handleApprove = (message: Message) => {
    navigate(`/tickets/create?messageId=${message.id}`);
  };

  const handleResolve = async () => {
    clearCache();
    // Instant Kanban move to Resolved (falls back to a full refetch in list mode).
    moveSelectedCard('resolved');
    await fetchMessages(messagesPagination.page, true);
    selectedThreadIdRef.current = null;
    setSelectedMessage(null);
  };

  // AFTER the detail has processed the conversation — it posts `markAsProcessed` itself (for
  // "Resolve" on an unreviewed thread AND for "Not customer work"), exactly as MessageDetailPage's
  // onReject assumes. ⛔ This used to post it AGAIN: every such press wrote a second
  // `mark_processed` audit entry — on a binned thread, one claiming someone marked it processed
  // after binning it — and reset closedAt.
  const handleRejected = async () => {
    try {
      clearCache();
      // Mark-as-processed closes the conversation → Resolved column.
      moveSelectedCard('resolved');
      selectedThreadIdRef.current = null;
      setSelectedMessage(null);
      await fetchMessages(messagesPagination.page, true);
    } catch (error) {
      logger.error('Failed to refresh after processing:', error);
    }
  };

  const handleReopen = async (message: Message) => {
    try {
      const reopenedMessageId = message.id;
      await messageService.reopen(message.id);
      clearCache();
      bumpKanban();
      await fetchMessages(messagesPagination.page, true);

      const response = await messageService.getById(reopenedMessageId);
      if (response.success && response.data) {
        setSelectedMessage(response.data);

        const params = new URLSearchParams(searchParams);
        params.set('id', getConvUrlId(response.data, orgCode));
        setSearchParams(params);
      }
    } catch (error: unknown) {
      logger.error('Failed to reopen message:', error);
      const errorMsg = getApiErrorMessage(error) ?? 'Failed to reopen thread';
      setAlertDialog({
        open: true,
        title: 'Reopen Failed',
        description: errorMsg,
        variant: 'error',
      });
    }
  };

  const refreshAbortRef = useRef<AbortController | null>(null);
  // The open thread's id NOW, for an answer that lands after the agent moved on.
  const selectedMessageIdRef = useRef<number | undefined>(undefined);
  selectedMessageIdRef.current = selectedMessage?.id;

  /**
   * Re-read ONLY the open thread after the backend changed its status (useConversationStatusRefresh).
   * The list and board follow `conv:status_changed` on their own (the handler below), so this
   * must not reload them a second time — that is why it is not handleRefreshMessage.
   */
  const rereadSelectedMessage = useCallback(async () => {
    const openId = selectedMessage?.id;
    if (openId === undefined) return;
    try {
      const response = await messageService.getById(openId);
      if (response.success && response.data) {
        const data: Message = response.data;
        // Only if the agent is still on the same thread when the answer lands.
        setSelectedMessage((current) => (current?.id === openId ? data : current));
      }
    } catch (error) {
      const status = getErrorStatus(error);
      // Gone for this agent (moved to a team they cannot open, merged away, deleted): kept on
      // screen it showed an old status with no notice (review of #805). Close it and say why —
      // only if they are still on it.
      if ((status === 403 || status === 404) && selectedMessageIdRef.current === openId) {
        toast.warning(
          getApiErrorMessage(error) ??
            'This thread is no longer available to you — it was moved, merged or deleted.'
        );
        // From the URL as it is NOW: a filter changed while the read was out stays changed.
        setSearchParams((current) => {
          const params = new URLSearchParams(current);
          params.delete('id');
          return params;
        });
        selectedThreadIdRef.current = null;
        setSelectedMessage(null);
        return;
      }
      logger.error('Failed to re-read the open thread after a status change:', error);
    }
  }, [selectedMessage?.id, setSearchParams, selectedThreadIdRef, setSelectedMessage]);

  const handleRefreshMessage = useCallback(async () => {
    if (!selectedMessage) return;
    refreshAbortRef.current?.abort();
    const abortController = new AbortController();
    refreshAbortRef.current = abortController;
    try {
      clearCache();
      // The open record and the list are read side by side, not one after the other: neither
      // needs the other's answer.
      const listRead = fetchMessages(messagesPagination.page, true);
      // A reply or a header status change (park → on-hold, set-status, etc.)
      // flips the derived workflow status (e.g. → Pending after an agent reply),
      // which moves the card to a different Kanban column. The list refetch
      // covers list mode; the Kanban view reloads its columns only when the
      // refreshKey bumps, so bump it here too — otherwise the card stays in the
      // old column until the agent manually changes a filter.
      bumpKanban();
      const response = await messageService.getById(selectedMessage.id);
      if (!abortController.signal.aborted && response.success && response.data) {
        const data: Message = response.data;
        setSelectedMessage({
          ...data,
          lastReplyFromClient: data.lastReplyFromClient ?? selectedMessage.lastReplyFromClient,
        });
      }
      await listRead;
    } catch (error) {
      if (!abortController.signal.aborted) {
        logger.error('Failed to refresh message:', error);
      }
    }
  }, [
    selectedMessage,
    clearCache,
    fetchMessages,
    messagesPagination.page,
    bumpKanban,
    setSelectedMessage,
  ]);

  return {
    handleNavigate,
    handleApprove,
    handleResolve,
    handleRejected,
    handleReopen,
    rereadSelectedMessage,
    handleRefreshMessage,
  };
};
