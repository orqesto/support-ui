import { apiClient } from '@/lib/api-client';

// Keep in sync with `src/shared/learning/learningService.ts` on the BE.
// Missing entries here cause silent type widening at the API boundary:
// the BE accepts `'detection'` / `'contradiction'` as valid filters, but
// FE callers passing those would have been rejected at compile time.
export type LearningDomain =
  | 'routing'
  | 'spam'
  | 'detection'
  | 'contradiction'
  | 'category'
  | 'suggested_reply'
  | 'auto_reply'
  | 'auto_reply_block'
  | 'kb_extraction'
  | 'kb_scope'
  | 'kb_quality'
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

  async acceptSuggestion(id: number): Promise<void> {
    await apiClient.post(`/api/learning/suggestions/${id}/accept`);
  },

  async declineSuggestion(id: number, reason?: string): Promise<void> {
    await apiClient.post(`/api/learning/suggestions/${id}/decline`, reason ? { reason } : {});
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
