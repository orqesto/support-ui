/**
 * KB consolidation (support-service #873): review a proposed merge of near-duplicate learned
 * answers into one case, undo a merge, and the Cases report.
 *
 * ⛔ Every field here is what the backend sends — nothing is derived or invented. Where the
 * backend does not say something (e.g. how many originals a case row holds in the KB list),
 * the UI says it does not know rather than guessing.
 */
import { apiClient } from '@/lib/api-client';
import { isRouteAbsent } from '@/lib/apiError';
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
  /**
   * A case's LIVE members, as the server counts them for `last_member` (entryIds also lists
   * members that are no longer live). ABSENT on a backend before it — then no count is claimed.
   */
  memberCount?: number;
  memberIds?: number[];
  /**
   * Entries a pending merge suggestion proposes to attach to this case (they are also at the END
   * of `entryIds`). ABSENT on a backend before it — then they cannot be told from members.
   */
  pendingAttach?: { entryId: number; suggestionId: number }[];
  pendingAttachIds?: number[];
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
  /**
   * The departments the report covers (KB cases worklist). ABSENT on a backend before it: that
   * backend reports on exactly the one `departmentId` it was asked for.
   */
  departmentIds?: number[];
  /**
   * True only when no department was asked for and the viewer is org-level: the report then ALSO
   * covers mailboxes linked to no department. Absent (an older backend) or false: departments only.
   */
  unassignedScopes?: boolean;
  /**
   * The entries each set-aside finding counts, one per entry with its reason. ABSENT on a backend
   * before the worklist — then the findings are counts only and there are no rows to list.
   */
  setAside?: KbSetAsideItem[];
};

/** Why an entry is in no case — the findings, entry by entry. */
export const KB_SET_ASIDE_REASONS = [
  'raw_email',
  'awaiting_review',
  'customer_specific',
  'unclassified',
  'no_clear_language',
  'detached',
  // Edited or not yet labelled: kept on the list until the next grouping run places it.
  'classifying',
] as const;
/** `other`: a reason this app does not know yet (a newer backend) — still an entry in no case. */
export type KbSetAsideReason = (typeof KB_SET_ASIDE_REASONS)[number] | 'other';
export type KbSetAsideItem = { entryId: number; reason: KbSetAsideReason };

export type KbWorkRowStatus = 'approved' | 'pending' | 'hidden' | 'rejected';

/** One entry as the worklist shows it (`POST /consolidation/entries/rows`). */
export type KbWorkRow = {
  id: number;
  /** The entry's own reference (#KB-…), when it has one. */
  publicId?: string | null;
  title: string | null;
  question: string | null;
  answer: string | null;
  status: KbWorkRowStatus;
  /** The case it is merged into (a case's own entry carries its own id, or null). */
  caseId: number | null;
  casePublicId: string | null;
  /** The conversation the answer was learned from — never a raw message-event id. */
  conversationId: number | null;
  conversationPublicId: string | null;
  /**
   * May this viewer change what CASE it is in (move / remove from case / unmerge)? Unmerge's rule:
   * a moderator of every department its scope serves.
   */
  canDecide: boolean;
  /**
   * May this viewer approve / reject / hide / unhide / edit it (the KB list's canReview, per
   * entry)? ABSENT on a backend before it — then `canDecide` stands in, the stricter rule, so
   * nothing is offered that answers 403.
   */
  canModerate?: boolean;
  /** The mailbox / department scope it belongs to; an entry joins only a case of the SAME scope. */
  scopeKey?: string | null;
  /** The entry IS a merged case (BE sends it; absent on a backend that does not). */
  isCase?: boolean;
  /** Not in the contract; read when a backend sends it (the KB list's purge date). */
  rejectedAt?: string | null;
  /**
   * Not in the contract; read when a backend sends it. Its source was removed: the KB list reads
   * "Source removed — not used" and offers no action — so does this list.
   */
  sourceDeleted?: boolean;
};

export type KbCasesQuery = {
  /** The departments to report on; empty or absent = every department the viewer can see. */
  departmentIds?: number[];
  /** Older backend only (before the worklist): the ONE department it requires. */
  departmentId?: number;
  search?: string;
  sort?: 'conversations' | 'lastSeen';
  page?: number;
  pageSize?: number;
};

/**
 * The report was refused for want of ONE department: a backend before the worklist, which knows
 * neither "all departments" nor a list. The page then falls back to a single department.
 */
