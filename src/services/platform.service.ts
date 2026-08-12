import { apiClient } from '@/lib/api-client';
import { buildAuditQueryParams, type AuditQueryFilters } from '@/services/auditQueryParams';

/**
 * Platform (global-admin) console service. Calls hit `/api/admin/platform/*` (the new
 * cross-org aggregation endpoints) plus a few existing global-admin `/api/admin/*` and
 * `/api/alliances` routes reused by the console. Under platform scope the api-client
 * suppresses X-Organization-Context (D-ADM-1); every endpoint authorizes on the
 * global-admin role, not a header. The BE wraps payloads as { success, data, pagination? }.
 */

// ─── Overview ──────────────────────────────────────────────────────────────
export type PlatformOverview = {
  counts: {
    alliances: number;
    organizations: number;
    activeOrganizations: number;
    users: number;
  };
  subscriptions: { status: string; count: number }[];
  plans: { id: number; name: string; displayName: string; price: number; orgCount: number }[];
};

// ─── Users (global directory) ────────────────────────────────────────────────
export type PlatformUserRow = {
  id: number;
  email: string;
  firstName: string;
  lastName: string | null;
  role: string;
  emailVerified: boolean;
  orgCount: number;
  createdAt: string;
  /**
   * Suspension state. NOTE: as of the wave-2 BE branch the users LIST endpoint does NOT
   * return these — they arrive only on the suspend/reactivate mutation responses — so a
   * suspended row's badge/Reactivate action won't persist across a refetch until the BE
   * list also selects them. Kept optional so the UI is correct-by-construction once it does.
   */
  disabledAt?: string | null;
  disabledReason?: string | null;
};

/** Response of the suspend/reactivate mutations (subset of the directory row). */
export type PlatformUserSuspension = {
  id: number;
  email: string;
  disabledAt: string | null;
  disabledReason: string | null;
};

// ─── Audit (platform-wide) ───────────────────────────────────────────────────
export type PlatformAuditRow = {
  id: number;
  action: string;
  entity: string;
  entityId: string;
  organizationId: number | null;
  organizationName: string | null;
  actorUserId: number | null;
  actorName: string | null;
  actorEmail: string | null;
  details: unknown;
  createdAt: string;
};

/** Top-level page metadata — lives at `.data.pagination`, alongside rows at `.data.data`. */
export type PlatformPagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
};

export type GlobalRole = 'admin' | 'user';

/** Shape returned by the role-update endpoint (subset of the directory row). */
export type PlatformUserRoleUpdate = { id: number; email: string; role: GlobalRole };

export type PlatformUsersResult = { rows: PlatformUserRow[]; pagination: PlatformPagination };
export type PlatformAuditResult = { rows: PlatformAuditRow[]; pagination: PlatformPagination };

export type ListUsersParams = {
  page: number;
  pageSize: number;
  search?: string;
  role?: 'admin' | 'user';
  verified?: 'verified' | 'unverified';
};
/** Audit list filters — server-side date range + actor-email + action + workspace. */
export type ListAuditParams = AuditQueryFilters;

// ─── System (existing global-admin ops surfaced under the console) ────────────
export type QueueStatus = {
  resources: {
    cpu: string;
    memory: string;
    status: string;
    throttling: boolean;
    throttleFactor: number;
  };
  scaling: unknown;
  workers: unknown;
  queues: { name: string; waiting: number; active: number; completed: number; failed: number; total: number }[];
};

export type QueueFailedJob = {
  id: string | null;
  name: string;
  failedReason: string | null;
  stacktrace: string[];
  attemptsMade: number;
  enqueuedAt: number | null;
  failedAt: number | null;
  organizationId: number | null;
};

export type SyncCheckpoint = {
  id: number;
  organizationId: number;
  channel: string;
  source: string;
  lastCheckpoint: string | null;
  createdAt: string;
  updatedAt: string;
};

