import { apiClient } from '@/lib/api-client';

/**
 * The routing replay sweep — the production decision cascade re-run over stored decisions
 * with one knob moved at a time, scored against what actually happened.
 *
 * Shipped in support-service #558 and, like the managed-AI usage read, had no caller here.
 * #605 added the knob that matters: the WEAK embedding bar, which is what parks mail.
 */
export interface ReplayTally {
  total: number;
  triaged: number;
  correct: number;
  misroute: number;
  unlabeledConfident: number;
  triageRate: number;
  misrouteRate: number;
}

export interface ReplaySweep {
  knob: string;
  baselineValue: number;
  points: { value: number; isBaseline: boolean; tally: ReplayTally }[];
}

export interface RoutingReplayReport {
  window: { sinceDays: number; since: string };
  corpus: { conversations: number; replayable: number; skippedUnenriched: number };
  baselineFidelity: number;
  baseline: ReplayTally;
  sweeps: ReplaySweep[];
  /** How many cases could answer the threshold question at all. */
  weakThresholdCoverage?: { cases: number; withNearMissBand: number };
}

export const routingReplayService = {
  get: async (days: number): Promise<RoutingReplayReport> => {
    const response = await apiClient.get<{ success: boolean; data: RoutingReplayReport }>(
      `/api/routing-rules/scorecard/replay?days=${encodeURIComponent(String(days))}`
    );
    return response.data.data;
  },
};