export class KbCasesNeedsDepartmentError extends Error {
  constructor() {
    super('This server reports on one department at a time.');
    this.name = 'KbCasesNeedsDepartmentError';
  }
}

const NEEDS_ONE_DEPARTMENT = /'?departmentId'? is required/;

const positiveInt = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value > 0;

/** Defensive: an older backend sends neither field; a newer one may send reasons we do not know. */
export const normalizeCasesReport = (raw: KbCasesReport): KbCasesReport => {
  const data = raw as Omit<KbCasesReport, 'setAside' | 'departmentIds' | 'unassignedScopes'> & {
    setAside?: unknown;
    departmentIds?: unknown;
    unassignedScopes?: unknown;
  };
  const setAside = Array.isArray(data.setAside)
    ? data.setAside.flatMap((item: unknown): KbSetAsideItem[] => {
        const entry = (item ?? {}) as { entryId?: unknown; reason?: unknown };
        if (!positiveInt(entry.entryId)) return [];
        const reason = (KB_SET_ASIDE_REASONS as readonly unknown[]).includes(entry.reason)
          ? (entry.reason as KbSetAsideReason)
          : // A reason this app does not know yet is still an entry in no case: list it, under
            // a reason that claims nothing, rather than drop it from the page.
            'other';
        return [{ entryId: entry.entryId, reason }];
      })
    : undefined;
  const departmentIds = Array.isArray(data.departmentIds)
    ? data.departmentIds.filter(positiveInt)
    : undefined;
  const {
    setAside: _omitSetAside,
    departmentIds: _omitDepartments,
    unassignedScopes,
    ...rest
  } = data;
  return {
    ...rest,
    // Only a real `true` widens what "all" means; anything else claims departments only.
    unassignedScopes: unassignedScopes === true,
    ...(setAside ? { setAside } : {}),
    ...(departmentIds ? { departmentIds } : {}),
  };
};

const WORK_ROW_STATUSES: readonly KbWorkRowStatus[] = ['approved', 'pending', 'hidden', 'rejected'];
const nullableString = (value: unknown): string | null =>
  typeof value === 'string' ? value : null;
const nullableId = (value: unknown): number | null => (positiveInt(value) ? value : null);

/** A row with a status we cannot read is dropped from the list, never shown as "Pending". */
export const normalizeWorkRow = (raw: unknown): KbWorkRow | null => {
  const data = (raw ?? {}) as Record<string, unknown>;
  if (!positiveInt(data.id)) return null;
  if (!WORK_ROW_STATUSES.includes(data.status as KbWorkRowStatus)) return null;
  return {
    id: data.id,
    publicId: nullableString(data.publicId),
    title: nullableString(data.title),
    question: nullableString(data.question),
    answer: nullableString(data.answer),
    status: data.status as KbWorkRowStatus,
    caseId: nullableId(data.caseId),
    casePublicId: nullableString(data.casePublicId),
    conversationId: nullableId(data.conversationId),
    conversationPublicId: nullableString(data.conversationPublicId),
    canDecide: data.canDecide === true,
    rejectedAt: nullableString(data.rejectedAt),
    ...(typeof data.sourceDeleted === 'boolean' ? { sourceDeleted: data.sourceDeleted } : {}),
    ...(data.isCase === true ? { isCase: true } : {}),
    ...(typeof data.canModerate === 'boolean' ? { canModerate: data.canModerate } : {}),
    ...(typeof data.scopeKey === 'string' || data.scopeKey === null
      ? { scopeKey: data.scopeKey }
      : {}),
  };
};

/** The rows route takes at most this many ids per call. */
export const WORK_ROWS_MAX_IDS = 200;

/** Moved, or why not (BE 409 `reason` / 403), or a backend without the route. */
export type KbAttachResult =
  | { outcome: 'attached'; attached: number[] }
  | { outcome: 'refused'; status: number; reason: string | null; message: string | null }
  | { outcome: 'unsupported' };

/** Taken out of a case, or why not (409 `reason` / 403), or a backend without the route. */
export type KbDetachResult =
  /** `detached` null: the backend did not say which — the caller re-reads, never assumes. */
  | { outcome: 'detached'; detached: number[] | null }
  | { outcome: 'refused'; status: number; reason: string | null; message: string | null }
  | { outcome: 'unsupported' };

