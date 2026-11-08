import { useCallback, useRef } from 'react';
import type { MessageThread } from '@/services/message.service';
import type { FilterState } from '../stores/messagesStore';
import type { useMessagesData } from './useMessagesData';

type Data = ReturnType<typeof useMessagesData>;

export const useRowReadChanged = ({
  filters,
  bumpKanban,
  bumpCounts,
  fetchMessages,
  messagesPagination,
  patchThread,
}: {
  filters: FilterState;
  bumpKanban: () => void;
  bumpCounts: () => void;
  fetchMessages: Data['fetchMessages'];
  messagesPagination: Data['messagesPagination'];
  patchThread: Data['patchThread'];
}) => {
  /*
    A read toggle the server accepted: the row is patched in place and only the view counts are
    re-read — not the page of 50 rows and the board. Except under a Read / Unread filter, where the
    row now leaves the view: there the list is read as before.
  */
  const readFilterRef = useRef(filters.read);
  readFilterRef.current = filters.read;
  const handleRowReadChanged = useCallback(
    (isRead: boolean, thread: MessageThread) => {
      if ((readFilterRef.current ?? 'all') !== 'all') {
        bumpKanban();
        void fetchMessages(messagesPagination.page, true);
        return;
      }
      patchThread(thread.threadId, { isRead });
      bumpCounts();
    },
    // The setters and refs passed in are the page's own (stable): the deps stay as they were inline.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bumpKanban, fetchMessages, messagesPagination.page, patchThread]
  );
  return handleRowReadChanged;
};
