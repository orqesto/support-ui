import { apiClient } from '@/lib/api-client';
import type { ApiResponse } from '@/types';

/**
 * Promoting an already-resolved conversation into the knowledge base.
 *
 * Its own module rather than two more methods on `message.service`: that file is at its
 * 650-code-line ceiling, and this is a distinct capability with its own two-step shape —
 * extract and show, then save what the agent kept.
 */

/** One Q&A a resolved thread could contribute, as returned by the candidates endpoint. */
export type KbQaCandidate = {
  question: string;
  answer: string;
  questionMessageId: number;
  answerMessageId: number;
  subject: string | null;
  questionFrom: string | null;
  answeredBy: string | null;
};

/** What the agent kept, after any edits. The ids identify which extracted pair it came from. */
export type KbQaPairInput = {
  questionMessageId: number;
  answerMessageId: number;
  question: string;
  answer: string;
};

export const kbPromoteService = {
  /**
   * What this thread could contribute. Writes nothing and spends no AI call — the agent
   * confirms first. 409 when the conversation is not resolved or closed.
   */
  candidates: async (messageId: number): Promise<KbQaCandidate[]> => {
    const response = await apiClient.post<ApiResponse<{ candidates: KbQaCandidate[] }>>(
      `/api/messages/${messageId}/kb-candidates`,
      {}
    );
    return response.data.data?.candidates ?? [];
  },

  /**
   * Save the pairs the agent kept. Stored approved and attributed to them — returns the ids
   * actually CREATED, which is fewer than requested when a pair is already in the KB.
   */
  /**
   * `pendingReview`: the caller may not approve KB entries, so what was saved waits for a
   * reviewer (who is notified) and the AI does not use it yet. `rejected`: the pair was already
   * in the KB and a reviewer had rejected it — nothing new is waiting on anyone. Both are
   * absent on an older backend, which reads as a plain "added".
   */
  promote: async (
    messageId: number,
    pairs: KbQaPairInput[]
  ): Promise<{ ids: number[]; pendingReview: boolean; rejected: number }> => {
    const response = await apiClient.post<
      ApiResponse<{
        knowledgeBaseIds: number[];
        pendingReview?: boolean;
        outcome?: { approved: number; pendingReview: number; rejected: number };
      }>
    >(`/api/messages/${messageId}/kb-entries`, { pairs });
    const data = response.data.data;
    return {
      ids: data?.knowledgeBaseIds ?? [],
      pendingReview: data?.pendingReview === true,
      rejected: data?.outcome?.rejected ?? 0,
    };
  },
};