const casesParams = (query: KbCasesQuery): Record<string, string> => {
  const params: Record<string, string> = {};
  if (query.departmentId !== undefined) params.departmentId = String(query.departmentId);
  else if (query.departmentIds && query.departmentIds.length > 0)
    params.departmentIds = query.departmentIds.join(',');
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

/** The layer that decided a switch: a workspace row, the global row, or the code default. */
export type KbSwitchLayer = 'workspace' | 'global' | 'default';
/**
 * `from` null: the backend named a layer this app does not know — no scope is claimed.
 * `unreadable`: the flag rows could not be read (`on` is then the backend's safe answer) — the
 * text says so instead of "switched off". Absent unless the backend says exactly `true`.
 */
export type KbSwitch = { on: boolean; from: KbSwitchLayer | null; unreadable?: true };

/**
 * Which feature flags decide consolidation for this workspace, and where each value came from
 * (GET/POST `/consolidation/run` `switches`). ABSENT on a backend before it — then null, and
 * every text stays what it was.
 */
export type KbConsolidationSwitches = {
  /** The workspace runs on its own AI key (not managed AI). */
  ownKey: boolean;
  selfHosted: boolean;
  /** Whether a GLOBAL flag row reaches this workspace (false: own key on a hosted deployment). */
  globalApplies: boolean;
  enabled: KbSwitch;
  /** Null when the backend did not say — nothing is claimed about a trial then. */
  dryRun: KbSwitch | null;
  /** Null when the backend did not say — nothing is claimed about the quality review then. */
  quality: KbSwitch | null;
};

export type KbConsolidationRunState = {
  /** Null when no run holds the workspace. */
  runningSince: string | null;
  last: KbConsolidationLastRun | null;
  /** Only a workspace admin may start a run. */
  canRun: boolean;
  /** Absent on a backend before `switches` (or one that sent a shape this app cannot read). */
  switches?: KbConsolidationSwitches;
};

/** Started, or why "Run now" did not start (BE 409 `data.reason`). */
export type KbRunNowResult =
  | { started: true; startedAt: string }
  | {
      started: false;
      reason: string;
      retryAfter: string | null;
      /** Sent with a refusal by a backend with `switches`; absent otherwise. */
      switches?: KbConsolidationSwitches;
    };

const asString = (value: unknown): string | null => (typeof value === 'string' ? value : null);

const SWITCH_LAYERS: readonly KbSwitchLayer[] = ['workspace', 'global', 'default'];

const normalizeSwitch = (raw: unknown): KbSwitch | null => {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as { on?: unknown; from?: unknown; unreadable?: unknown };
  if (typeof data.on !== 'boolean') return null;
  return {
    on: data.on,
    from: SWITCH_LAYERS.includes(data.from as KbSwitchLayer) ? (data.from as KbSwitchLayer) : null,
    ...(data.unreadable === true ? { unreadable: true as const } : {}),
  };
};

/**
 * Defensive: an older backend sends no `switches` ⇒ null. Without a readable `enabled` nothing is
 * claimed at all. `globalApplies`, when absent, follows the contract's own rule
 * (`!ownKey || selfHosted`) only when both of those are sent; otherwise the switches are unread.
 */
export const normalizeSwitches = (raw: unknown): KbConsolidationSwitches | null => {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;
  const enabled = normalizeSwitch(data.enabled);
  if (!enabled) return null;
  const ownKey = typeof data.ownKey === 'boolean' ? data.ownKey : null;
  const selfHosted = typeof data.selfHosted === 'boolean' ? data.selfHosted : null;
  const globalApplies =
    typeof data.globalApplies === 'boolean'
      ? data.globalApplies
      : ownKey !== null && selfHosted !== null
        ? !ownKey || selfHosted
        : null;
  if (globalApplies === null) return null;
  return {
    ownKey: ownKey ?? !globalApplies,
    selfHosted: selfHosted ?? false,
    globalApplies,
    enabled,
    dryRun: normalizeSwitch(data.dryRun),
    quality: normalizeSwitch(data.quality),
  };
};

/** Defensive: the frontend can reach a deployment before the backend that serves this route. */
export const normalizeRunState = (raw: unknown): KbConsolidationRunState => {
  const data = (raw ?? {}) as Record<string, unknown>;
  const last = (data.last ?? null) as Record<string, unknown> | null;
  const startedAt = last ? asString(last.startedAt) : null;
  const finishedAt = last ? asString(last.finishedAt) : null;
  const switches = normalizeSwitches(data.switches);
  return {
    ...(switches ? { switches } : {}),
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

  /**
   * Throws `KbCasesNeedsDepartmentError` when a backend before the worklist refuses a request
   * without ONE `departmentId` — the caller falls back to a single department.
   */
  async getCases(query: KbCasesQuery): Promise<KbCasesReport> {
    try {
      const response = await apiClient.get<{ success: boolean; data: KbCasesReport }>(
        '/api/knowledge-base/consolidation/cases',
        { params: casesParams(query) }
      );
      return normalizeCasesReport(response.data.data);
    } catch (err) {
      const body = getErrorBody(err);
      if (
        query.departmentId === undefined &&
        getErrorStatus(err) === 400 &&
        NEEDS_ONE_DEPARTMENT.test(String(body?.error ?? body?.message ?? ''))
      )
        throw new KbCasesNeedsDepartmentError();
      throw err;
    }
  },

  /**
   * The entries behind a case or a set-aside finding, in the order asked. Ids the viewer may not
   * see are dropped by the server. Null on a backend without the route (before the worklist).
   */
  async getWorkRows(ids: number[]): Promise<KbWorkRow[] | null> {
    if (ids.length === 0) return [];
    try {
      const response = await apiClient.post<{ success: boolean; data: { rows?: unknown } }>(
        '/api/knowledge-base/consolidation/entries/rows',
        { ids: ids.slice(0, WORK_ROWS_MAX_IDS) }
      );
      const rows = response.data.data?.rows;
      return Array.isArray(rows)
        ? rows.map(normalizeWorkRow).filter((row): row is KbWorkRow => row !== null)
        : [];
    } catch (err) {
      if (isRouteAbsent(err)) return null;
      throw err;
    }
  },

  /**
   * Take entries out of a live case (the case stays; each comes back on its own, pending).
   * A 403 / 409 is an answer (why not), not a failure.
   */
  async detachFromCase(caseId: number, entryIds: number[]): Promise<KbDetachResult> {
    try {
      const response = await apiClient.post<{
        success: boolean;
        data: { detached?: unknown };
      }>(`/api/knowledge-base/consolidation/cases/${caseId}/detach`, { entryIds });
      const detached = response.data.data?.detached;
      return {
        outcome: 'detached',
        detached: Array.isArray(detached) ? detached.filter(positiveInt) : null,
      };
    } catch (err) {
      if (isRouteAbsent(err)) return { outcome: 'unsupported' };
      const status = getErrorStatus(err);
      if (status === 403 || status === 409) {
        const body = getErrorBody(err) as
          | (ReturnType<typeof getErrorBody> & { reason?: unknown; data?: { reason?: unknown } })
          | undefined;
        return {
          outcome: 'refused',
          status,
          reason: asString(body?.reason) ?? asString(body?.data?.reason),
          message: asString(body?.error) ?? asString(body?.message),
        };
      }
      throw err;
    }
  },

  /** Move entries into a live case. A 403 / 409 is an answer (why not), not a failure. */
  async attachToCase(caseId: number, entryIds: number[]): Promise<KbAttachResult> {
    try {
      const response = await apiClient.post<{
        success: boolean;
        data: { attached?: unknown };
      }>(`/api/knowledge-base/consolidation/cases/${caseId}/attach`, { entryIds });
      const attached = response.data.data?.attached;
      return {
        outcome: 'attached',
        attached: Array.isArray(attached) ? attached.filter(positiveInt) : [],
      };
    } catch (err) {
      if (isRouteAbsent(err)) return { outcome: 'unsupported' };
      const status = getErrorStatus(err);
      if (status === 403 || status === 409) {
        const body = getErrorBody(err) as
          | (ReturnType<typeof getErrorBody> & { reason?: unknown; data?: { reason?: unknown } })
          | undefined;
        return {
          outcome: 'refused',
          status,
          reason: asString(body?.reason) ?? asString(body?.data?.reason),
          message: asString(body?.error) ?? asString(body?.message),
        };
      }
      throw err;
    }
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
        const data = (
          getErrorBody(err) as {
            data?: { reason?: unknown; retryAfter?: unknown; switches?: unknown };
          }
        )?.data;
        const switches = normalizeSwitches(data?.switches);
        return {
          started: false,
          reason: asString(data?.reason) ?? 'unknown',
          retryAfter: asString(data?.retryAfter),
          ...(switches ? { switches } : {}),
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
    const scope =
      query.departmentId !== undefined
        ? `department-${query.departmentId}`
        : query.departmentIds && query.departmentIds.length > 0
          ? `departments-${query.departmentIds.join('-')}`
          : 'all-departments';
    anchor.download = `kb-cases-${scope}.csv`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
};