// ─── Plans (global-admin plan catalog) ───────────────────────────────────────
export type PlanLimits = {
  maxUsers: number;
  maxMessagesPerMonth?: number | null;
  maxIntegrations: number;
  maxOrganizations?: number;
  maxAICallsPerMonth?: number;
};

/** A row from GET /api/admin/plans (the raw subscription_plans record). */
export type AdminPlan = {
  id: number;
  name: string;
  displayName: string;
  planType: string;
  price: number; // cents
  currency: string;
  billingInterval: string;
  isActive: boolean;
  stripePriceId: string | null;
  limits: PlanLimits;
};

/** Map of planId → active-workspace count, from GET /api/admin/plans/stats. */
export type PlanStats = Record<number, number>;

/** Editable subset accepted by PATCH /api/admin/plans/:id. */
export type UpdatePlanInput = {
  displayName?: string;
  price?: number; // cents
  limits?: {
    maxUsers?: number;
    maxMessagesPerMonth?: number;
    maxIntegrations?: number;
  };
};

export type PlanType = 'base' | 'bundle' | 'enterprise';

/**
 * Body accepted by POST /api/admin/plans (requireGlobalAdmin). `name` is the unique
 * slug (^[a-z0-9-]+$); a duplicate returns 409. `limits` and `features` are required
 * objects, but every key inside them is optional (an empty `features` is valid — a new
 * plan starts with no features). `currency`/`billingInterval` are omitted here and
 * default server-side to EUR / month.
 */
export type CreatePlanInput = {
  name: string;
  displayName: string;
  planType: PlanType;
  price: number; // cents
  stripePriceId?: string;
  limits: {
    maxUsers?: number;
    maxIntegrations?: number;
    maxMessagesPerMonth?: number;
  };
  features: Record<string, boolean>;
  isActive?: boolean;
};

const PLATFORM = '/api/admin/platform';
const ADMIN = '/api/admin';

