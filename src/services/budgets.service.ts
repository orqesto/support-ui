import { apiClient } from '@/lib/api-client';
import { getErrorBody, getErrorStatus } from '@/lib/errorMessages';

/*
 * The monthly AI budgets API. The types below are copied VERBATIM from the backend contract
 * (src/modules/budgets/budgetTypes.ts); change a shape there only together with here.
 */

export type StatusLine = { tone: 'ok' | 'warn' | 'bad'; text: string };

/**
 * Active extra of one scope. Several active grants of the same scope are shown as one: tokens and
 * used summed, `id` = the one charged first (ending first), `endsAt` = the latest end, `grantIds`
 * = all of them (End extra sends these).
 */
export type ExtraView = {
  id: number;
  grantIds: number[];
  tokens: number;
  used: number;
  endsAt: string;
};

export type GroupSummary = {
  key: string;
  kind: 'alliance' | 'workspace';
  /** The alliance id (kind 'alliance') or the workspace id (kind 'workspace'). */
  id: number;
  name: string;
  /** In force this month: the override, else (hosted, our key) the plans' sum, else null. */
  budget: number | null;
  budgetSource: 'override' | 'plans' | 'none';
  bulkLimitOn: boolean;
  bulkPct: number;
  /** extra = tokens charged to extra this month (outside the budget). live = total − bulk. */
  spend: { total: number; bulk: number; live: number; extra: number };
  /** Active workspaces in the group now. */
  workspaces: number;
  status: StatusLine;
  /** Every workspace of the group runs on its own AI key. */
  ownKey: boolean;
  /** How many extra requests are open for the group (organisation-wide and its workspaces'). */
  requestCount: number;
};

export type WorkspaceRow = {
  organizationId: number;
  name: string;
  /** This month, while in THIS group, not counting extra. */
  spend: { total: number; bulk: number; live: number };
  /** The workspace's own bulk limit (tokens), or null. */
  bulkLimit: number | null;
  /** The workspace's own active extra. */
  extra: ExtraView | null;
  /** The workspace still has knowledge-base threads to mine (a mine / import is running or parked). */
  bulkRunning: boolean;
  /** Its bulk (KB) work is stopped right now: refused by the budget or a bulk limit, no extra left. */
  bulkPaused: boolean;
  /** What its knowledge-base backlog would cost, rounded up to 5M, at least 5M. */
  suggestedExtra: number;
  status: StatusLine;
  /** Live spend today vs its usual day — information only. */
  liveSpike: { today: number; usual: number } | null;
};

export type RequestRow = {
  id: number;
  /** organizationId null = the whole organisation; allianceId null = a standalone workspace. */
  target: { allianceId: number | null; organizationId: number | null; name: string };
  tokens: number;
  reason: string | null;
  /** The requester's name (or email). */
  requestedBy: string;
  createdAt: string;
};

export type CanEdit = { budget: boolean; bulk: boolean; workspaceLimits: boolean; grant: boolean };

export type GroupDetail = GroupSummary & {
  active: true;
  /** Spend this month by workspaces no longer in the group (removed or deactivated). */
  removedSpend: { total: number; bulk: number };
  /** Organisation-wide extra (null for a standalone workspace). */
  groupExtra: ExtraView | null;
  rows: WorkspaceRow[];
  requests: RequestRow[];
  /** 'YYYY-MM' (UTC). */
  month: string;
  /** The 1st of next month, 00:00 UTC. */
  resetsAt: string;
  bulkPctMin: number;
  bulkPctMax: number;
  canEdit: CanEdit;
};

/** The settings the platform admin edits (`ai.budgets` without its per-group entries). */
export type BudgetSettingsView = {
  version: 1;
  activatedAt?: string;
  bulkPctMin: number;
  bulkPctMax: number;
  defaultBulkPct: number;
  tokensPerCall: number;
  serverCeiling: number | null;
  liveSpikeFactor: number;
  workspaceBulkLimits: Record<string, number>;
};

/** GET /api/admin/budgets/state */
export type BudgetState = {
  active: boolean;
  selfHosted: boolean;
  settings: BudgetSettingsView;
  /** Self-hosted only (the server ceiling and this month's whole-server spend, extra included). */
  server: { ceiling: number | null; spend: number } | null;
  /** How many extra requests are open. */
  requests: number;
  /** The open requests, newest first (at most 100). */
  requestList: RequestRow[];
};

/** GET /api/admin/budgets/groups */
export type GroupPage = { items: GroupSummary[]; total: number };

/** GET /api/alliances/:allianceId/budget and GET /api/organizations/ai-usage before Apply. */
export type BudgetsInactive = { active: false };

