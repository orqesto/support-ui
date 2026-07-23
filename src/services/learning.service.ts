import { apiClient } from '@/lib/api-client';

// Keep in sync with `src/shared/learning/learningService.ts` on the BE.
// Missing entries here cause silent type widening at the API boundary:
// the BE accepts `'detection'` / `'contradiction'` as valid filters, but
// FE callers passing those would have been rejected at compile time.
//
// Declared is NOT functional. Only the first group is registered in the engine,
// and even there most are 'planned' scaffolds (routing is the only 'live' loop;
// spam is 'partial'). The RESERVED group has no producer/consumer at all — the
// API accepts them for forward-compat, but they never emit a suggestion, so the
// UI never renders them. Do not present them as active learning.
export type LearningDomain =
  // Registered in the engine (functional status varies — see BE engine/types.ts):
  | 'routing' // live
  | 'spam' // partial
  | 'detection' // planned
  | 'contradiction' // planned
  | 'kb_quality' // planned
  | 'auto_reply' // planned
  // RESERVED — no producer/consumer today; never emits a suggestion:
  | 'category'
  | 'suggested_reply'
  | 'auto_reply_block'
  | 'kb_extraction'
  | 'kb_scope'
  | 'sentiment'
  | 'lead'
  | 'multi_topic'
  | 'sla'
  | 'resolution_quality';

export type LearningSuggestion = {
  id: number;
  domain: LearningDomain;
  suggestionType: string;
  payload: Record<string, unknown>;
  evidenceEventIds: number[] | null;
  evidenceCount: number;
  confidence: string | null; // numeric → string from PG
  status: 'pending' | 'accepted' | 'declined' | 'expired';
  expiresAt: string;
  createdAt: string;
};

export type TrustMode = 'manual' | 'balanced' | 'aggressive';

export type TrustState = {
  trustScore: number;
  trustMode: TrustMode;
  trustModeSetAt: string;
  initialGraceUntil: string;
  effectiveMode: TrustMode;
  thresholdMultiplier: number;
  inInitialGrace: boolean;
};

export type LearningAutoActionType =
  | 'promote'
  | 'consolidate'
  | 'disable_provisional'
  | 'delete_provisional';

export type LearningNotification = {
  id: number;
  organizationId: number;
  domain: string;
  actionType: LearningAutoActionType;
  ruleTable: string;
  ruleId: number;
  summary: string;
  evidence: Record<string, unknown>;
  undoAvailableUntil: string;
  createdAt: string;
};

export type SuggestionEvidenceItem = {
  messageId: number;
  conversationId: number;
  conversationPublicId: string | null;
  subject: string | null;
  contentExcerpt: string;
  ruleAMatched: boolean;
  ruleBMatched: boolean;
};

export type SuggestionEvidenceResponse = {
  evidence: SuggestionEvidenceItem[];
  ruleA: { id: number; type: string; value: string } | null;
  ruleB: { id: number; type: string; value: string } | null;
  /**
   * Number of recent message_events the fallback scan walked when the
   * suggestion's stored evidenceEventIds was empty. null when stored ids were
   * used (no fallback scan ran). Lets the UI differentiate "no traffic yet"
   * (scannedCount === 0) from "scanned N messages, none co-matched"
   * (scannedCount > 0; often signals a false-positive conflict).
   */
  scannedCount?: number | null;
};

export const learningService = {
  async listSuggestions(domain?: LearningDomain): Promise<LearningSuggestion[]> {
    const params: Record<string, string> = {};
    if (domain) params.domain = domain;
    const response = await apiClient.get<{
      success: boolean;
      data: { suggestions: LearningSuggestion[] };
    }>('/api/learning/suggestions', { params });
    return response.data.data?.suggestions ?? [];
  },

  async getSuggestionEvidence(id: number): Promise<SuggestionEvidenceResponse> {
    const response = await apiClient.get<{
      success: boolean;
      data: SuggestionEvidenceResponse;
    }>(`/api/learning/suggestions/${id}/evidence`);
    return (
      response.data.data ?? { evidence: [], ruleA: null, ruleB: null, scannedCount: null }
    );
  },

  async acceptSuggestion(id: number): Promise<void> {
    await apiClient.post(`/api/learning/suggestions/${id}/accept`);
  },

  async declineSuggestion(id: number, reason?: string): Promise<void> {
    await apiClient.post(`/api/learning/suggestions/${id}/decline`, reason ? { reason } : {});
  },

  // Tighten one rule of a routing conflict in place (the "Refine" action) —
  // resolves the conflict without disabling either rule.
  async editRule(id: number, target: 'A' | 'B', value: string): Promise<void> {
    await apiClient.post(`/api/learning/suggestions/${id}/edit-rule`, { target, value });
  },

  async getTrustState(): Promise<TrustState> {
    const response = await apiClient.get<{ success: boolean; data: TrustState }>(
      '/api/learning/trust'
    );
    if (!response.data?.data) throw new Error('Malformed trust state response');
    return response.data.data;
  },

  async setTrustMode(mode: TrustMode): Promise<TrustState> {
    const response = await apiClient.patch<{ success: boolean; data: TrustState }>(
      '/api/learning/trust',
      { mode }
    );
    if (!response.data?.data) throw new Error('Malformed trust state response');
    return response.data.data;
  },

  async listNotifications(): Promise<LearningNotification[]> {
    const response = await apiClient.get<{
      success: boolean;
      data: { notifications: LearningNotification[] };
    }>('/api/learning/notifications');
    return response.data.data?.notifications ?? [];
  },

  async undoNotification(id: number): Promise<void> {
    await apiClient.post(`/api/learning/notifications/${id}/undo`);
  },

  async runEngine(): Promise<EngineRunSummary> {
    const response = await apiClient.post<{
      success: boolean;
      data: EngineRunSummary;
    }>('/api/learning/run');
    if (!response.data?.data) throw new Error('Malformed run-engine response');
    return response.data.data;
  },
};

export type DomainPassSummary = {
  domain: string;
  pass1RulesScored: number;
  pass3Promoted: number;
  pass3Disabled: number;
  pass3SuggestionsEmitted: number;
  pass4ConflictsDetected: number;
  pass4ConflictsEmitted: number;
  error?: string;
};

export type EngineRunSummary = {
  runId: string;
  organizationId: number;
  durationMs: number;
  trustMode: TrustMode;
  thresholdMultiplier: number;
  domains: DomainPassSummary[];
};
