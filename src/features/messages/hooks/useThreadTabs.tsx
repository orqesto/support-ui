import { useMemo, type MutableRefObject, type ReactNode } from 'react';
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
}: {
  shown: Message | null;
  orgCode: string | null | undefined;
  activate: (tab: OpenTab) => void;
  closeShown: () => void;
  keyboard?: boolean;
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
  });
};

/**
 * The Threads page's row: picking a tab opens its thread through `?id`, like a row click, and
 * `withTabs` puts the row on top of the open thread (split pane or slide-over). A phone opens
 * each thread as its own page (MessageDetailPage has the row there), so the page shows none.
 */
export const useThreadsPageTabs = ({
  selectedMessage,
  isPhone,
  orgCode,
  selectedThreadIdRef,
  selectedThreadMessageIdRef,
  setSearchParams,
  closeDetail,
}: {
  selectedMessage: Message | null;
  isPhone: boolean;
  orgCode: string | null | undefined;
  selectedThreadIdRef: MutableRefObject<string | null>;
  selectedThreadMessageIdRef: MutableRefObject<number | null>;
  setSearchParams: SetURLSearchParams;
  closeDetail: () => void;
}) => {
  const threadTabs = useThreadTabs({
    shown: isPhone ? null : selectedMessage,
    orgCode,
    activate: (tab) => {
      selectedThreadIdRef.current = null;
      selectedThreadMessageIdRef.current = null;
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
