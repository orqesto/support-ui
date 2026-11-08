/** The messages API's AI and knowledge-base endpoints (split out of message.service.ts, F5). */
import { apiClient } from '@/lib/api-client';
import { getErrorStatus } from '@/lib/errorMessages';
import type { ApiResponse } from '@/types';

export const messageAiApi = {
  getSimilarResolvedMessages: async (id: number, limit = 5, minSimilarity = 0.7) => {
    const params = new URLSearchParams({
      limit: limit.toString(),
      minSimilarity: minSimilarity.toString(),
    });
    const response = await apiClient.get<
      ApiResponse<
        Array<{
          messageId?: number;
          content: string;
          subject?: string | null;
          sender?: string;
          directReply: string;
          similarity: number;
          repliedAt?: string | null;
          repliedBy?: number | null;
          source: 'documentation' | 'message';
          documentationId?: number;
          documentTitle?: string;
          chunkId?: number;
          chunkIndex?: number;
          chunkMetadata?: { extractedText?: string; page?: number };
          references?: Array<{
            chunkId: number;
            chunkIndex: number;
            metadata: unknown;
          }>;
        }>
      >
    >(`/api/messages/${id}/similar-resolved?${params.toString()}`);
    return response.data;
  },

  getSuggestedAnswer: async (id: number) => {
    const response = await apiClient.get<
      ApiResponse<{
        mode: 'ai-generated' | 'search-results';
        aiResponse?: {
          text: string;
          confidence: number;
          provider: string;
        };
        sources: Array<{
          // 'knowledge_base' = a mined KB entry (qa_pair / manual_entry / document). Until
          // support-service#367 these could never be returned — the scope resolver read a
          // junction table nothing writes, so every source-linked entry fell out of scope.
          type: 'documentation' | 'ticket' | 'message' | 'knowledge_base';
          id: number;
          parentDocId?: number;
          chunkIndex?: number;
          title?: string;
          content: string;
          answer?: string;
          similarity: number;
          metadata?: Record<string, unknown>;
        }>;
        searchPerformed: {
          /** False when the short-query gate skipped the documentation search. */
          documentation: boolean;
          tickets: boolean;
          messages: boolean;
          /**
           * How the mined KB was consulted. 'org-wide-fallback' means the conversation's own
           * department had nothing, so the whole org was searched — results may come from a
           * department this agent doesn't serve. Optional: older backends omit it.
           */
          knowledgeBase?: 'scoped' | 'org-wide-fallback' | false;
        };
        // false when the org has no AI/LLM provider — the endpoint still returns
        // 200 with search-results so the FE can show the similar-message fallback.
        aiConfigured?: boolean;
        /**
         * WHY there is no written answer. Absent when one was generated.
         *
         * ⛔ `aiConfigured` does not answer this — it reports whether a provider is set up,
         * so it is `true` for a call that ran and failed. The four failures (empty KB, no
         * provider, model returned nothing, generator threw) used to be indistinguishable
         * to this client, which is how a starved token budget presented as an empty
         * knowledge base on prod.
         */
        reason?:
          | 'no-ai-provider'
          | 'no-sources'
          | 'sources-unusable'
          | 'generation-empty'
          | 'generation-failed'
          /** A draft was written but rejected: the KB entries did not support it well enough. */
          | 'poorly-grounded'
          | 'search-failed'
          /** The workspace switched AI drafts off: search results only, by the admin's choice. */
          | 'ai-drafts-off';
      }>
    >(`/api/messages/${id}/suggested-answer`);
    return response.data;
  },

  /**
   * Agent-facing draft assistant. One endpoint, three modes:
   *   generate — KB-grounded draft
   *   guided   — KB-grounded draft that also conveys the agent's own facts
   *   polish   — rewrite the agent's rough draft into something sendable to a customer
   *
   * `text` is null when the KB had nothing usable and no draft could be written —
   * a normal outcome, not an error; the caller should fall back to the KB dialog.
   */
  composeReply: async (
    id: number,
    payload: {
      mode: 'generate' | 'guided' | 'polish';
      instructions?: string;
      draft?: string;
      /** Try again: a new draft, past the thread's shared one and the reply cache. */
      fresh?: boolean;
    }
  ) => {
    const response = await apiClient.post<
      ApiResponse<{
        mode: 'generate' | 'guided' | 'polish';
        text: string | null;
        /** generate: the draft already written for this customer message, handed back unchanged. */
        shared?: boolean;
        language?: string;
        provider?: string;
        confidence?: number;
        /** false when a guided draft came from the agent's own facts, not the KB. */
        groundedInKb?: boolean;
        aiConfigured?: boolean;
        /**
         * Where the team stands on the email being answered (only copied, not listed, a colleague's).
         * Absent for mail written to us and from a backend that predates it — read it with
         * `readEnvelope` from `@/lib/messageEnvelope`, never directly.
         */
        envelope?: unknown;
      }>
    >(`/api/messages/${id}/compose-reply`, payload);
    return response.data;
  },

  /**
   * The From list of "Compose new message": only sources the caller may send from. `null` from a
   * backend without the route (404) — the caller then falls back to every email source.
   */
  getComposeSources: async (): Promise<Array<{
    id: number;
    name: string;
    type: string;
  }> | null> => {
    try {
      const response = await apiClient.get<
        ApiResponse<Array<{ id: number; name: string; type: string }>>
      >('/api/messages/compose/sources');
      return Array.isArray(response.data.data) ? response.data.data : [];
    } catch (err) {
      if (getErrorStatus(err) === 404) return null;
      throw err;
    }
  },

  /**
   * AI draft in "Compose new message": the agent's own text rewritten into a sendable email.
   * There is no thread, so no knowledge-base answer — only polish. A backend without the route
   * answers 404 (the caller then hides the button).
   */
  composePolish: async (draft: string) => {
    const response = await apiClient.post<
      ApiResponse<{ mode: 'polish'; text: string | null; language?: string; provider?: string }>
    >('/api/messages/compose-polish', { draft });
    return response.data;
  },

  /**
   * Translate arbitrary text (not a stored message) — used to show an AI draft in
   * the agent's own language before they send it. Drafts are written in the
   * CUSTOMER's language, so an agent who doesn't read it needs a way to check.
   */
  reanalyze: async (id: number) => {
    const response = await apiClient.post<ApiResponse<void>>(`/api/messages/${id}/analyze`, {});
    return response.data;
  },

  saveSuggestedAnswer: async (
    id: number,
    suggestedAnswer: {
      answer: string;
      similarity?: number;
      source?: string;
      documentTitle?: string;
    }
  ) => {
    const response = await apiClient.post<ApiResponse<void>>(
      `/api/messages/${id}/suggested-answer/save`,
      { suggestedAnswer }
    );
    return response.data;
  },

  getKBReferences: async (id: number) => {
    const response = await apiClient.get<
      ApiResponse<
        Array<{
          id: number;
          type: 'qa_pair' | 'document' | 'manual_entry';
          title: string;
          content: string;
          qualityScore: number | null;
          approved: boolean;
          timesReferenced: number;
          lastReferencedAt: string | null;
          topics: string[] | null;
          category: string | null;
          typeData: unknown;
          createdAt: string;
        }>
      >
    >(`/api/messages/${id}/kb-references`);
    return response.data;
  },

  checkContradiction: async (id: number) => {
    const response = await apiClient.post<
      ApiResponse<{
        triggeredBy: 'manual_request';
        claimToVerify: string;
        checkedAt: string;
        result: {
          hasContradiction: boolean;
          contradictingMessageId?: number;
          contradictingMessageDate?: string;
          originalStatement?: string;
          currentStatement?: string;
          confidence: 'high' | 'medium' | 'low';
          explanation?: string;
        };
        tokenUsage?: number;
        costEstimate?: number;
      }>
    >(`/api/messages/${id}/check-contradiction`, {});
    return response.data;
  },

  /**
   * An agent says the flagged contradiction is not one. The backend stamps
   * `metadata.contradictionCheck.dismissedAt`; the caller refetches the thread. A backend that
   * predates the route answers 404 — the caller turns that into a short message.
   */
  dismissContradiction: async (id: number) => {
    const response = await apiClient.post<
      ApiResponse<{ dismissedAt?: string; dismissedBy?: number | string | null }>
    >(`/api/messages/${id}/contradiction/dismiss`, {});
    return response.data;
  },
};
