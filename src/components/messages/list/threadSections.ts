import { deriveWorkflowStatus, type WorkflowStatus } from '@/components/messages/inboxCardHelpers';
import type { MessageThread } from '@/services/message.service';

/** Status sections in the board's lane order; triage mail (no work status) last. */
const ORDER: Array<WorkflowStatus | null> = [
  'open',
  'in_progress',
  'pending',
  'on_hold',
  'resolved',
  null,
];

const statusOf = (thread: MessageThread): WorkflowStatus | null => {
  const msg = thread.latestMessage;
  if (!msg) return null;
  return deriveWorkflowStatus({
    status: msg.status,
    parkedAt: msg.parkedAt,
    lastReplyFromClient: msg.lastReplyFromClient ?? thread.lastReplyFromClient,
  });
};

/**
 * The page's threads, optionally split into status sections ("Group by status", as the tickets
 * table). Within a section the list's own order is kept; a section heading rides its first row.
 * Ungrouped, the rows come back as they are with no headings.
 */
export const threadSections = (
  threads: MessageThread[],
  group: boolean
): Array<{
  thread: MessageThread;
  section: { status: WorkflowStatus | null; count: number } | null;
}> => {
  if (!group) return threads.map((thread) => ({ thread, section: null }));
  const withStatus = threads.map((thread, index) => ({ thread, index, status: statusOf(thread) }));
  const counts = new Map<WorkflowStatus | null, number>();
  for (const row of withStatus) counts.set(row.status, (counts.get(row.status) ?? 0) + 1);
  const sorted = [...withStatus].sort(
    (left, right) =>
      ORDER.indexOf(left.status) - ORDER.indexOf(right.status) || left.index - right.index
  );
  return sorted.map((row, position) => ({
    thread: row.thread,
    section:
      position === 0 || sorted[position - 1].status !== row.status
        ? { status: row.status, count: counts.get(row.status) ?? 0 }
        : null,
  }));
};
