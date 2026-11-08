import { useMemo } from 'react';
import type { MessageThread } from '@/services/message.service';
import type { MessagesDisplayMode } from '@/types';
import { defaultFilters, type FilterState } from '../stores/messagesStore';
import { useThreadViewCounts } from './useThreadViewCounts';
import type { useMessagesData } from './useMessagesData';

type Data = ReturnType<typeof useMessagesData>;

export const useLaneCounts = ({
  countsTick,
  messagesPagination,
  threads,
  loading,
  refreshing,
  searching,
  filters,
  displayMode,
}: {
  countsTick: number;
  messagesPagination: Data['messagesPagination'];
  threads: MessageThread[];
  loading: boolean;
  refreshing: boolean;
  searching: boolean;
  filters: FilterState;
  displayMode: MessagesDisplayMode;
}) => {
  /**
   * When the view counts re-ask. NOT on every list re-read: socket events and read toggles
   * re-read the list into a new array with the same rows, and each re-read asked ≥5 more
   * `getThreads` (searches included) for counts that could not have changed (review of #712).
   * Only what can move a count does: which rows, their status, assignee, park, team, priority,
   * activity, and the list total.
   */
  const countsRefreshKey = useMemo(
    () =>
      `${countsTick}#${messagesPagination.total}#` +
      threads
        .map((thread) => {
          const msg = thread.latestMessage;
          return [
            thread.threadId,
            msg?.status,
            msg?.assigneeId,
            msg?.parkedAt,
            msg?.departmentId,
            msg?.priority,
            String(thread.lastMessageAt),
          ].join('|');
        })
        .join(';'),
    [threads, messagesPagination.total, countsTick]
  );
  /**
   * Counts wait for the list. Fired beside it, every count ran twice: once on the empty or old
   * rows, again when the list landed and moved `countsRefreshKey` (staging, 2026-10-28: the list
   * plus 5 counts, then the same 5 again — 11 searches where 6 do). While the list is being read
   * the pills keep the numbers they have; one round follows the answer.
   */
  const countsReady = !loading && !refreshing && !searching;
  const laneCounts = useThreadViewCounts(
    useMemo(
      () => [
        { key: 'needs_us', filters: { ...defaultFilters, lifecycle: 'needs_us' as const } },
        {
          key: 'spam',
          filters: {
            ...filters,
            columnId: 'spam',
            lifecycle: 'all' as const,
            queue: 'all' as const,
          },
        },
      ],
      [filters]
    ),
    countsRefreshKey,
    displayMode === 'threads' && countsReady
  );
  return { countsRefreshKey, countsReady, laneCounts };
};
