import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react';
import type { SetURLSearchParams } from 'react-router-dom';
import { logger } from '@/lib/logger';
import { getConvUrlId } from '@/lib/messageHelpers';
import { messageService, type MessageThread } from '@/services/message.service';
import type { Message } from '@/types';

export const useOpenThread = ({
  searchParams,
  setSearchParams,
  orgCode,
  isPhone,
  setSpamPreview,
  setSelectedMessage,
  selectedThreadIdRef,
  selectedThreadMessageIdRef,
  fetchedMessageIdRef,
}: {
  searchParams: URLSearchParams;
  setSearchParams: SetURLSearchParams;
  orgCode: string | null | undefined;
  isPhone: boolean;
  setSpamPreview: Dispatch<SetStateAction<MessageThread | null>>;
  setSelectedMessage: Dispatch<SetStateAction<Message | null>>;
  selectedThreadIdRef: MutableRefObject<string | null>;
  selectedThreadMessageIdRef: MutableRefObject<number | null>;
  fetchedMessageIdRef: MutableRefObject<string | null>;
}) => {
  /*
    Opening a thread is instant: the detail mounts from the row's own record and starts its reads
    at once, while the full record (header fields the list does not carry — the reply block, the
    WhatsApp window) is read beside them. It used to wait for that read before anything mounted.
    Each open takes a number; an answer for an earlier open (J/K, or a click on A then B) is
    dropped. Refs, so the callback is stable and the memoised rows do not redraw for it.
  */
  const openSeqRef = useRef(0);
  const [pendingThreadId, setPendingThreadId] = useState<string | null>(null);
  const searchParamsRef = useRef(searchParams);
  searchParamsRef.current = searchParams;
  const setSearchParamsRef = useRef(setSearchParams);
  setSearchParamsRef.current = setSearchParams;
  const orgCodeRef = useRef(orgCode);
  orgCodeRef.current = orgCode;
  const isPhoneRef = useRef(isPhone);
  isPhoneRef.current = isPhone;
  /*
    `?id` gone means the thread was closed — the detail's X, the backdrop, Back, the phone page, a
    refused re-read, a resolve. Every close drops it, so this is the one place that stops an open
    still reading its record: its answer used to arrive after the close and open the thread again.
  */
  const urlNamesAThread = Boolean(searchParams.get('id'));
  useEffect(() => {
    if (urlNamesAThread) return;
    openSeqRef.current += 1;
    setPendingThreadId(null);
  }, [urlNamesAThread]);
  const handleOpenThread = useCallback(
    async (thread: MessageThread) => {
      if (thread.threadId.startsWith('spamlog_')) {
        // spamLog rows carry the captured body in latestMessage.content — show
        // it read-only rather than routing a synthetic row through MessageDetail.
        setSpamPreview(thread);
        return;
      }
      // Preferred starting message: same one the list shows analysis badges for.
      const rowMessage = thread.latestIncomingMessage ?? thread.latestMessage;
      if (!thread.latestMessage?.id || !rowMessage) return;
      const seq = ++openSeqRef.current;
      // What this open replaces, so an open that is refused or fails can give it back.
      const before = {
        threadId: selectedThreadIdRef.current,
        messageId: selectedThreadMessageIdRef.current,
        urlId: searchParamsRef.current.get('id'),
        fetchedId: fetchedMessageIdRef.current,
      };
      // Remember which card this is so status actions can move it optimistically.
      selectedThreadIdRef.current = thread.threadId;
      const openedId = rowMessage.id;
      // …and which message it belongs to: the card is forgotten once another one is open.
      selectedThreadMessageIdRef.current = openedId;
      const urlId = getConvUrlId(rowMessage, orgCodeRef.current);
      fetchedMessageIdRef.current = urlId;
      const params = new URLSearchParams(searchParamsRef.current);
      params.set('id', urlId);
      setSearchParamsRef.current(params);
      // A phone opens the thread as its own page, which reads the record itself; the row's record
      // only carries it there.
      if (isPhoneRef.current) {
        setSelectedMessage({
          ...rowMessage,
          lastReplyFromClient: rowMessage.lastReplyFromClient ?? thread.lastReplyFromClient,
        });
        return;
      }
      // The detail mounts on the FULL record, never the row's: a list row carries no `sender`,
      // reply block, WhatsApp window or Reply-To, and the header read `sender` on mount — J on
      // staging 2026-10-31 blanked the page. The row shows busy meanwhile; the sequence number
      // still stops a slower earlier open from winning.
      setPendingThreadId(thread.threadId);
      /*
        Refused or failed: the thread on screen is still the one before, so the card refs and
        `?id` name it again. They used to keep naming this thread, so J/K stepped from it and a
        status change on the thread on screen moved its card. Only what still names this open.
      */
      const undoOpen = () => {
        if (
          selectedThreadIdRef.current === thread.threadId &&
          selectedThreadMessageIdRef.current === openedId
        ) {
          selectedThreadIdRef.current = before.threadId;
          selectedThreadMessageIdRef.current = before.messageId;
        }
        if (searchParamsRef.current.get('id') !== urlId) return;
        fetchedMessageIdRef.current = before.fetchedId;
        setSearchParamsRef.current(
          (prev) => {
            if (before.urlId) prev.set('id', before.urlId);
            else prev.delete('id');
            return prev;
          },
          { replace: true }
        );
      };
      try {
        const res = await messageService.getById(openedId);
        if (seq !== openSeqRef.current) return;
        if (!res.success || !res.data) {
          undoOpen();
          return;
        }
        // Widen to the tolerant app Message type: `lastReplyFromClient` is not returned by
        // getById, so it is optional here and falls back to the thread's value.
        const full: Message = res.data;
        selectedThreadMessageIdRef.current = full.id;
        setSelectedMessage({
          ...full,
          lastReplyFromClient: full.lastReplyFromClient ?? thread.lastReplyFromClient,
        });
        const fullUrlId = getConvUrlId(full, orgCodeRef.current);
        if (fullUrlId !== urlId && searchParamsRef.current.get('id') === urlId) {
          fetchedMessageIdRef.current = fullUrlId;
          setSearchParamsRef.current(
            (prev) => {
              prev.set('id', fullUrlId);
              return prev;
            },
            { replace: true }
          );
        }
      } catch (error) {
        if (seq === openSeqRef.current) {
          logger.error('Failed to fetch thread messages:', error);
          undoOpen();
        }
      } finally {
        if (seq === openSeqRef.current) setPendingThreadId(null);
      }
    },
    [
      fetchedMessageIdRef,
      selectedThreadIdRef,
      selectedThreadMessageIdRef,
      setSelectedMessage,
      setSpamPreview,
    ]
  );

  return { handleOpenThread, pendingThreadId, openSeqRef };
};
