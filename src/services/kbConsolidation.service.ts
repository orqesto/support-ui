/**
 * KB consolidation (support-service #873): review a proposed merge of near-duplicate learned
 * answers into one case, undo a merge, and the Cases report.
 *
 * ⛔ Every field here is what the backend sends — nothing is derived or invented. Where the
 * backend does not say something (e.g. how many originals a case row holds in the KB list),
 * the UI says it does not know rather than guessing.
 */
import { apiClient } from '@/lib/api-client';
import { getErrorBody, getErrorStatus } from '@/lib/errorMessages';

export type KbConsolidationType = 'consolidate' | 'attach';

export type KbConsolidationConflict = { summary: string; memberIds: number[] };
export type KbConsolidationMetrics = {
  conversations: number;
  customers: number;
  sameThread: boolean;
};
/** `publicId`: absent on a backend before BE ffb025c3 — then the entry is named "#<id>". */
export type KbJudgeDropped = { id: number; reason: string; publicId?: string | null };

export type KbConsolidationMember =
  | { id: number; gone: true }
  | {
      id: number;
      gone: false;
      publicId: string | null;
      question: string | null;
      answer: string | null;
      date: string;
      approved: boolean;
      conversationId: number | null;
      conversationPublicId: string | null;
      attachments: { id: number; filename: string | null }[];
      editedSinceProposed: boolean;
      labelNow: string | null;
      languageNow: string | null;
      stillEligible: boolean;
      covered: boolean;
      alreadyCounted: boolean;
    };

export type KbConsolidationDetail = {
  suggestionId: number;
  type: KbConsolidationType;
  status: string;
  label: string | null;
  language: string | null;
  proposed: { question: string; answer: string } | null;
  proposedAnswer: string | null;
  conflicts: KbConsolidationConflict[] | null;
  rationale: string | null;
  metrics: Partial<KbConsolidationMetrics> | null;
  judgeDropped: KbJudgeDropped[] | null;
  case: {
    id: number;
    publicId: string | null;
    question: string | null;
    answer: string | null;
    editedSinceProposed: boolean;
  } | null;
  members: KbConsolidationMember[];
  canDecide: boolean;
};

export type KbConsolidationAcceptBody =
  | { question: string; answer: string; memberIds: number[]; attachmentIds?: number[] }
  | { memberIds: number[]; answer?: string; attachmentIds?: number[] };

export type KbConsolidationAcceptResult = {
  id: number;
  status: 'accepted' | 'expired';
  caseId?: number;
  /** The case's public id ("KB-900"); absent on a backend before FE audit M3. */
  casePublicId?: string | null;
  linked?: number;
  dropped?: number[];
  answerDiscarded?: boolean;
  reason?: string;
};

export type KbCaseRowKind = 'case' | 'proposed' | 'group' | 'single';

export type KbCaseRow = {
  kind: KbCaseRowKind;
  title: string | null;
  label: string | null;
  language: string | null;
  scopeKey: string | null;
  caseId: number | null;
  casePublicId: string | null;
  suggestionId: number | null;
  question?: string | null;
  questions?: string[] | null;
  standardAnswer?: string | null;
  entryIds: number[];
  conversations: number;
  customers: number;
  firstSeen: string | null;
  lastSeen: string | null;
  source: string | null;
};

export type KbCasesHeader = {
  label: string | null;
  language: string | null;
  conversations: number;
  rows: KbCaseRow[];
};

export type KbCasesFindings = {
  rawEmails: number;
  judgedCustomerSpecific: number;
  couldNotClassify: number;
  awaitingKbReview: number;
  noClearLanguage: number;
  detached: number;
  /** `casePublicIds` pairs with `caseIds`; absent on a backend before FE audit M3. */
  possibleDuplicates: { caseIds: number[]; casePublicIds?: (string | null)[] }[];
};

