import { apiClient } from '@/lib/api-client';
import { getErrorStatus } from '@/lib/errorMessages';
import type { ApiResponse } from '@/types';

/**
 * Thread linking (support-service #767, TL-D1..D3) — "these two conversations are one piece of
 * customer work".
 *
 * ⛔ NOT A MERGE. `mergeConversation` folds one row into another and DELETES the loser; it is
 * deliberately not exposed, because this is a human judgement call on live customer threads and a
 * mis-click must not destroy one. Both conversations survive; unlinking is a delete with nothing
 * to rebuild.
 *
 * Measured 2026-09-18: 3 of CoreSarms' 4 one-sided alerts had a sibling thread from the same
 * customer on a DIFFERENT Gmail thread, days apart. Until now an agent could see that and say
 * nothing about it.
 */
export type ConversationLinks = {
  /** Directly linked conversation ids. ONE HOP — linking is not transitive by design. */
  linkedIds: number[];
  /**
   * TL-D1: the earliest inbound CUSTOMER message across the linked set, derived on read and never
   * written back. Null when the set contains no customer message at all — which is exactly the
   * one-sided-outbound case this feature was built for.
   */
  slaAnchorAt: string | null;
};

/**
 * TL-D2: the two threads have different assignees and the caller named neither, so the backend
 * refuses rather than silently dropping one. Someone is working that thread.
 */
export const ASSIGNEE_CONFLICT = 'assignee_conflict';

export class AssigneeConflictError extends Error {
  constructor() {
    super(ASSIGNEE_CONFLICT);
    this.name = 'AssigneeConflictError';
  }
}

export const conversationLinksService = {
  async list(conversationId: number): Promise<ConversationLinks> {
    const res = await apiClient.get<ApiResponse<ConversationLinks>>(
      `/api/messages/${conversationId}/links`
    );
    // Fail SOFT on a shape we do not recognise: an older backend has no such route, and a thread
    // must still open when its links cannot be read.
    return { linkedIds: res.data.data?.linkedIds ?? [], slaAnchorAt: res.data.data?.slaAnchorAt ?? null };
  },

  /**
   * @param assigneeId resolves TL-D2 — pass the user who keeps BOTH threads. Omit on the first
   * attempt: the backend answers 409 when it needs the choice, and asking before it does would
   * put a question in front of every link, including the ones with nothing to decide.
   */
  async link(conversationId: number, targetId: number, assigneeId?: number | null): Promise<void> {
    try {
      await apiClient.post<ApiResponse<void>>(`/api/messages/${conversationId}/links`, {
        targetId,
        ...(assigneeId === undefined ? {} : { assigneeId }),
      });
    } catch (error) {
      if (getErrorStatus(error) === 409) throw new AssigneeConflictError();
      throw error;
    }
  },

  async unlink(conversationId: number, targetId: number): Promise<void> {
    await apiClient.delete<ApiResponse<void>>(`/api/messages/${conversationId}/links/${targetId}`);
  },
};
