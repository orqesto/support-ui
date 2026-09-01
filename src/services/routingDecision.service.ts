import { apiClient } from '@/lib/api-client';

/**
 * Why the routing engine deferred a conversation.
 *
 * `below_bar` and `nothing_scored` are both "needs routing" on screen today and want
 * opposite responses: route the first, write a rule for the second. On production, of 142
 * parked conversations in the replayable corpus, 131 were `nothing_scored`.
 */
export type RoutingVerdict = 'routed' | 'below_bar' | 'nothing_scored';

export interface ConsideredDept {
  departmentId: number;
  name: string;
  similarity: number;
  cleared: boolean;
}

export interface RoutingDecision {
  reason: string;
  decidedAt: string;
  chosenDeptId: number | null;
  weakBar: number;
  verdict: RoutingVerdict;
  closest: ConsideredDept | null;
  considered: ConsideredDept[];
}

export const routingDecisionService = {
  /** Null when no engine decision is stored — the conversation predates the audit. */
  get: async (conversationId: number | string): Promise<RoutingDecision | null> => {
    const response = await apiClient.get<{ success: boolean; data: RoutingDecision | null }>(
      `/api/messages/${encodeURIComponent(String(conversationId))}/routing-decision`
    );
    return response.data.data;
  },
};
