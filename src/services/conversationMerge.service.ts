import { apiClient } from '@/lib/api-client';
import { getErrorBody, getErrorStatus } from '@/lib/errorMessages';
import type { ApiResponse } from '@/types';

/**
 * Thread MERGE (owner, 2026-09-23; support-service `POST /api/messages/:id/merge`) — the
 * conversations are the SAME customer conversation, so they become one ticket.
 *
 * Unlike a link, the merged-in tickets leave the inbox and their messages join the survivor.
 * Unlike ingestion's own merge, it is undoable: each merged ticket is kept as a record, later
 * mail on its thread arrives in the survivor, and Unmerge gives it back.
 *
 * ⛔ Version skew: the FE deploys on merge, the BE on a tag. Every read here fails SOFT on an
 * older backend (no such route) — a thread must still open, and "nothing merged" must not be
 * claimed when the answer is "we could not ask".
 */
export type ManualMerge = {
  id: number;
  publicId: string | null;
  subject: string | null;
  mergedAt: string | null;
  mergedBy: string | null;
};

export type Participant = { address: string; roles: string[]; lastSeenAt: string };

/** Several threads have different people working them; the merger chooses who keeps the ticket. */
export class MergeAssigneeConflictError extends Error {
  constructor(public readonly assigneeIds: number[]) {
    super('assignee_conflict');
    this.name = 'MergeAssigneeConflictError';
  }
}

const numbers = (value: unknown): number[] =>
  Array.isArray(value) ? value.filter((item): item is number => typeof item === 'number') : [];

export const conversationMergeService = {
  /** Fold `sourceIds` into `survivorId`. All or nothing on the backend. */
  async merge(survivorId: number, sourceIds: number[], assigneeId?: number | null): Promise<void> {
    try {
      await apiClient.post<ApiResponse<void>>(`/api/messages/${survivorId}/merge`, {
        sourceIds,
        ...(assigneeId === undefined ? {} : { assigneeId }),
      });
    } catch (error) {
      const body = getErrorBody(error) as
        | { error?: string; data?: { assigneeIds?: unknown } }
        | undefined;
      // Only the ASSIGNEE 409 is a question for the agent; the other 409 ("merged or deleted
      // meanwhile") is an error with the backend's own words.
      if (getErrorStatus(error) === 409 && body?.error === 'assignee_conflict') {
        throw new MergeAssigneeConflictError(numbers(body.data?.assigneeIds));
      }
      throw error;
    }
  },

  async unmerge(survivorId: number, sourceId: number): Promise<void> {
    await apiClient.post<ApiResponse<void>>(`/api/messages/${survivorId}/unmerge`, { sourceId });
  },

  /** What an agent merged into this ticket. `null` = could not ask (older backend, error). */
  async listMerges(conversationId: number): Promise<ManualMerge[] | null> {
    try {
      const res = await apiClient.get<ApiResponse<{ merges?: ManualMerge[] }>>(
        `/api/messages/${conversationId}/merges`
      );
      const merges = res.data.data?.merges;
      return Array.isArray(merges) ? merges : null;
    } catch {
      return null;
    }
  },

  /** Everyone on the thread who is not us, newest first. `null` = could not ask. */
  async participants(conversationId: number): Promise<Participant[] | null> {
    try {
      const res = await apiClient.get<ApiResponse<{ participants?: Participant[] }>>(
        `/api/messages/${conversationId}/participants`
      );
      const list = res.data.data?.participants;
      return Array.isArray(list)
        ? list.filter((row) => typeof row?.address === 'string' && row.address.includes('@'))
        : null;
    } catch {
      return null;
    }
  },
};
