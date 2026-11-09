import { useEffect, useRef } from 'react';
import {
  getSocket,
  releaseSocket,
  subscribeToEvent,
  unsubscribeFromEvent,
} from '@/lib/socketManager';
import { isHoldReasonCleared } from '@/lib/holdNote';
import { CONVERSATION_UPDATED_EVENT, eventConcerns } from './useConversationStatusRefresh';

/**
 * An admin cleared a hold reason on this thread — here or in another tab (`conversation:updated`,
 * `action: 'hold_reason_cleared'`): re-read what shows the reason besides the header (which
 * useConversationStatusRefresh already re-reads on every `conversation:updated`) — the notes and
 * the Activity tab.
 */
export const useHoldReasonClearedRefresh = (conversationId: number, refresh: () => void): void => {
  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    if (!getSocket()) return;
    const onUpdated = (data: unknown) => {
      if (isHoldReasonCleared(data) && eventConcerns(data, conversationId)) refreshRef.current();
    };
    subscribeToEvent(CONVERSATION_UPDATED_EVENT, onUpdated);
    return () => {
      unsubscribeFromEvent(CONVERSATION_UPDATED_EVENT, onUpdated);
      releaseSocket();
    };
  }, [conversationId]);
};
