import { useEffect } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import { NOTIFICATION_COUNTS_KEY } from '@/hooks/useNotificationCounts';
import { isOwnSendEcho } from '@/lib/ownSends';
import { subscribeToEvent, unsubscribeFromEvent } from '@/lib/socketManager';
import type { ServerChangeEvent } from '../components/serverEventRefresh';

type RefreshFromServerEvent = (event: ServerChangeEvent, payload?: unknown) => void;

/** ticket:updated, conversation:routed, conv:status_changed. Moved unchanged from MessagesPage. */
export const useTicketRoutingStatusEvents = (
  refreshFromServerEvent: RefreshFromServerEvent,
  queryClient: QueryClient
) => {
  // Refresh thread list + kanban when any linked ticket status changes
  useEffect(() => {
    const handleTicketUpdated = (data: unknown) => refreshFromServerEvent('ticket:updated', data);
    subscribeToEvent('ticket:updated', handleTicketUpdated);
    return () => unsubscribeFromEvent('ticket:updated', handleTicketUpdated);
  }, [refreshFromServerEvent]);

  // Refresh when ANOTHER agent re-routes a conversation. Without this, agents
  // viewing the inbox/kanban in another tab see stale data: a conv they had in
  // their dept queue continues to display there until they manually refresh,
  // even after a colleague moved it elsewhere. The BE emits 'conversation:routed'
  // org-wide on every manualRouteMessage; the badge count, list, and kanban
  // columns all need to re-fetch to pick up the new dept assignment.
  useEffect(() => {
    const handleConversationRouted = (data: unknown) => {
      refreshFromServerEvent('conversation:routed', data);
      // The routed conv left the needs_routing queue — refresh the sidebar badge
      // too (this handler's contract, but it was previously only refreshing list+kanban).
      void queryClient.invalidateQueries({ queryKey: NOTIFICATION_COUNTS_KEY });
    };
    subscribeToEvent('conversation:routed', handleConversationRouted);
    return () => unsubscribeFromEvent('conversation:routed', handleConversationRouted);
  }, [refreshFromServerEvent, queryClient]);

  // Refresh on server-side conv status transitions (resurface on customer
  // follow-up to resolved/closed conv, awaiting_response → client_replied on
  // inbound). Without this the row stays in the wrong column until manual
  // refresh. Same shape as the conversation:routed handler above.
  useEffect(() => {
    const handleStatusChanged = (data: unknown) =>
      refreshFromServerEvent('conv:status_changed', data);
    subscribeToEvent('conv:status_changed', handleStatusChanged);
    return () => unsubscribeFromEvent('conv:status_changed', handleStatusChanged);
  }, [refreshFromServerEvent]);
};

/** conversation:updated and message:replied. Moved unchanged from MessagesPage. */
export const useConversationUpdateEvents = (refreshFromServerEvent: RefreshFromServerEvent) => {
  // Refresh when a conversation's tab membership changes: approve/mark_suspicious/
  // move_to_spam (immediate, from the agent's own click) and bot_reply (deferred,
  // when auto-reply completes asynchronously after AI analysis on a previously-
  // approved conv lands the conv in awaiting_response). Without this listener,
  // un-marking a message as suspicious shows it leave the suspicious tab but the
  // downstream status transition (→ awaiting_response after auto-reply) only
  // becomes visible after a manual refresh.
  useEffect(() => {
    const handleConversationUpdated = (data: unknown) =>
      refreshFromServerEvent('conversation:updated', data);
    subscribeToEvent('conversation:updated', handleConversationUpdated);
    return () => unsubscribeFromEvent('conversation:updated', handleConversationUpdated);
  }, [refreshFromServerEvent]);

  // Refresh when ANY agent replies (org-wide 'message:replied'). An agent reply
  // flips lastReplyFromClient=false → the conv derives to Pending and leaves the
  // Open/In-Progress column. The acting agent's own reply is already covered by
  // handleRefreshMessage, but other agents viewing the same board would otherwise
  // see the card stuck in its old column until a manual refresh. Same trio as the
  // handlers above.
  useEffect(() => {
    // This tab's own reply already reloaded the list and board (handleRefreshMessage) — its echo
    // must not schedule a third reload (ownSends.ts).
    const handleMessageReplied = (data: unknown) => {
      if (!isOwnSendEcho(data)) refreshFromServerEvent('message:replied', data);
    };
    subscribeToEvent('message:replied', handleMessageReplied);
    return () => unsubscribeFromEvent('message:replied', handleMessageReplied);
  }, [refreshFromServerEvent]);
};
