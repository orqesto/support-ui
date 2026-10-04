/**
 * KB quality review: the nightly job's verdict on ONE learned entry — rewrite it ("improve") or
 * remove it ("remove") — and the moderator's decision on it.
 *
 * ⛔ Every field here is what the backend sends. The detail is normalised defensively: the FE can
 * reach production before the backend that serves these routes (CLAUDE.md "version skew"), and a
 * missing field must read as "not known", never crash the review.
 */
import { apiClient } from '@/lib/api-client';
import { apiErrorStatus } from '@/lib/apiError';

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
  /** The entry was longer than the AI could read: its rewrite may miss the end (absent ⇒ false). */
  inputTruncated: boolean;
  entry: KbQualityEntry | null;
  editedSinceProposed: boolean;
  stillEligible: boolean;
  canDecide: boolean;
};

export type KbQualityDecision =
  | { action: 'apply'; question: string; answer: string }
  | { action: 'reject' };

export type KbQualityAcceptResult = {
  /** 'unknown': the server answered with a status this UI does not know — never read as done. */
  status: 'applied' | 'rejected' | 'expired' | 'unknown';
  entryId?: number;
  publicId?: string | null;
  reason?: string;
  /** Contact details the server's PII guard removed from the saved text (absent on older BEs). */
  redactions?: number;
};

export type KbQualityBulkResult = {
  results: { suggestionId: number; status: string; error?: string }[];
  rejected: number;
  expired: number;
  failed: number;
  /** Rows this moderator may see but not decide (absent on older BEs, which refuse the batch). */
  forbidden: number;
};

/** The server's bulk limit (BE BULK_REJECT_MAX): larger selections go in batches of this. */
export const BULK_REJECT_BATCH = 100;

export const normaliseAcceptResult = (value: unknown): KbQualityAcceptResult => {
  const raw = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const status = raw.status;
  return {
    status: status === 'applied' || status === 'rejected' || status === 'expired' ? status : 'unknown',
    ...(typeof raw.entryId === 'number' ? { entryId: raw.entryId } : {}),
    ...(typeof raw.publicId === 'string' || raw.publicId === null ? { publicId: raw.publicId } : {}),
    ...(typeof raw.reason === 'string' ? { reason: raw.reason } : {}),
    ...(typeof raw.redactions === 'number' && raw.redactions > 0 ? { redactions: raw.redactions } : {}),
  };
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
    inputTruncated: raw.inputTruncated === true,
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
  /**
   * 'unsupported' only when the backend does not serve the route (404, an older release) — any
   * other failure is 'error', which the page SAYS: a missing coverage line would bring back the
   * reading "no suggestions means a clean KB".
   */
  async getStatus(): Promise<KbQualityStatus | 'unsupported' | 'error'> {
    try {
      const response = await apiClient.get<{ success: boolean; data: unknown }>(
        '/api/knowledge-base/consolidation/quality-status'
      );
      return normaliseQualityStatus(response.data.data) ?? 'error';
    } catch (err) {
      return apiErrorStatus(err) === 404 ? 'unsupported' : 'error';
    }
  },

  async getDetail(suggestionId: number): Promise<KbQualityDetail> {
    const response = await apiClient.get<{ success: boolean; data: unknown }>(
      `/api/knowledge-base/consolidation/quality/${suggestionId}`
    );
    return normaliseQualityDetail(response.data.data, suggestionId);
  },

  async accept(suggestionId: number, decision: KbQualityDecision): Promise<KbQualityAcceptResult> {
    const response = await apiClient.post<{ success: boolean; data: unknown }>(
      `/api/learning/suggestions/${suggestionId}/accept`,
      decision
    );
    return normaliseAcceptResult(response.data?.data);
  },

  /** "Keep as is": not proposed again until the entry is edited. */
  async keep(suggestionId: number): Promise<void> {
    await apiClient.post(`/api/learning/suggestions/${suggestionId}/decline`, {});
  },

  /** In batches of BULK_REJECT_BATCH, totals summed. A batch that fails stops the rest (thrown). */
  async bulkReject(suggestionIds: number[]): Promise<KbQualityBulkResult> {
    const total: KbQualityBulkResult = { results: [], rejected: 0, expired: 0, failed: 0, forbidden: 0 };
    for (let offset = 0; offset < suggestionIds.length; offset += BULK_REJECT_BATCH) {
      const response = await apiClient.post<{ success: boolean; data: Partial<KbQualityBulkResult> }>(
        '/api/knowledge-base/consolidation/quality/bulk-reject',
        { suggestionIds: suggestionIds.slice(offset, offset + BULK_REJECT_BATCH) }
      );
      const data = response.data?.data ?? {};
      total.results.push(...(Array.isArray(data.results) ? data.results : []));
      total.rejected += count(data.rejected);
      total.expired += count(data.expired);
      total.failed += count(data.failed);
      total.forbidden += count(data.forbidden);
    }
    return total;
  },
};