export const platformService = {
  getOverview: async (): Promise<PlatformOverview> => {
    const res = await apiClient.get<{ data: PlatformOverview }>(`${PLATFORM}/overview`);
    return res.data.data;
  },

  listUsers: async (params: ListUsersParams): Promise<PlatformUsersResult> => {
    const res = await apiClient.get<{ data: PlatformUserRow[]; pagination: PlatformPagination }>(
      `${PLATFORM}/users`,
      {
        params: {
          page: params.page,
          pageSize: params.pageSize,
          ...(params.search ? { search: params.search } : {}),
          ...(params.role ? { role: params.role } : {}),
          ...(params.verified ? { verified: params.verified } : {}),
        },
      }
    );
    return { rows: res.data.data, pagination: res.data.pagination };
  },

  /** Set a user's global role (PATCH /api/admin/platform/users/:id/role, requireGlobalAdmin). */
  updateUserRole: async (id: number, role: GlobalRole): Promise<PlatformUserRoleUpdate> => {
    const res = await apiClient.patch<{ data: PlatformUserRoleUpdate }>(
      `${PLATFORM}/users/${id}/role`,
      { role }
    );
    return res.data.data;
  },

  /**
   * Suspend a user (POST .../users/:id/suspend, requireGlobalAdmin). Optional reason
   * (≤500 chars). Revokes their sessions. The BE rejects self-suspend (403).
   */
  suspendUser: async (id: number, reason?: string): Promise<PlatformUserSuspension> => {
    const trimmed = reason?.trim();
    const res = await apiClient.post<{ data: PlatformUserSuspension }>(
      `${PLATFORM}/users/${id}/suspend`,
      trimmed ? { reason: trimmed } : {}
    );
    return res.data.data;
  },

  /** Reactivate a suspended user (POST .../users/:id/reactivate, requireGlobalAdmin). */
  reactivateUser: async (id: number): Promise<PlatformUserSuspension> => {
    const res = await apiClient.post<{ data: PlatformUserSuspension }>(
      `${PLATFORM}/users/${id}/reactivate`,
      {}
    );
    return res.data.data;
  },

  listAudit: async (params: ListAuditParams): Promise<PlatformAuditResult> => {
    const res = await apiClient.get<{ data: PlatformAuditRow[]; pagination: PlatformPagination }>(
      `${PLATFORM}/audit`,
      { params: buildAuditQueryParams(params) }
    );
    return { rows: res.data.data, pagination: res.data.pagination };
  },

  /** Distinct audit action names (GET .../audit/actions, requireGlobalAdmin) → sorted string[]. */
  listAuditActions: async (): Promise<string[]> => {
    const res = await apiClient.get<{ data: string[] }>(`${PLATFORM}/audit/actions`);
    return res.data.data ?? [];
  },

  /** Create a new alliance (POST /api/alliances, requireGlobalAdmin). */
  createAlliance: async (input: { name: string; slug: string }): Promise<{ id: number }> => {
    const res = await apiClient.post<{ data: { id: number } }>('/api/alliances', input);
    return res.data.data;
  },

  // ─── Plans (global-admin plan catalog) ──────────────────────────────────────
  /** All plans incl. inactive (GET /api/admin/plans, requireGlobalAdmin). */
  getPlans: async (): Promise<AdminPlan[]> => {
    const res = await apiClient.get<{ data: AdminPlan[] }>(`${ADMIN}/plans`);
    return res.data.data ?? [];
  },

  /** Active-workspace count per plan id (GET /api/admin/plans/stats, requireGlobalAdmin). */
  getPlanStats: async (): Promise<PlanStats> => {
    const res = await apiClient.get<{ data: PlanStats }>(`${ADMIN}/plans/stats`);
    return res.data.data ?? {};
  },

  /** Flip a plan's active flag (PATCH /api/admin/plans/:id/toggle, requireGlobalAdmin). */
  togglePlan: async (id: number): Promise<{ id: number; isActive: boolean }> => {
    const res = await apiClient.patch<{ data: { id: number; isActive: boolean } }>(
      `${ADMIN}/plans/${id}/toggle`,
      {}
    );
    return res.data.data;
  },

  /** Edit a plan's displayName/price/limits (PATCH /api/admin/plans/:id, requireGlobalAdmin). */
  updatePlan: async (id: number, input: UpdatePlanInput): Promise<AdminPlan> => {
    const res = await apiClient.patch<{ data: AdminPlan }>(`${ADMIN}/plans/${id}`, input);
    return res.data.data;
  },

  /** Create a new plan (POST /api/admin/plans, requireGlobalAdmin). 409 on duplicate name. */
  createPlan: async (input: CreatePlanInput): Promise<AdminPlan> => {
    const res = await apiClient.post<{ data: AdminPlan }>(`${ADMIN}/plans`, input);
    return res.data.data;
  },

  // ─── System ops ─────────────────────────────────────────────────────────────
  getQueueStatus: async (): Promise<QueueStatus> => {
    const res = await apiClient.get<{ data: QueueStatus }>(`${ADMIN}/queue-status`);
    return res.data.data;
  },

  getQueueFailedJobs: async (name: string, limit = 20): Promise<QueueFailedJob[]> => {
    const res = await apiClient.get<{ data: { failed: QueueFailedJob[] } }>(
      `${ADMIN}/queues/${encodeURIComponent(name)}/failed?limit=${limit}`
    );
    return res.data.data.failed;
  },

  getSyncCheckpoints: async (): Promise<SyncCheckpoint[]> => {
    const res = await apiClient.get<{ data: SyncCheckpoint[] }>(`${ADMIN}/sync-checkpoints`);
    return res.data.data;
  },

  clearSyncCheckpoints: async (): Promise<{ count: number }> => {
    const res = await apiClient.delete<{ count: number }>(`${ADMIN}/sync-checkpoints`);
    return { count: res.data?.count ?? 0 };
  },

};
