/**
 * KB quality review: the nightly job's verdict on ONE learned entry — rewrite it ("improve") or
 * remove it ("remove") — and the moderator's decision on it.
 *
 * ⛔ Every field here is what the backend sends. The detail is normalised defensively: the FE can
 * reach production before the backend that serves these routes (CLAUDE.md "version skew"), and a
 * missing field must read as "not known", never crash the review.
 */
import { apiClient } from '@/lib/api-client';

export type KbQualityVerdict = 'improve' | 'remove';

export type KbQualityEntry = {
  id: number;
  publicId: string | null;
  question: string | null;
  answer: string | null;
  approved: boolean;
  timesReferenced: number;
  date: string | null;
  conversationId: number | null;
  conversationPublicId: string | null;
};

export type KbQualityDetail = {
  suggestionId: number;
  status: string;
  verdict: KbQualityVerdict;
  reasons: string[];
  note: string;
  proposed: { question: string; answer: string } | null;
  /** improve without a proposal: why there is none. */
  rewriteProblem: 'failed' | 'nothing_reusable' | 'unsafe_output' | null;
  entry: KbQualityEntry | null;
  editedSinceProposed: boolean;
  stillEligible: boolean;
  canDecide: boolean;
};

export type KbQualityDecision =
  | { action: 'apply'; question: string; answer: string }
  | { action: 'reject' };

export type KbQualityAcceptResult = {
  id: number;
  status: 'applied' | 'rejected' | 'expired';
  entryId?: number;
  publicId?: string | null;
  reason?: string;
};

export type KbQualityBulkResult = {
  results: { suggestionId: number; status: string; error?: string }[];
  rejected: number;
  expired: number;
  failed: number;
};

export type KbQualityStatus = {
  /** 'off': the review does not run · 'dry_run': a KB-cases calibration is running instead ·
   * 'no_provider': skipped every night, no usable AI provider · 'on': it runs nightly. */
  state: 'on' | 'off' | 'dry_run' | 'no_provider';
  coverage: {
    entries: number;
    checked: number;
    notYet: number;
    unassessed: number;
    rewritesWaiting: number;
    lastCheckedAt: string | null;
  };
};

const str = (value: unknown): string | null => (typeof value === 'string' ? value : null);
const num = (value: unknown): number | null => (typeof value === 'number' ? value : null);

const normaliseEntry = (value: unknown): KbQualityEntry | null => {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const id = num(raw.id);
  if (id === null) return null;
  return {
    id,
    publicId: str(raw.publicId),
    question: str(raw.question),
    answer: str(raw.answer),
    approved: raw.approved === true,
    timesReferenced: num(raw.timesReferenced) ?? 0,
    date: str(raw.date),
    conversationId: num(raw.conversationId),
    conversationPublicId: str(raw.conversationPublicId),
  };
};

export const normaliseQualityDetail = (value: unknown, suggestionId: number): KbQualityDetail => {
  const raw = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const proposed = raw.proposed as { question?: unknown; answer?: unknown } | null | undefined;
  const problem = str(raw.rewriteProblem);
  return {
    suggestionId: num(raw.suggestionId) ?? suggestionId,
    status: str(raw.status) ?? 'pending',
    verdict: raw.verdict === 'improve' ? 'improve' : 'remove',
    reasons: Array.isArray(raw.reasons)
      ? raw.reasons.filter((reason): reason is string => typeof reason === 'string')
      : [],
    note: str(raw.note) ?? '',
    proposed:
      proposed && typeof proposed.question === 'string' && typeof proposed.answer === 'string'
        ? { question: proposed.question, answer: proposed.answer }
        : null,
    rewriteProblem:
      problem === 'failed' || problem === 'nothing_reusable' || problem === 'unsafe_output'
        ? problem
        : null,
    entry: normaliseEntry(raw.entry),
    editedSinceProposed: raw.editedSinceProposed === true,
    // Absent ⇒ not known to be eligible: the server re-checks at accept either way.
    stillEligible: raw.stillEligible === true,
    canDecide: raw.canDecide === true,
  };
};

const count = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;

export const normaliseQualityStatus = (value: unknown): KbQualityStatus | null => {
  if (!value || typeof value !== 'object') return null;
  const raw = value as { state?: unknown; coverage?: Record<string, unknown> };
  const state = raw.state;
  if (state !== 'on' && state !== 'off' && state !== 'dry_run' && state !== 'no_provider') return null;
  const coverage = raw.coverage ?? {};
  return {
    state,
    coverage: {
      entries: count(coverage.entries),
      checked: count(coverage.checked),
      notYet: count(coverage.notYet),
      unassessed: count(coverage.unassessed),
      rewritesWaiting: count(coverage.rewritesWaiting),
      lastCheckedAt: str(coverage.lastCheckedAt),
    },
  };
};

export const kbQualityService = {
  /** Null when the backend does not serve the status yet (an older release) or sends nonsense. */
  async getStatus(): Promise<KbQualityStatus | null> {
    try {
      const response = await apiClient.get<{ success: boolean; data: unknown }>(
        '/api/knowledge-base/consolidation/quality-status'
      );
      return normaliseQualityStatus(response.data.data);
    } catch {
      return null;
    }
  },

  async getDetail(suggestionId: number): Promise<KbQualityDetail> {
    const response = await apiClient.get<{ success: boolean; data: unknown }>(
      `/api/knowledge-base/consolidation/quality/${suggestionId}`
    );
    return normaliseQualityDetail(response.data.data, suggestionId);
  },

  async accept(suggestionId: number, decision: KbQualityDecision): Promise<KbQualityAcceptResult> {
    const response = await apiClient.post<{ success: boolean; data: KbQualityAcceptResult }>(
      `/api/learning/suggestions/${suggestionId}/accept`,
      decision
    );
    return response.data.data;
  },

  /** "Keep as is": not proposed again until the entry is edited. */
  async keep(suggestionId: number): Promise<void> {
    await apiClient.post(`/api/learning/suggestions/${suggestionId}/decline`, {});
  },

  async bulkReject(suggestionIds: number[]): Promise<KbQualityBulkResult> {
    const response = await apiClient.post<{ success: boolean; data: KbQualityBulkResult }>(
      '/api/knowledge-base/consolidation/quality/bulk-reject',
      { suggestionIds }
    );
    return response.data.data;
  },
};
