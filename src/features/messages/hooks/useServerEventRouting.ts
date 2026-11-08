import { useCallback, useRef, type MutableRefObject } from 'react';
import type { MessageThread } from '@/services/message.service';
import type { MessagesDisplayMode } from '@/types';
import { refreshForServerEvent, type ServerChangeEvent } from '../components/serverEventRefresh';
import type { FilterState } from '../stores/messagesStore';
import { useSocketReconnected } from './useSocketReconnected';
import type { useMessagesData } from './useMessagesData';

type Data = ReturnType<typeof useMessagesData>;

/** Which window an event joins, and the catch-up after a socket reconnect. Moved unchanged from MessagesPage. */
export const useServerEventRouting = ({
  displayMode,
  messagesPagination,
  filters,
  threads,
  pendingEventsRef,
  flushServerEvents,
  applyServerEvents,
}: {
  displayMode: MessagesDisplayMode;
  messagesPagination: Data['messagesPagination'];
  filters: FilterState;
  threads: MessageThread[];
  pendingEventsRef: MutableRefObject<{ newMail: boolean; changed: boolean; counts: boolean }>;
  flushServerEvents: () => void;
  applyServerEvents: () => void;
}) => {
  // Read at the event, so the rule sees the rows and filters on screen when it arrived.
  const shownViewRef = useRef({
    displayMode,
    page: messagesPagination.page,
    filters,
    rows: threads,
  });
  shownViewRef.current = { displayMode, page: messagesPagination.page, filters, rows: threads };
  const refreshFromServerEvent = useCallback(
    (event: ServerChangeEvent, payload?: unknown) => {
      if (refreshForServerEvent(event, payload, shownViewRef.current) === 'list')
        pendingEventsRef.current.changed = true;
      else pendingEventsRef.current.counts = true;
      flushServerEvents();
    },
    // The setters and refs passed in are the page's own (stable): the deps stay as they were inline.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [flushServerEvents]
  );
  /*
    The socket came back after a drop: every event sent meanwhile is lost. Re-read the list, the
    counts and the board once, now — not a window later — or when the tab is next shown. The
    open thread catches up on its own (MessageDetail).
  */
  useSocketReconnected(
    useCallback(() => {
      pendingEventsRef.current.changed = true;
      if (document.visibilityState === 'hidden') flushServerEvents();
      else applyServerEvents();
      // The setters and refs passed in are the page's own (stable): the deps stay as they were inline.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [applyServerEvents, flushServerEvents])
  );
  return refreshFromServerEvent;
};
