import { apiClient } from '@/lib/api-client';
import type {
  KbCaseCandidate,
  KbCaseSearchParams,
  KbEngineSummary,
  KbEntryVersion,
  KbQuestionAnswerResult,
  KbQuestionChoiceKey,
  KbQuestionsPage,
  KbQuestionsParams,
  KbRestoreResult,
  KbRollbackRequest,
  KbRollbackResult,
} from '@/services/kbEngine.types';
import type { KbFinding, KbListStatus } from '@/services/kb.service';

type Envelope<T> = { success?: boolean; data: T };

const KB = '/api/knowledge-base';

/** Open questions the viewer may answer, oldest first. Cursor paged. */
export const getKbQuestions = async (opts: KbQuestionsParams = {}): Promise<KbQuestionsPage> => {
  const params: Record<string, string | number> = {};
  if (opts.departmentId) params.departmentId = opts.departmentId;
  if (opts.search?.trim()) params.search = opts.search.trim();
  if (opts.cursor) params.cursor = opts.cursor;
  if (opts.limit) params.limit = opts.limit;
  const response = await apiClient.get<Envelope<KbQuestionsPage>>(`${KB}/questions`, { params });
  return response.data.data;
};

/** `text` is required by the server for `both_wrong` (it replaces the draft or the answer). */
export const answerKbQuestion = async (
  id: number,
  choice: KbQuestionChoiceKey,
  text?: string
): Promise<KbQuestionAnswerResult> => {
  const body: { choice: KbQuestionChoiceKey; text?: string } = { choice };
  if (text !== undefined) body.text = text;
  const response = await apiClient.post<Envelope<KbQuestionAnswerResult>>(
    `${KB}/questions/${id}/answer`,
    body
  );
  return response.data.data;
};

/** Stored data only: findings (null when never computed), questions, the week, kill switches. */
export const getEngineSummary = async (departmentId?: number): Promise<KbEngineSummary> => {
  const response = await apiClient.get<Envelope<KbEngineSummary>>(`${KB}/engine/summary`, {
    params: departmentId ? { departmentId } : undefined,
  });
  return response.data.data;
};

/** Live merged cases the viewer may add entries to ("Move into a case"). */
export const searchKbCases = async (opts: KbCaseSearchParams = {}): Promise<KbCaseCandidate[]> => {
  const params: Record<string, string | number> = {};
  if (opts.search?.trim()) params.search = opts.search.trim();
  if (opts.departmentId) params.departmentId = opts.departmentId;
  if (opts.scopeKey) params.scopeKey = opts.scopeKey;
  if (opts.limit) params.limit = opts.limit;
  const response = await apiClient.get<Envelope<KbCaseCandidate[]>>(`${KB}/cases/search`, {
    params,
  });
  return response.data.data;
};

/** An entry's history, oldest first. */
export const listEntryVersions = async (entryId: number): Promise<KbEntryVersion[]> => {
  const response = await apiClient.get<Envelope<{ versions: KbEntryVersion[] }>>(
    `${KB}/entries/${entryId}/versions`
  );
  return response.data.data.versions;
};

type ErrorLike = { status?: number; data?: Record<string, unknown> };

const refusalOf = (err: unknown): KbRestoreResult | null => {
  const failure = err as ErrorLike | null | undefined;
  if (failure?.status !== 409) return null;
  const body = failure.data ?? {};
  const message = typeof body.error === 'string' ? body.error : 'This entry cannot be restored.';
  switch (body.code) {
    case 'LATER_CHANGES':
      return {
        refused: 'later_changes',
        later: Array.isArray(body.later) ? (body.later as KbEntryVersion[]) : [],
        message,
      };
    case 'TEXT_REDACTED':
      return { refused: 'text_redacted', message };
    case 'MERGED_INTO_CASE':
      return {
        refused: 'merged_into_case',
        caseId: typeof body.caseId === 'number' ? body.caseId : 0,
        message,
      };
    case 'USE_ACTION_UNDO':
      return {
        refused: 'use_action_undo',
        action: typeof body.action === 'string' ? body.action : '',
        message,
      };
    default:
      // The text changed while restoring, or the action's own undo found the entry changed.
      return { refused: 'changed_meanwhile', message };
  }
};

/**
 * Put an entry back as it was at `version`. A 409 refusal resolves to `{ refused, ... }` and does
 * not throw: the caller names the reason. Any other failure throws.
 */
export const restoreEntryVersion = async (
  entryId: number,
  version: number,
  includeLater = false
): Promise<KbRestoreResult> => {
  try {
    const response = await apiClient.post<Envelope<Exclude<KbRestoreResult, { refused: string }>>>(
      `${KB}/entries/${entryId}/versions/${version}/restore`,
      includeLater ? { includeLater: true } : {}
    );
    return response.data.data;
  } catch (err) {
    const refusal = refusalOf(err);
    if (refusal) return refusal;
    throw err;
  }
};

/** Workspace admins only. A dry run (the server default) writes nothing; page with nextAfterEntryId. */
export const rollbackEngineWindow = async (body: KbRollbackRequest): Promise<KbRollbackResult> => {
  const response = await apiClient.post<Envelope<KbRollbackResult>>(`${KB}/engine/rollback`, body);
  return response.data.data;
};

/** The list's filters as the page holds them. */
export type KbListFilters = {
  /** Always the effective status, 'all' included (the owner rule: export equals the list). */
  status: KbListStatus | 'all';
  finding?: KbFinding;
  departmentId?: number;
  departmentIds?: number[];
  /** A mailbox id, or 'none' for entries from no mailbox. */
  source?: number | 'none';
  type?: string;
  search?: string;
};

/** The CSV export of exactly what the list shows. */
export const kbExportHref = (filters: KbListFilters): string => {
  const query = new URLSearchParams();
  query.set('status', filters.status);
  if (filters.finding) query.set('finding', filters.finding);
  if (filters.departmentId) query.set('departmentId', String(filters.departmentId));
  const teams = filters.departmentIds?.length
    ? filters.departmentIds
    : filters.departmentId
      ? [filters.departmentId]
      : [];
  if (teams.length) query.set('departmentIds', teams.join(','));
  if (filters.source !== undefined) query.set('messageSourceId', String(filters.source));
  if (filters.type && filters.type !== 'all') query.set('type', filters.type);
  if (filters.search?.trim()) query.set('search', filters.search.trim());
  return `${KB}/export.csv?${query.toString()}`;
};