export type KbCasesReport = {
  headers: KbCasesHeader[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  footer: { belowQualityBar: number };
  findings: KbCasesFindings;
  /**
   * `total` / `settled`: the inputs the job can reach (the newest per scope). `outOfReach`: every
   * input past that bound — shown if labelled earlier, but never proposed or attached.
   * `beyondBound`: the subset of those never classified (BE b9773d47).
   */
  classifying: { settled: number; total: number; beyondBound: number; outOfReach: number };
  bounded: boolean;
  miningOff: boolean;
  /** True only in production: `labellingMode === 'production'`. */
  labellingActive: boolean;
  /**
   * 'production': the nightly job labels this workspace. 'dry_run': the owner's calibration — it
   * labels into a trial table only, so nothing moves on this page. 'off': it does not run, or has
   * no usable AI provider.
   */
  labellingMode: 'production' | 'dry_run' | 'off';
};

export type KbCasesQuery = {
  departmentId: number;
  search?: string;
  sort?: 'conversations' | 'lastSeen';
  page?: number;
  pageSize?: number;
};

const casesParams = (query: KbCasesQuery): Record<string, string> => {
  const params: Record<string, string> = { departmentId: String(query.departmentId) };
  if (query.search?.trim()) params.search = query.search.trim();
  if (query.sort) params.sort = query.sort;
  if (query.page) params.page = String(query.page);
  if (query.pageSize) params.pageSize = String(query.pageSize);
  return params;
};

export type KbConsolidationLastRun = {
  trigger: 'manual' | 'nightly';
  startedAt: string;
  finishedAt: string;
  outcome: 'done' | 'skipped' | 'failed';
  skipped: string | null;
  partial: boolean;
};

export type KbConsolidationRunState = {
  /** Null when no run holds the workspace. */
  runningSince: string | null;
  last: KbConsolidationLastRun | null;
  /** Only a workspace admin may start a run. */
  canRun: boolean;
};

/** Started, or why "Run now" did not start (BE 409 `data.reason`). */
export type KbRunNowResult =
  | { started: true; startedAt: string }
  | { started: false; reason: string; retryAfter: string | null };

const asString = (value: unknown): string | null => (typeof value === 'string' ? value : null);

/** Defensive: the frontend can reach a deployment before the backend that serves this route. */
export const normalizeRunState = (raw: unknown): KbConsolidationRunState => {
  const data = (raw ?? {}) as Record<string, unknown>;
  const last = (data.last ?? null) as Record<string, unknown> | null;
  const startedAt = last ? asString(last.startedAt) : null;
  const finishedAt = last ? asString(last.finishedAt) : null;
  return {
    runningSince: asString(data.runningSince),
    canRun: data.canRun === true,
    last:
      last && startedAt && finishedAt
        ? {
            trigger: last.trigger === 'manual' ? 'manual' : 'nightly',
            startedAt,
            finishedAt,
            outcome:
              last.outcome === 'skipped' || last.outcome === 'failed' ? last.outcome : 'done',
            skipped: asString(last.skipped),
            partial: last.partial === true,
          }
        : null,
  };
};

export const kbConsolidationService = {
  async getMembers(suggestionId: number): Promise<KbConsolidationDetail> {
    const response = await apiClient.get<{ success: boolean; data: KbConsolidationDetail }>(
      `/api/knowledge-base/consolidation/suggestions/${suggestionId}/members`
    );
    return response.data.data;
  },

  async accept(
    suggestionId: number,
    body: KbConsolidationAcceptBody
  ): Promise<KbConsolidationAcceptResult> {
    const response = await apiClient.post<{ success: boolean; data: KbConsolidationAcceptResult }>(
      `/api/learning/suggestions/${suggestionId}/accept`,
      body
    );
    return response.data.data;
  },

  async decline(suggestionId: number): Promise<void> {
    await apiClient.post(`/api/learning/suggestions/${suggestionId}/decline`, {});
  },

  async unmerge(caseId: number): Promise<{ caseId: number; restored: number }> {
    const response = await apiClient.post<{
      success: boolean;
      data: { caseId: number; restored: number };
    }>(`/api/knowledge-base/consolidation/cases/${caseId}/unmerge`);
    return response.data.data;
  },

  async getCases(query: KbCasesQuery): Promise<KbCasesReport> {
    const response = await apiClient.get<{ success: boolean; data: KbCasesReport }>(
      '/api/knowledge-base/consolidation/cases',
      { params: casesParams(query) }
    );
    return response.data.data;
  },

  /**
   * Null on a 404: a backend without the run-state route (an older deployment), or a viewer the
   * backend does not show it to — no button then. The API client's interceptor rejects with a
   * plain Error carrying `status`/`data`, not an AxiosError: read it through the shared helpers.
   */
  async getRunState(): Promise<KbConsolidationRunState | null> {
    try {
      const response = await apiClient.get<{ success: boolean; data: unknown }>(
        '/api/knowledge-base/consolidation/run'
      );
      return normalizeRunState(response.data.data);
    } catch (err) {
      if (getErrorStatus(err) === 404) return null;
      throw err;
    }
  },

  /** A 409 is an answer, not a failure: it says why the run did not start. */
  async runNow(): Promise<KbRunNowResult> {
    try {
      const response = await apiClient.post<{ success: boolean; data: { startedAt?: unknown } }>(
        '/api/knowledge-base/consolidation/run'
      );
      return {
        started: true,
        startedAt: asString(response.data.data?.startedAt) ?? new Date().toISOString(),
      };
    } catch (err) {
      if (getErrorStatus(err) === 409) {
        const data = (getErrorBody(err) as { data?: { reason?: unknown; retryAfter?: unknown } })
          ?.data;
        return {
          started: false,
          reason: asString(data?.reason) ?? 'unknown',
          retryAfter: asString(data?.retryAfter),
        };
      }
      throw err;
    }
  },

  /** The CSV goes through the API client so it carries the same auth as every other call. */
  async downloadCasesCsv(query: KbCasesQuery): Promise<void> {
    const params = casesParams(query);
    delete params.page;
    delete params.pageSize;
    const response = await apiClient.get('/api/knowledge-base/consolidation/cases.csv', {
      params,
      responseType: 'blob',
    });
    const url = URL.createObjectURL(response.data as Blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `kb-cases-department-${query.departmentId}.csv`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
};
