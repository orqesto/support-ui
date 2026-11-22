import { useEffect, useCallback, type MutableRefObject } from 'react';
import {
  getSocket,
  releaseSocket,
  subscribeToEvent,
  unsubscribeFromEvent,
} from '@/lib/socketManager';
import { isOwnSendEcho } from '@/lib/ownSends';
import {
  mergeFailedSend,
  notDeliveredText,
  uncertainFailureText,
  type FailedSend,
} from '../deliveryState';
import type { Message } from '@/types';
import { useAuthStore } from '@/stores/authStore';
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
  setSendFailedEventId,
  setSendFailedOwnOnly,
  sendRefs: { failedSendRef, ownFailureRef, requestOutRef },
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
  setSendFailedEventId: Setter<number | null>;
  setSendFailedOwnOnly: Setter<boolean>;
  /** useReplyComposerState's refs about this tab's own send. */
  sendRefs: {
    failedSendRef: MutableRefObject<FailedSend | null>;
    ownFailureRef: MutableRefObject<boolean>;
    requestOutRef: MutableRefObject<boolean>;
  };
}) {
  // The signed-in agent: whose bar a `send-failed` event that names its author is.
  const currentUserId = useAuthStore((store) => store.user?.id ?? null);
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
      const event = data as {
        messageId: number;
        channel?: unknown;
        outgoingMessageId?: unknown;
        authorId?: unknown;
        authorUserId?: unknown;
        uncertain?: unknown;
        supersededEventId?: unknown;
        revertedStatus?: unknown;
      };
      if (event.messageId === message.id) {
        const eventId =
          typeof event.outgoingMessageId === 'number' ? event.outgoingMessageId : null;
        /*
          The backend announces every failure to the whole workspace, and the payload names no
          author. So:
           - the reply this tab's own failed request already named (its 502 answer; the event came
             late): one report, merged by event id — the bar stays this tab's, keeps its Retry,
             and a reply once said to be uncertain stays so;
           - any other reply while this tab's own failed send has its bar up, or an event that
             names no reply: no bar is touched or made (the event may be a colleague's); the
             re-read below shows the bubble;
           - otherwise: news only the socket announced — the bar shows once the named reply is
             read and is the current agent's (`ownOnly`), and no draft is left to retry.
        */
        const known = failedSendRef.current;
        const sameReport =
          eventId !== null &&
          known?.threadId === message.id &&
          known.eventId === eventId &&
          known.text !== null;
        /*
          One failure = one re-read. This tab's own failed request re-reads the thread and the
          page itself (useReplySend's catch), whichever of the two reports comes first — so the
          event reads nothing while that request is out or when its answer already named this
          reply. Only an event this tab has no request for reads: the newest events (the bubble's
          state, and whose reply it is), a full thread when a resend replaced a bubble, the header
          when the status was put back — never the side panels or the list.
        */
        const readForEvent = () => {
          if (requestOutRef.current) return;
          if (typeof event.supersededEventId === 'number') setThreadRefreshKey((key) => key + 1);
          else pullNewEventsRef.current();
          if (typeof event.revertedStatus === 'string') rereadHeaderRef.current?.();
        };
        // The reply's author, when the event names one (a newer backend; either field name). The
        // old payload names none: then the thread, once read, says whose reply it is (`ownOnly`).
        const told = event.authorId ?? event.authorUserId;
        const author = typeof told === 'number' ? told : null;
        // Someone else's reply: never this agent's bar — the re-read shows them the bubble.
        if (author !== null && author !== currentUserId && !sameReport) {
          readForEvent();
          return;
        }
        // (An event that names no reply cannot be checked against its author: never a bar.)
        if ((ownFailureRef.current && !sameReport) || eventId === null) {
          readForEvent();
          return;
        }
        const merged = mergeFailedSend(known, {
          threadId: message.id,
          eventId,
          uncertain: event.uncertain === true,
          text: null,
        });
        failedSendRef.current = merged;
        if (sameReport) {
          // Already said and re-read by the request's own answer; only "may have reached the
          // customer" is news (the richer state wins) — the bar's sentence is otherwise kept.
          if (merged.uncertain && !known.uncertain) {
            setSendFailedError(uncertainFailureText(event.channel));
            setSendFailedEventId(eventId);
            ownFailureRef.current = true;
          }
          return;
        }
        setSendFailureRetryable(false);
        // Said as the bubble says it (never "not sent" beside "May not have been delivered"): a
        // cut-off or unconfirmed send may have reached the customer (`uncertain`, any channel).
        // (`channel` may be null: no "via null".)
        setSendFailedError(
          merged.uncertain ? uncertainFailureText(event.channel) : notDeliveredText(event.channel)
        );
        // (After the reason: setting the reason forgets the id.)
        setSendFailedEventId(eventId);
        // Named as this agent's: the bar is theirs at once, no thread read needed to decide.
        setSendFailedOwnOnly(author === null);
        readForEvent();
      }
    };
    const handleReplied = (data: unknown) => {
      const event = data as { messageId: number; supersededEventId?: unknown; late?: unknown };
      // Our own send already read its events and the page when the request returned; its echo
      // would repeat both (ownSends.ts).
      //
      // Someone else's reply: the events after the newest on screen, the reply's activity entry,
      // its files (an outgoing event carries no attachment metadata) and, on email, whom it went
      // to — plus this conversation's header. ⛔ Not onRefresh: on MessagesPage that also re-reads
      // the list and the board, and the page already schedules its own coalesced list read for
      // this very event. No notes or merges: a reply adds neither.
      // A resend replaced an undelivered bubble: only a full read drops it (the incremental read
      // only adds). A reply given up and delivered LATER (`late`) may be older than the newest
      // events an incremental read asks for again: a full read too, so its bubble turns "✓ Sent".
      if (
        event.messageId === message.id &&
        !isOwnSendEcho(data) &&
        (typeof event.supersededEventId === 'number' || event.late === true)
      ) {
        setThreadRefreshKey((key) => key + 1);
        rereadHeaderRef.current?.();
        return;
      }
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
    currentUserId,
    onRefreshRef,
    pullNewEventsRef,
    rereadHeaderRef,
    setSendFailedError,
    setSendFailedEventId,
    setSendFailedOwnOnly,
    setSendFailureRetryable,
    setThreadRefreshKey,
    failedSendRef,
    ownFailureRef,
    requestOutRef,
  ]);
}
