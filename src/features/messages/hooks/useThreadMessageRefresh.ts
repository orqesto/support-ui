import { useEffect, useRef } from 'react';
import { getSocket, releaseSocket, subscribeToEvent, unsubscribeFromEvent } from '@/lib/socketManager';

export const THREAD_MESSAGE_EVENT = 'thread:message';
export const THREAD_MESSAGE_REFRESH_MS = 500;

/**
 * Refetch an OPEN thread when the backend saves a message on it (`thread:message`): a customer's
 * new message or the bot's answer. Without it an agent watching a Telegram chat saw neither until
 * they reloaded (owner, 2026-10-28). The event is content-free — the refetch goes through the
 * thread's own permission-checked request.
 *
 * COALESCED like useConversationNewRefresh: a customer message and the bot's reply a second later
 * arrive as a pair; the first event schedules one refetch and events inside the window join it.
 */
export const useThreadMessageRefresh = (conversationId: number, refresh: () => void): void => {
  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onThreadMessage = (data: unknown) => {
      if ((data as { conversationId?: number } | null)?.conversationId !== conversationId) return;
      if (timer !== null) return;
      timer = setTimeout(() => {
        timer = null;
        refreshRef.current();
      }, THREAD_MESSAGE_REFRESH_MS);
    };
    subscribeToEvent(THREAD_MESSAGE_EVENT, onThreadMessage);
    return () => {
      unsubscribeFromEvent(THREAD_MESSAGE_EVENT, onThreadMessage);
      if (timer !== null) clearTimeout(timer);
      releaseSocket();
    };
  }, [conversationId]);
};
