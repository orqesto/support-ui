import { useEffect, useRef } from 'react';
import { getSocket, releaseSocket, subscribeToEvent, unsubscribeFromEvent } from '@/lib/socketManager';

export const CONVERSATION_NEW_EVENT = 'conversation:new';
export const CONVERSATION_NEW_REFRESH_MS = 1000;

/**
 * #957 D1 — refetch the inbox when the backend saves inbound mail (`conversation:new`). The event is
 * content-free: the refetch goes through the viewer's own permission-checked list.
 *
 * ⛔ COALESCED, not debounced. The first event schedules ONE refresh a second later and events inside
 * that second join it. A trailing debounce would restart on every event, so a steady stream (a busy
 * inbox, an import) would never refresh at all.
 */
export const useConversationNewRefresh = (refresh: () => void): void => {
  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onNewConversation = () => {
      if (timer !== null) return;
      timer = setTimeout(() => {
        timer = null;
        refreshRef.current();
      }, CONVERSATION_NEW_REFRESH_MS);
    };
    subscribeToEvent(CONVERSATION_NEW_EVENT, onNewConversation);
    return () => {
      unsubscribeFromEvent(CONVERSATION_NEW_EVENT, onNewConversation);
      if (timer !== null) clearTimeout(timer);
      releaseSocket();
    };
  }, []);
};