/** GET /api/organizations/ai-usage (once the budgets are switched on). */
export type WorkspaceUsage = {
  active: true;
  group: { key: string; kind: 'alliance' | 'workspace'; name: string };
  budget: number | null;
  budgetSource: 'override' | 'plans' | 'none';
  bulkLimitOn: boolean;
  bulkPct: number;
  bulkPctMin: number;
  bulkPctMax: number;
  /** The group's month spend (not counting extra). */
  spend: { total: number; bulk: number; live: number };
  /** The group's bulk limit in tokens (budget × bulk %), null when off or no budget. */
  bulkLimit: number | null;
  /** This workspace's own active extra. */
  extra: ExtraView | null;
  /** This workspace's line. */
  status: StatusLine;
  /** This workspace's bulk (KB) work is stopped right now: refused, and no extra left to carry it. */
  bulkPaused: boolean;
  /** The group's line. */
  groupStatus: StatusLine;
  /** This workspace's own bulk limit and its bulk spend this month in this group. */
  myBulkLimit: number | null;
  myBulkSpend: number;
  ownKey: boolean;
  /** budget/bulk: a hosted own-key standalone workspace's admin (Ruling 2); request: any admin. */
  canEdit: { budget: boolean; bulk: boolean; request: boolean };
  month: string;
  resetsAt: string;
};

/* ---- Shapes not in the BE contract file: the migration dry run and the request bodies. ---- */

export type MigrationBasis =
  | 'alliance_pool'
  | 'sum_of_members'
  | 'standalone_limits'
  | 'plan'
  | 'none';

/** GET /api/admin/budgets/migration - one group of the dry run. */
export type MigrationRow = {
  group: { kind: 'alliance'; allianceId: number } | { kind: 'workspace'; organizationId: number };
  name: string;
  budget: number | null;
  bulkPct: number;
  bulkLimitOn: true;
  basis: MigrationBasis;
  workspaceBulkLimits: {
    organizationId: number;
    name: string;
    from: number;
    meaningChanged: true;
  }[];
  wouldStopWithin7Days: boolean;
};

export type BudgetMigration = { rows: MigrationRow[]; alreadyActive: boolean };

/** Per group key (a:<id> / w:<id>). */
export type MigrationOverrides = Record<string, { budget: number | null; bulkPct?: number }>;

export type GroupListParams = {
  q?: string;
  sort?: 'spend' | 'name';
  filter?: 'paused' | 'no_limit' | 'extra' | 'requests';
  page?: number;
  pageSize?: number;
};

export type GroupUpdate = { budget?: number | null; bulkLimitOn?: boolean; bulkPct?: number };

export type ExtraTarget = { allianceId: number | null; organizationId: number | null };

export type GiveExtraBody = {
  targets: ExtraTarget[];
  tokens: number | 'suggested';
  end: 'today' | 3 | 7;
  requestId?: number;
  reason?: string;
};

export type GrantedExtra = {
  id: number;
  allianceId: number | null;
  organizationId: number | null;
  tokens: number;
  endsAt: string;
};

export type SettingsUpdate = Partial<
  Pick<
    BudgetSettingsView,
    | 'bulkPctMin'
    | 'bulkPctMax'
    | 'defaultBulkPct'
    | 'tokensPerCall'
    | 'serverCeiling'
    | 'liveSpikeFactor'
  >
>;

export type AllianceBudgetUpdate = { bulkLimitOn?: boolean; bulkPct?: number };
export type ExtraRequestBody = { tokens: number; reason?: string };
export type WorkspaceBudgetUpdate = {
  budget?: number | null;
  bulkLimitOn?: boolean;
  bulkPct?: number;
};

/** `getState` result: `available: false` = the backend has no budget API yet (404, FE deployed first). */
export type BudgetStateResult = { available: false } | { available: true; state: BudgetState };

type Envelope<T> = { success: boolean; data: T };

const unwrap = <T>(response: { data: Envelope<T> }): T => response.data.data;
const base = '/api/admin/budgets';
const groupPath = (key: string) => `${base}/groups/${encodeURIComponent(key)}`;
const alliancePath = (allianceId: number) =>
  `/api/alliances/${encodeURIComponent(String(allianceId))}/budget`;
const usagePath = '/api/organizations/ai-usage';

/**
 * Did an OLD backend (no budget routes, FE deployed first) answer GET /api/organizations/ai-usage?
 * There the path falls through to `GET /api/organizations/:id` (organizationRoutes.ts), which
 * answers:
 *   - a non-global-admin: 403 `{ error: 'Global admin access required', code: 'ROLE_REQUIRED' }`
 *     (requireGlobalAdmin);
 *   - a global admin: 400 `{ error: 'Invalid organization ID' }` ("ai-usage" is not a number);
 *   - and a server without the route at all: 404.
 * The NEW route's own refusals stay errors: its GET guard is requirePermission (403 code
 * PERMISSION_DENIED, never ROLE_REQUIRED), the workspace context answers 403 "You do not have
 * access to this workspace" / "Workspace is inactive" and 400 "Workspace context required…". So
 * a 403 or 400 counts as "old server" only by the exact old body, never by the status alone.
 */
