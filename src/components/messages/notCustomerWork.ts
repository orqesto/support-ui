import type { Message } from '@/types';

/**
 * "Not customer work" — a thread an agent binned rather than resolved.
 *
 * ⛔ A binned thread and a resolved one are the SAME ROW apart from this mark: both are terminal,
 * both leave the queue, both stay reopenable. So the mark is the only thing that can tell an agent
 * what they — or a colleague — actually decided, and the only thing that explains why the thread
 * is missing from the resolved count. Rendering it is not decoration.
 *
 * 🔑 Read from `metadata.notCustomerWork`, which the backend's sanitizer passes through
 * deliberately (`sanitizeApiResponse`). That whitelist is why this is worth a guard rather than an
 * inline cast: a key that stops being listed there does not fail loudly, it simply stops arriving,
 * and the UI would quietly render every binned thread as an ordinary resolution again.
 */
export type NotCustomerWorkMark = {
  /** The user id that decided. Null when an older row carries no attribution. */
  by: number | null;
  /** ISO timestamp, or null when unreadable — the UI must not print "Invalid Date". */
  at: string | null;
  /** The agent's own words, free text, often absent. */
  reason: string | null;
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;

/** The mark, or null for an ordinary thread. */
export const notCustomerWorkMark = (
  message: Pick<Message, 'metadata'>
): NotCustomerWorkMark | null => {
  const mark = asRecord(asRecord(message.metadata)?.notCustomerWork);
  if (!mark) return null;
  return {
    by: typeof mark.by === 'number' ? mark.by : null,
    // Validated here rather than at the render site: a stamp written by an older build, or a
    // value that survived a migration as something else, must degrade to "no date" instead of
    // reaching `toLocaleDateString` and rendering "Invalid Date" to an agent.
    at: typeof mark.at === 'string' && !Number.isNaN(Date.parse(mark.at)) ? mark.at : null,
    reason: typeof mark.reason === 'string' && mark.reason.trim() !== '' ? mark.reason : null,
  };
};
