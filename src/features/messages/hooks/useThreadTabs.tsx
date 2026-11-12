import { useEffect, useMemo, type MutableRefObject, type ReactNode } from 'react';
import type { SetURLSearchParams } from 'react-router-dom';
import {
  KeepTabOnInput,
  OpenTabsRow,
  useOpenTabs,
  type OpenTabNewsEvent,
} from '@/components/shared/openTabs';
import type { OpenTab } from '@/lib/openTabs';
import { formatConvId, getConvUrlId } from '@/lib/messageHelpers';
import { isOwnSendEcho } from '@/lib/ownSends';
import { THREAD_MESSAGE_EVENT } from './useThreadMessageRefresh';
import { readSeed, writeSeed } from '@/lib/seededState';
import type { Message } from '@/types';

/** The thread a socket payload is about: its conversation id, or its message id. */
const threadKeyOf = (payload: unknown): string | null => {
  // Our own reply coming back is not news.
  if (isOwnSendEcho(payload)) return null;
  const data = (payload ?? {}) as { conversationId?: unknown; messageId?: unknown };
  const id = typeof data.conversationId === 'number' ? data.conversationId : data.messageId;
  return typeof id === 'number' ? String(id) : null;
};

const THREAD_NEWS: OpenTabNewsEvent[] = [
  // A message saved on the thread: the customer's (any channel) or a bot reply. The one that
  // matters most — `message:replied` is an agent's reply, and `conv:status_changed` fires only when
  // the status moves, so a second customer message on a thread already waiting on us said nothing.
  { event: THREAD_MESSAGE_EVENT, keyOf: threadKeyOf },
  { event: 'message:replied', keyOf: threadKeyOf },
  { event: 'conv:status_changed', keyOf: threadKeyOf },
  { event: 'conversation:updated', keyOf: threadKeyOf },
];

/** The reply box's unsent draft (useThreadUnsentDraft). */
const threadDraftScopes = (key: string) => [`thread:${key}`];

/**
 * The Threads open-tabs row. `shown` is the thread on screen (null for none); `activate`
 * navigates to a tab's thread; `closeShown` closes the thread on screen.
 */
export const useThreadTabs = ({
  shown,
  orgCode,
  activate,
  closeShown,
  keyboard,
  preview,
}: {
  shown: Message | null;
  orgCode: string | null | undefined;
  activate: (tab: OpenTab) => void;
  closeShown: () => void;
  keyboard?: boolean;
  /** The list is live beside the thread (split view): plain clicks open preview tabs. */
  preview?: boolean;
}) => {
  const target = useMemo(
    () =>
      shown
        ? {
            key: String(shown.id),
            urlId: getConvUrlId(shown),
            label: formatConvId(shown, orgCode),
            title: shown.subject ?? '',
          }
        : null,
    [shown, orgCode]
  );
  return useOpenTabs({
    kind: 'threads',
    shown: target,
    activate,
    closeShown,
    draftScopes: threadDraftScopes,
    noun: 'thread',
    newsEvents: THREAD_NEWS,
    keyboard,
    preview,
  });
};

/**
 * The Threads page's row: picking a tab opens its thread through `?id`, like a row click, and
 * `withTabs` puts the row on top of the open thread (split pane or slide-over). A phone opens
 * each thread as its own page (MessageDetailPage has the row there), so the page shows none.
 */
export const useThreadsPageTabs = ({
  selectedMessage,
  setSelectedMessage,
  opensIn,
  orgCode,
  selectedThreadIdRef,
  selectedThreadMessageIdRef,
  setSearchParams,
  closeDetail,
}: {
  selectedMessage: Message | null;
  setSelectedMessage: (message: Message) => void;
  /**
   * Where a thread opens: its own page (a phone — MessageDetailPage has the row), beside the
   * list (split: preview tabs, see useOpenTabs) or over it (the slide-over).
   */
  opensIn: 'page' | 'split' | 'over';
  orgCode: string | null | undefined;
  selectedThreadIdRef: MutableRefObject<string | null>;
  selectedThreadMessageIdRef: MutableRefObject<number | null>;
  setSearchParams: SetURLSearchParams;
  closeDetail: () => void;
}) => {
  // The record of every thread shown, so a tab brings its thread back at once (below).
  useEffect(() => {
    if (selectedMessage) writeSeed(['thread', selectedMessage.id, 'record'], selectedMessage);
  }, [selectedMessage]);
  const threadTabs = useThreadTabs({
    shown: opensIn === 'page' ? null : selectedMessage,
    preview: opensIn === 'split',
    orgCode,
    activate: (tab) => {
      selectedThreadIdRef.current = null;
      selectedThreadMessageIdRef.current = null;
      // The thread as last shown, at once; the read `?id` starts (useMessagesUrlSync) refreshes it.
      const record = readSeed<Message>(['thread', tab.key, 'record']);
      if (record) setSelectedMessage(record);
      setSearchParams(
        (current) => {
          const params = new URLSearchParams(current);
          params.set('id', tab.urlId);
          return params;
        },
        { replace: true }
      );
    },
    closeShown: closeDetail,
  });
  const withTabs = (detail: ReactNode) =>
    detail ? (
      <>
        <OpenTabsRow handle={threadTabs} ariaLabel="Open threads" />
        <KeepTabOnInput handle={threadTabs}>{detail}</KeepTabOnInput>
      </>
    ) : null;
  return { threadTabs, withTabs };
};