const isOldServerUsageAnswer = (error: unknown): boolean => {
  const status = getErrorStatus(error);
  if (status === 404) return true;
  const body = getErrorBody(error);
  if (status === 403) return body?.code === 'ROLE_REQUIRED';
  if (status === 400) return body?.error === 'Invalid organization ID';
  return false;
};

export const budgetsService = {
  // ---- platform admin ----
  getState: async (): Promise<BudgetStateResult> => {
    try {
      const response = await apiClient.get<Envelope<BudgetState>>(`${base}/state`);
      return { available: true, state: unwrap(response) };
    } catch (error) {
      if (getErrorStatus(error) === 404) return { available: false };
      throw error;
    }
  },

  getMigration: async (): Promise<BudgetMigration> =>
    unwrap(await apiClient.get<Envelope<BudgetMigration>>(`${base}/migration`)),

  applyMigration: async (overrides?: MigrationOverrides): Promise<{ active: true }> =>
    unwrap(
      await apiClient.post<Envelope<{ active: true }>>(
        `${base}/migration/apply`,
        overrides ? { overrides } : {}
      )
    ),

  listGroups: async (params: GroupListParams = {}): Promise<GroupPage> =>
    unwrap(await apiClient.get<Envelope<GroupPage>>(`${base}/groups`, { params })),

  getGroup: async (key: string): Promise<GroupDetail> =>
    unwrap(await apiClient.get<Envelope<GroupDetail>>(groupPath(key))),

  updateGroup: async (key: string, body: GroupUpdate): Promise<GroupDetail> =>
    unwrap(await apiClient.put<Envelope<GroupDetail>>(groupPath(key), body)),

  /** `limit` null removes the workspaces' own bulk limit. */
  setWorkspaceLimits: async (
    organizationIds: number[],
    limit: number | null
  ): Promise<{ updated: number }> =>
    unwrap(
      await apiClient.put<Envelope<{ updated: number }>>(`${base}/workspace-limits`, {
        organizationIds,
        limit,
      })
    ),

  giveExtra: async (body: GiveExtraBody): Promise<{ grants: GrantedExtra[] }> =>
    unwrap(await apiClient.post<Envelope<{ grants: GrantedExtra[] }>>(`${base}/extra`, body)),

  endExtra: async (grantIds: number[]): Promise<{ ended: number }> =>
    unwrap(await apiClient.post<Envelope<{ ended: number }>>(`${base}/extra/end`, { grantIds })),

  declineRequest: async (id: number): Promise<void> => {
    await apiClient.post(`${base}/requests/${encodeURIComponent(String(id))}/decline`);
  },

  updateSettings: async (body: SettingsUpdate): Promise<BudgetSettingsView> =>
    unwrap(await apiClient.patch<Envelope<BudgetSettingsView>>(`${base}/settings`, body)),

  // ---- organisation admin (the api-client adds X-Alliance-Context itself) ----
  getAllianceBudget: async (allianceId: number): Promise<GroupDetail | BudgetsInactive> =>
    unwrap(await apiClient.get<Envelope<GroupDetail | BudgetsInactive>>(alliancePath(allianceId))),

  updateAllianceBudget: async (
    allianceId: number,
    body: AllianceBudgetUpdate
  ): Promise<GroupDetail> =>
    unwrap(await apiClient.put<Envelope<GroupDetail>>(alliancePath(allianceId), body)),

  setAllianceWorkspaceLimits: async (
    allianceId: number,
    organizationIds: number[],
    limit: number | null
  ): Promise<{ updated: number }> =>
    unwrap(
      await apiClient.put<Envelope<{ updated: number }>>(
        `${alliancePath(allianceId)}/workspace-limits`,
        { organizationIds, limit }
      )
    ),

  /** `organizationId` omitted = the whole organisation. */
  requestAllianceExtra: async (
    allianceId: number,
    body: ExtraRequestBody & { organizationId?: number }
  ): Promise<RequestRow> =>
    unwrap(
      await apiClient.post<Envelope<RequestRow>>(`${alliancePath(allianceId)}/requests`, body)
    ),

  // ---- workspace (the workspace is the X-Organization-Context) ----
  /** An old backend's answer (see isOldServerUsageAnswer) is `{ active: false }`, not an error. */
  getMyAiUsage: async (): Promise<WorkspaceUsage | BudgetsInactive> => {
    try {
      return unwrap(await apiClient.get<Envelope<WorkspaceUsage | BudgetsInactive>>(usagePath));
    } catch (error) {
      if (isOldServerUsageAnswer(error)) return { active: false };
      throw error;
    }
  },

  updateMyBudget: async (body: WorkspaceBudgetUpdate): Promise<WorkspaceUsage> =>
    unwrap(await apiClient.put<Envelope<WorkspaceUsage>>(usagePath, body)),

  requestMyExtra: async (body: ExtraRequestBody): Promise<RequestRow> =>
    unwrap(await apiClient.post<Envelope<RequestRow>>(`${usagePath}/requests`, body)),
};
