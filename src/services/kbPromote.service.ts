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
  promote: async (messageId: number, pairs: KbQaPairInput[]): Promise<number[]> => {
    const response = await apiClient.post<ApiResponse<{ knowledgeBaseIds: number[] }>>(
      `/api/messages/${messageId}/kb-entries`,
      { pairs }
    );
    return response.data.data?.knowledgeBaseIds ?? [];
  },
};
