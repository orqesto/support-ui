/**
 * KB consolidation (support-service #873): review a proposed merge of near-duplicate learned
 * answers into one case, undo a merge, and the Cases report.
 *
 * ⛔ Every field here is what the backend sends — nothing is derived or invented. Where the
 * backend does not say something (e.g. how many originals a case row holds in the KB list),
 * the UI says it does not know rather than guessing.
 */
import { apiClient } from '@/lib/api-client';

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
   * `total`: only inputs the job can reach (the newest per bounded scope). `beyondBound`: older
   * inputs of a bounded scope it never classifies. Absent on a backend before BE bb1121ee, whose
   * `total` still counted those.
   */
  classifying: { settled: number; total: number; beyondBound?: number };
  bounded: boolean;
  miningOff: boolean;
  /**
   * True only when the nightly job runs in PRODUCTION for this workspace. Off or dry run: nothing
   * labels entries and `classifying` never moves. Absent on an older backend — then unknown, and
   * the page keeps its "being classified" wording.
   */
  labellingActive?: boolean;
  /**
   * 'dry_run' = the owner's calibration: the job labels into a trial table only, so nothing moves
   * on this page. 'off' = it does not run (or has no AI provider). Absent on an older backend —
   * then `labellingActive` decides, as before.
   */
  labellingMode?: 'production' | 'dry_run' | 'off';
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
