/**
 * Bulk actions (spec §5.5 [my call]): one line in the confirm — "2 of 8 threads have someone
 * writing a reply — continue?" — counted from the list's presence summary (other agents only,
 * not away). Only for actions that change a thread's state; nothing when presence is down.
 */
import type { BulkAction } from '@/lib/bulkActions';
import { usePresenceSummaryStore, type SummaryUser } from './presenceSummaryStore';
import { useAuthStore } from '@/stores/authStore';

const GUARDED: ReadonlySet<BulkAction> = new Set(['resolve', 'resolve_kb', 'spam', 'assign']);

export const countWritingThreads = (
  ids: number[],
  byConversation: Record<number, readonly SummaryUser[]>,
  myId: number | undefined
): number =>
  ids.filter((id) =>
    (byConversation[id] ?? []).some(
      (user) => user.userId !== myId && user.state === 'writing_reply'
    )
  ).length;

export const bulkWritingNote = (
  action: BulkAction | null,
  ids: number[],
  byConversation: Record<number, readonly SummaryUser[]>,
  myId: number | undefined
): string | null => {
  if (action === null || !GUARDED.has(action)) return null;
  const writing = countWritingThreads(ids, byConversation, myId);
  if (writing === 0) return null;
  return `${writing} of ${ids.length} threads have someone writing a reply — continue?`;
};

export const useBulkWritingNote = (action: BulkAction | null, ids: number[]): string | null => {
  const myId = useAuthStore((store) => store.user?.id);
  const available = usePresenceSummaryStore((store) => store.available);
  const byConversation = usePresenceSummaryStore((store) => store.byConversation);
  return available ? bulkWritingNote(action, ids, byConversation, myId) : null;
};
