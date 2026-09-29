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

export type KbPromoteOutcome = {
  approved: number;
  hidden: number;
  retired: number;
  pendingReview: number;
  rejected: number;
  partOfCase: number[];
};

export type KbPromoteResult = { ids: number[]; outcome: KbPromoteOutcome };

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
   * What the saved entries ARE now, per the backend's `outcome` (kbPromoteController):
   * `approved` = actually served (approved, not hidden, not an original of a case); `hidden` = in
   * the KB but hidden — only a KB reviewer can restore it; `retired` = its source was removed (kept
   * for the record, never used); `pendingReview` = waiting on a reviewer;
   * `rejected` = a reviewer rejected it; `partOfCase` = ids of merged cases this pair is an
   * original of. The deployed backend sends no `hidden` / `retired` / `partOfCase` (read as none), and an
   * older one no `outcome` at all (derived from `pendingReview`, as before).
   */
  promote: async (messageId: number, pairs: KbQaPairInput[]): Promise<KbPromoteResult> => {
    const response = await apiClient.post<
      ApiResponse<{
        knowledgeBaseIds: number[];
        pendingReview?: boolean;
        outcome?: Partial<KbPromoteOutcome>;
      }>
    >(`/api/messages/${messageId}/kb-entries`, { pairs });
    const data = response.data.data;
    const ids = data?.knowledgeBaseIds ?? [];
    const outcome = data?.outcome;
    if (!outcome) {
      const waiting = data?.pendingReview === true;
      return {
        ids,
        outcome: {
          approved: waiting ? 0 : ids.length,
          hidden: 0,
          retired: 0,
          pendingReview: waiting ? ids.length : 0,
          rejected: 0,
          partOfCase: [],
        },
      };
    }
    return {
      ids,
      outcome: {
        approved: outcome.approved ?? 0,
        hidden: outcome.hidden ?? 0,
        retired: outcome.retired ?? 0,
        pendingReview: outcome.pendingReview ?? 0,
        rejected: outcome.rejected ?? 0,
        partOfCase: Array.isArray(outcome.partOfCase) ? outcome.partOfCase : [],
      },
    };
  },
};
