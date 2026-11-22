import { useEffect, useRef, type MutableRefObject } from 'react';
import {
  getSocket,
  releaseSocket,
  subscribeToEvent,
  unsubscribeFromEvent,
} from '@/lib/socketManager';
import { resolveVisitorNoEmailBlock } from '@/lib/visitorEmail';
import { CONVERSATION_NEW_EVENT } from '@/features/messages/hooks/useConversationNewRefresh';
import { THREAD_MESSAGE_EVENT } from '@/features/messages/hooks/useThreadMessageRefresh';
import type { Message } from '@/types';

export const VISITOR_EMAIL_REFRESH_MS = 500;

/**
 * Live updates of an open website chat (channel `chat`).
 *
 * A later visitor message is announced as `conversation:new` (naming the conversation), which an
 * open thread otherwise leaves to the list. For a website chat it reads the thread's new messages
 * — whether or not the visitor has left an email, so they keep appearing after the address arrives.
 *
 * While the visitor has left NO email, the same event also re-reads the conversation itself: the
 * backend puts the address the visitor has left meanwhile on the conversation with that message,
 * and the reply box unblocks from the conversation's requester — without this re-read it stayed
 * blocked until the page was reloaded. `thread:message` already reads the messages
 * (useThreadMessageRefresh), so in that state it adds only the conversation re-read.
 *
 * Threads of other channels do not listen. Coalesced like the other live re-reads: events inside
 * the window join one read.
 */
export function useVisitorEmailArrival({
  message,
  pullLiveEvents,
  rereadHeaderRef,
}: {
  message: Pick<Message, 'id' | 'channel' | 'sender'>;
  pullLiveEvents: () => void;
  rereadHeaderRef: MutableRefObject<(() => void) | undefined>;
}): void {
  const websiteChat = message.channel === 'chat';
  const waiting = resolveVisitorNoEmailBlock(message, 'reply').blocked;
  const pullRef = useRef(pullLiveEvents);
  useEffect(() => {
    pullRef.current = pullLiveEvents;
  }, [pullLiveEvents]);

  useEffect(() => {
    if (!websiteChat) return;
    getSocket();
    let timer: ReturnType<typeof setTimeout> | null = null;
    let readMessages = false;
    const schedule = (data: unknown, withMessages: boolean) => {
      if ((data as { conversationId?: number } | null)?.conversationId !== message.id) return;
      readMessages = readMessages || withMessages;
      if (timer !== null) return;
      timer = setTimeout(() => {
        timer = null;
        if (readMessages) pullRef.current();
        readMessages = false;
        if (waiting) rereadHeaderRef.current?.();
      }, VISITOR_EMAIL_REFRESH_MS);
    };
    const onConversationNew = (data: unknown) => schedule(data, true);
    const onThreadMessage = (data: unknown) => schedule(data, false);
    subscribeToEvent(CONVERSATION_NEW_EVENT, onConversationNew);
    if (waiting) subscribeToEvent(THREAD_MESSAGE_EVENT, onThreadMessage);
    return () => {
      unsubscribeFromEvent(CONVERSATION_NEW_EVENT, onConversationNew);
      if (waiting) unsubscribeFromEvent(THREAD_MESSAGE_EVENT, onThreadMessage);
      if (timer !== null) clearTimeout(timer);
      releaseSocket();
    };
  }, [websiteChat, waiting, message.id, rereadHeaderRef]);
}
