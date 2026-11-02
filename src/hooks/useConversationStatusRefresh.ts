import { useEffect, useRef } from 'react';
import {
  getSocket,
  releaseSocket,
  subscribeToEvent,
  unsubscribeFromEvent,
} from '@/lib/socketManager';

export const CONV_STATUS_CHANGED_EVENT = 'conv:status_changed';
/**
 * Also re-read on `conversation:updated` (bulk actions, approve / resolve, close): the list heard it
 * and caught up, the open thread did not — a closed thread's panel kept saying "In progress"
 * (a customer's workspace, 2026-11-02).
 */
export const CONVERSATION_UPDATED_EVENT = 'conversation:updated';
export const CONV_STATUS_REFRESH_MS = 500;

/**
 * Whether an event is about this thread. A bulk run or a merge sends ONE `conversation:updated`
 * whose `conversationId` is only the first (or the surviving) thread; `conversationIds` names every
 * thread it stands for (review of #1306/#805). Absent on older backends: `conversationId` only.
 */
export const eventConcerns = (data: unknown, conversationId: number): boolean => {
  const event = data as { conversationId?: unknown; conversationIds?: unknown } | null;
  if (event?.conversationId === conversationId) return true;
  return Array.isArray(event?.conversationIds) && event.conversationIds.includes(conversationId);
};

/**
 * Re-read an OPEN thread when the backend changes its status on its own (`conv:status_changed`):
 * a customer's reply reopening a resolved thread, a reply taking it off hold. Without it the
 * header kept saying "Closed" with a Reopen button while the thread was In Progress, until the
 * agent reloaded (staging, 2026-10-30) — the Activity tab moved, the status did not.
 *
 * `refresh` must re-read THIS conversation only. ⛔ Not MessagesPage's onRefresh: that also
 * reloads the list and every board column, and the list already follows this event itself.
 *
 * COALESCED like useThreadMessageRefresh: one reopen can arrive with a status change from the
 * same save; events inside the window join one re-read.
 */
export const useConversationStatusRefresh = (
  conversationId: number,
  refresh: (() => void) | undefined
): void => {
  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onStatusChanged = (data: unknown) => {
      if (!eventConcerns(data, conversationId)) return;
      if (timer !== null) return;
      timer = setTimeout(() => {
        timer = null;
        refreshRef.current?.();
      }, CONV_STATUS_REFRESH_MS);
    };
    subscribeToEvent(CONV_STATUS_CHANGED_EVENT, onStatusChanged);
    subscribeToEvent(CONVERSATION_UPDATED_EVENT, onStatusChanged);
    return () => {
      unsubscribeFromEvent(CONV_STATUS_CHANGED_EVENT, onStatusChanged);
      unsubscribeFromEvent(CONVERSATION_UPDATED_EVENT, onStatusChanged);
      if (timer !== null) clearTimeout(timer);
      releaseSocket();
    };
  }, [conversationId]);
};
