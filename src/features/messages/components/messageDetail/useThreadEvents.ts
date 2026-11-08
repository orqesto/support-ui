import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { messageService } from '@/services/message.service';
import { isOutgoingEvent } from '@/lib/messageHelpers';
import { logger } from '@/lib/logger';
import { normaliseThreadPage, type ThreadPage } from '@/services/threadPage';
import type { Message, MessageEvent } from '@/types';
import {
  eventAddsParticipant,
  eventMayCarryAttachments,
  incrementalCursor,
  unseenEvents,
} from '../threadNewEvents';
import { threadTimeOf } from '../threadDays';
import { THREAD_PAGE } from './detailConstants';
import type { MessageDetailProps } from './types';

/** MessageDetail's thread: the loaded window of events, its paging and the incremental read. */

export function useThreadEvents(
  message: Message,
  onRefresh: MessageDetailProps['onRefresh'],
  onStatusChanged: MessageDetailProps['onStatusChanged']
) {
  const [threadMessages, setThreadMessages] = useState<MessageEvent[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [threadError, setThreadError] = useState<string | null>(null);
  const [threadRefreshKey, setThreadRefreshKey] = useState(0);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;
  // The light re-read of THIS conversation's header (no list, no board) — see onStatusChanged.
  const rereadHeaderRef = useRef(onStatusChanged ?? onRefresh);
  rereadHeaderRef.current = onStatusChanged ?? onRefresh;

  // What the thread endpoint left out (threadPage.ts). A refresh re-reads as many events as are
  // on screen, so a window the agent expanded is not folded back by a new message arriving.
  const [threadPage, setThreadPage] = useState<ThreadPage | null>(null);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const threadSize = useRef({ id: message.id, loaded: 0 });
  const messageIdRef = useRef(message.id);
  messageIdRef.current = message.id;

  useEffect(() => {
    let cancelled = false;
    setThreadLoading(true);
    setThreadError(null);
    if (threadSize.current.id !== message.id) threadSize.current = { id: message.id, loaded: 0 };
    messageService
      .getThreadMessages(message.id, { limit: Math.max(THREAD_PAGE, threadSize.current.loaded) })
      .then((res) => {
        if (cancelled) return;
        const rows = res.data ?? [];
        threadSize.current = { id: message.id, loaded: rows.length };
        setThreadMessages(rows);
        // Normalised again here: a caller that stands in for the service hands back a bare
        // envelope, and the window must still know what it holds.
        setThreadPage(normaliseThreadPage(res.page, rows));
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          logger.error('Failed to load thread:', err);
          setThreadError('Failed to load thread. Please try again.');
        }
      })
      .finally(() => {
        if (!cancelled) setThreadLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [message.id, threadRefreshKey]);

  /** The page of events before the earliest one on screen, prepended. */
  const loadEarlier = useCallback(() => {
    const before = threadPage?.earliestId;
    if (!threadPage?.hasEarlier || !before || loadingEarlier) return;
    const forId = message.id;
    setLoadingEarlier(true);
    messageService
      .getThreadMessages(forId, { limit: THREAD_PAGE, before })
      .then((res) => {
        if (messageIdRef.current !== forId) return;
        const older = res.data ?? [];
        threadSize.current = { id: forId, loaded: threadSize.current.loaded + older.length };
        setThreadMessages((current) => [...older, ...current]);
        // The older page's own bound says whether there is more before IT; the total is the
        // thread's and does not move.
        setThreadPage((current) => ({
          ...normaliseThreadPage(res.page, older),
          total: current?.total ?? older.length,
        }));
      })
      .catch((err: unknown) => {
        if (messageIdRef.current !== forId) return;
        logger.error('Failed to load earlier messages:', err);
        setThreadError('Could not load earlier messages. Please try again.');
      })
      .finally(() => {
        if (messageIdRef.current === forId) setLoadingEarlier(false);
      });
  }, [message.id, threadPage, loadingEarlier]);

  // Bumped by a live message's incremental read (see useThreadMessageRefresh below). Each panel
  // keys on threadRefreshKey (a full refresh) PLUS its own bump.
  const [panelsBump, setPanelsBump] = useState(0);
  const [attachmentsBump, setAttachmentsBump] = useState(0);
  const [activityBump, setActivityBump] = useState(0);
  const [participantsBump, setParticipantsBump] = useState(0);
  // Our own note: only the notes change (a note writes no activity — its audit row is the note's).
  const [notesBump, setNotesBump] = useState(0);
  const threadMessagesRef = useRef(threadMessages);
  threadMessagesRef.current = threadMessages;
  const participantsRef = useRef<string[]>([]);

  /**
   * `also` re-reads panels the new events alone cannot tell about: a reply writes its activity
   * entry (`message.reply`), and an outgoing event carries no attachment metadata, so a reply
   * sent with files — ours, or another agent's — says nothing about them on its own.
   */
  const pullNewEvents = useCallback(
    (also?: { activity?: boolean; attachments?: boolean; participants?: boolean }) => {
      const forId = message.id;
      const bumpAlso = () => {
        if (also?.activity) setActivityBump((key) => key + 1);
        if (also?.attachments) setAttachmentsBump((key) => key + 1);
        if (also?.participants) setParticipantsBump((key) => key + 1);
      };
      const after = incrementalCursor(threadMessagesRef.current, forId);
      if (after === null) {
        setThreadRefreshKey((key) => key + 1);
        return;
      }
      // The same limit as a full read: an older backend ignores afterEventId and answers this
      // window, which is then applied as one.
      const limit = Math.max(THREAD_PAGE, threadSize.current.loaded);
      messageService
        .getThreadMessagesAfter(forId, after, limit)
        .then((res) => {
          if (messageIdRef.current !== forId) return;
          if (!res.newEvents.incremental) {
            threadSize.current = { id: forId, loaded: res.data.length };
            setThreadMessages(res.data);
            setThreadPage(res.page);
            setPanelsBump((key) => key + 1);
            setAttachmentsBump((key) => key + 1);
            setParticipantsBump((key) => key + 1);
            if (also?.activity) setActivityBump((key) => key + 1);
            return;
          }
          if (res.newEvents.hasMore) {
            setThreadRefreshKey((key) => key + 1);
            return;
          }
          const fresh = unseenEvents(threadMessagesRef.current, res.data);
          if (fresh.length === 0) {
            bumpAlso();
            return;
          }
          threadMessagesRef.current = [...threadMessagesRef.current, ...fresh];
          setThreadMessages((current) => [...current, ...unseenEvents(current, fresh)]);
          threadSize.current = { id: forId, loaded: threadSize.current.loaded + fresh.length };
          setThreadPage((current) =>
            current ? { ...current, total: current.total + fresh.length } : current
          );
          if (also?.attachments || fresh.some(eventMayCarryAttachments))
            setAttachmentsBump((key) => key + 1);
          if (also?.activity || fresh.some((event) => !isOutgoingEvent(event)))
            setActivityBump((key) => key + 1);
          if (
            also?.participants ||
            (message.channel === 'email' &&
              fresh.some((event) => eventAddsParticipant(event, participantsRef.current)))
          )
            setParticipantsBump((key) => key + 1);
        })
        .catch((err: unknown) => {
          if (messageIdRef.current !== forId) return;
          logger.warn('Incremental thread read failed, re-reading the thread:', err);
          setThreadRefreshKey((key) => key + 1);
        });
    },
    [message.id, message.channel]
  );
  const pullNewEventsRef = useRef(pullNewEvents);
  pullNewEventsRef.current = pullNewEvents;
  // useThreadMessageRefresh calls it bare: a live message adds only what its events say.
  const pullLiveEvents = useCallback(() => pullNewEvents(), [pullNewEvents]);

  // ── Sorted thread ──────────────────────────────────────────────────────────

  const sortedThread = useMemo<MessageEvent[]>(() => {
    const msgs = [...threadMessages];
    msgs.sort((ma, mb) => threadTimeOf(ma) - threadTimeOf(mb));
    return msgs;
  }, [threadMessages]);
  // The last message (notes aside) is ours — an agent's reply or the auto-reply. The stored AI
  // draft answered the customer's email, which is answered now: the thread shows no suggestion
  // until the customer writes again (a new email gets a new draft from the backend).
  const lastWordOurs = useMemo(() => {
    const last = [...sortedThread].reverse().find((event) => event.type !== 'note');
    return last ? isOutgoingEvent(last) : false;
  }, [sortedThread]);
  // Day separators group by the SAME time the thread is sorted by (threadDays.ts), so one can
  // only ever sit between days, in order.
  return {
    threadMessages,
    threadLoading,
    threadError,
    threadRefreshKey,
    setThreadRefreshKey,
    onRefreshRef,
    rereadHeaderRef,
    threadPage,
    loadingEarlier,
    loadEarlier,
    panelsBump,
    attachmentsBump,
    activityBump,
    participantsBump,
    notesBump,
    setNotesBump,
    participantsRef,
    pullNewEvents,
    pullNewEventsRef,
    pullLiveEvents,
    sortedThread,
    lastWordOurs,
  };
}
