import { messageService, type MessageThread } from '@/services/message.service';
import type { Message } from '@/types';

export type ThreadCandidate = {
  id: number;
  publicId: string | null;
  subject: string | null;
  sender: string;
  /** The thread's lifecycle, for the picker's badge; absent from an older backend. */
  status?: string | null;
};

/** A picker lists at most this many threads; a full page says so, so "none" is never a cap. */
export const THREAD_PICKER_LIMIT = 25;

/**
 * A thread row as the message it can be picked as, or undefined when it cannot be: no message, or
 * a spam-log row (a NEGATIVE id, no conversation behind it — it cannot be linked or merged).
 * The customer's address lives on the THREAD row (what the list shows), not on its latestMessage —
 * reading only the message left every picker row as "· subject" on staging.
 */
export const threadRowMessage = (row: MessageThread): Message | undefined =>
  row.latestMessage && row.latestMessage.id > 0
    ? { ...row.latestMessage, sender: row.sender ?? row.latestMessage.sender }
    : undefined;

/**
 * The threads a ticket picker offers — "Add threads" on a ticket and "Threads it explains" on
 * Create ticket: ANY customer's (an incident is reported by many), every lifecycle (a thread the
 * agent already answered and resolved still belongs on the incident it reported). `capped`: the
 * page is full, so there may be more than were listed.
 */
export const searchThreadCandidates = async (
  term: string
): Promise<{ candidates: ThreadCandidate[]; capped: boolean }> => {
  const res = await messageService.getThreads(
    { ...(term.trim() ? { search: term.trim() } : {}), lifecycle: 'all' },
    1,
    THREAD_PICKER_LIMIT
  );
  const rows = res.data ?? [];
  return {
    capped: rows.length >= THREAD_PICKER_LIMIT,
    candidates: rows
      .map(threadRowMessage)
      .filter((row): row is Message => !!row)
      .map((row) => ({
        id: row.id,
        publicId: row.publicId ?? null,
        subject: row.subject ?? null,
        sender: row.sender ?? '',
        status: row.status ?? null,
      })),
  };
};
