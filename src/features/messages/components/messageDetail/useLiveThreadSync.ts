import { useEffect, useCallback, type MutableRefObject } from 'react';
import {
  getSocket,
  releaseSocket,
  subscribeToEvent,
  unsubscribeFromEvent,
} from '@/lib/socketManager';
import { isOwnSendEcho } from '@/lib/ownSends';
import type { Message } from '@/types';
import { useThreadMessageRefresh } from '@/features/messages/hooks/useThreadMessageRefresh';
import { useConversationStatusRefresh } from '@/features/messages/hooks/useConversationStatusRefresh';
import { useSocketReconnected } from '@/features/messages/hooks/useSocketReconnected';
import type { MessageDetailProps, Setter } from './types';

type PullNewEvents = (also?: {
  activity?: boolean;
  attachments?: boolean;
  participants?: boolean;
}) => void;

/** Live updates for the open thread: new messages, status moves, reconnects, replies and send failures. */

export function useLiveThreadSync({
  message,
  pullLiveEvents,
  onStatusChanged,
  setThreadRefreshKey,
  rereadHeaderRef,
  onRefreshRef,
  pullNewEventsRef,
  setSendFailureRetryable,
  setSendFailedError,
}: {
  message: Message;
  pullLiveEvents: () => void;
  onStatusChanged: MessageDetailProps['onStatusChanged'];
  setThreadRefreshKey: Setter<number>;
  rereadHeaderRef: MutableRefObject<(() => void) | undefined>;
  onRefreshRef: MutableRefObject<(() => void) | undefined>;
  pullNewEventsRef: MutableRefObject<PullNewEvents>;
  setSendFailureRetryable: Setter<boolean>;
  setSendFailedError: Setter<string | null>;
}) {
  // A customer's new message or the bot's answer on this thread: refetch THIS thread only.
  // ⛔ Not onRefresh: on MessagesPage that reloads the message, the whole list and every board
  // column — per message, for every agent with the thread open. The list already refreshes on
  // its own (`conversation:new`, coalesced).
  //
  // Only the events after the newest one on screen are read and appended (threadNewEvents.ts);
  // the side panels are re-read only when the new events can have changed them:
  //  - attachments: when a new event may carry files (an incoming message);
  //  - participants (Reply all): when a new event names someone not yet on the list;
  //  - activity: when a new event is incoming — the backend's save of a customer message writes
  //    activity entries (auto-reopen, auto-route, auto-replied, "thanks" kept finished);
  //  - notes and merges: never — `thread:message` is emitted only for a saved message or bot
  //    reply, which adds no note and no merge.
  // A backend that ignores `afterEventId` answers the full window: it is applied as the full read
  // and every panel is re-read, as before. Cut short (`hasMore`) or failed → a full re-read.
  useThreadMessageRefresh(message.id, pullLiveEvents);
  // The backend moved this thread's status (a customer reply reopened it): re-read the header.
  useConversationStatusRefresh(message.id, onStatusChanged);
  /*
    The socket came back after a drop: whatever was said meanwhile — a customer's message, a
    colleague's reply or note, a merge, files — never arrived. Reconnects are rare (and spread and
    rationed by the socket manager), so the thread and every panel are read again in full, and
    the header. The list re-reads itself (MessagesPage).
  */
  useSocketReconnected(
    useCallback(() => {
      setThreadRefreshKey((key) => key + 1);
      rereadHeaderRef.current?.();
    }, [rereadHeaderRef, setThreadRefreshKey])
  );

  // ── Real-time reply events ─────────────────────────────────────────────────
  useEffect(() => {
    getSocket();
    const handleSendFailed = (data: unknown) => {
      const event = data as { messageId: number; channel: string };
      if (event.messageId === message.id) {
        setSendFailureRetryable(false);
        setSendFailedError(
          `Reply could not be delivered via ${event.channel}. The message was saved but not sent — please try again.`
        );
        // The BE reverts the conv's status and marks the reply event undelivered on
        // failure. Refetch so the thread reflects the real state (no longer shown as
        // resolved/replied, and the outgoing bubble can render as undelivered) instead
        // of the optimistic state from the earlier message:replied event.
        setThreadRefreshKey((key) => key + 1);
        onRefreshRef.current?.();
      }
    };
    const handleReplied = (data: unknown) => {
      const event = data as { messageId: number };
      // Our own send already read its events and the page when the request returned; its echo
      // would repeat both (ownSends.ts).
      //
      // Someone else's reply: the events after the newest on screen, the reply's activity entry,
      // its files (an outgoing event carries no attachment metadata) and, on email, whom it went
      // to — plus this conversation's header. ⛔ Not onRefresh: on MessagesPage that also re-reads
      // the list and the board, and the page already schedules its own coalesced list read for
      // this very event. No notes or merges: a reply adds neither.
      if (event.messageId === message.id && !isOwnSendEcho(data)) {
        pullNewEventsRef.current({
          activity: true,
          attachments: true,
          participants: message.channel === 'email',
        });
        rereadHeaderRef.current?.();
      }
    };
    subscribeToEvent('send-failed', handleSendFailed);
    subscribeToEvent('message:replied', handleReplied);
    return () => {
      unsubscribeFromEvent('send-failed', handleSendFailed);
      unsubscribeFromEvent('message:replied', handleReplied);
      releaseSocket();
    };
  }, [
    message.id,
    message.channel,
    onRefreshRef,
    pullNewEventsRef,
    rereadHeaderRef,
    setSendFailedError,
    setSendFailureRetryable,
    setThreadRefreshKey,
  ]);
}
