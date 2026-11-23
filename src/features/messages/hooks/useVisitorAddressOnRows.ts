import { useEffect, useRef } from 'react';
import {
  getSocket,
  releaseSocket,
  subscribeToEvent,
  unsubscribeFromEvent,
} from '@/lib/socketManager';
import { isNoEmailVisitor } from '@/lib/visitorEmail';
import { messageService, type MessageThread } from '@/services/message.service';
import { CONVERSATION_NEW_EVENT } from './useConversationNewRefresh';

export const VISITOR_ADDRESS_ROW_REFRESH_MS = 500;

/**
 * A website visitor who left no email leaves one later: the row on screen learns it.
 *
 * The backend puts the address on the conversation and announces it as `conversation:new`. On the
 * list's first page that event only counts new threads (the "N new" bar) and reads no row, so the
 * row kept saying "Website visitor (no email)" until a reload while the open thread beside it
 * already showed the address. Only for a row that is shown AND still nameless, the conversation is
 * read once and its requester put on the row — nothing is reordered, no page is re-read.
 *
 * One read per conversation per window; events inside it join that read.
 */
export function useVisitorAddressOnRows(
  threads: MessageThread[],
  patchThread: (threadId: string, patch: Partial<MessageThread>) => void
): void {
  const rowsRef = useRef(threads);
  const patchRef = useRef(patchThread);
  useEffect(() => {
    rowsRef.current = threads;
    patchRef.current = patchThread;
  }, [threads, patchThread]);

  useEffect(() => {
    getSocket();
    let live = true;
    const timers = new Map<number, ReturnType<typeof setTimeout>>();
    const read = async (conversationId: number) => {
      try {
        const sender = (await messageService.getById(conversationId)).data?.sender;
        if (live && sender && !isNoEmailVisitor(sender))
          patchRef.current(`conv_${conversationId}`, { sender });
      } catch {
        // The row keeps its label; the next read of the list brings the address.
      }
    };
    const onNewConversation = (data: unknown) => {
      const conversationId = (data as { conversationId?: unknown } | null)?.conversationId;
      if (typeof conversationId !== 'number' || timers.has(conversationId)) return;
      const waiting = rowsRef.current.some(
        (row) => row.threadId === `conv_${conversationId}` && isNoEmailVisitor(row.sender)
      );
      if (!waiting) return;
      timers.set(
        conversationId,
        setTimeout(() => {
          timers.delete(conversationId);
          void read(conversationId);
        }, VISITOR_ADDRESS_ROW_REFRESH_MS)
      );
    };
    subscribeToEvent(CONVERSATION_NEW_EVENT, onNewConversation);
    return () => {
      live = false;
      unsubscribeFromEvent(CONVERSATION_NEW_EVENT, onNewConversation);
      timers.forEach((timer) => clearTimeout(timer));
      releaseSocket();
    };
  }, []);
}
