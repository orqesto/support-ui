import { messageService } from '@/services/message.service';
import type { Message } from '@/types';

export type ThreadCandidate = {
  id: number;
  publicId: string | null;
  subject: string | null;
  sender: string;
};

/** A picker lists at most this many threads; a full page says so, so "none" is never a cap. */
export const THREAD_PICKER_LIMIT = 25;

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
  const rows = (res.data ?? []) as unknown as Array<{
    latestMessage?: Message;
    sender?: string | null;
  }>;
  return {
    capped: rows.length >= THREAD_PICKER_LIMIT,
    candidates: rows
      // The customer's address lives on the THREAD row (what the list shows), not on its
      // latestMessage — reading only the message left every row as "· subject" on staging
      // (the same trap MergeThreads fixed).
      .map((row) =>
        row.latestMessage
          ? { ...row.latestMessage, sender: row.sender ?? row.latestMessage.sender }
          : undefined
      )
      .filter((row): row is Message => !!row)
      .map((row) => ({
        id: row.id,
        publicId: row.publicId ?? null,
        subject: row.subject ?? null,
        sender: row.sender ?? '',
      })),
  };
};
