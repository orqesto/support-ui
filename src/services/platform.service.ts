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
  plans: {
    id: number;
    name: string;
    displayName: string;
    price: number;
    orgCount: number;
    /**
     * Optional on purpose: a BE that has not shipped this field yet omits it, and the
     * card must not start calling every plan inactive during that window. Absent is
     * read as active.
     */
    isActive?: boolean;
  }[];
};

// ─── Users (global directory) ────────────────────────────────────────────────

/** One workspace a directory row belongs to, with what the person holds there. */
export type PlatformUserWorkspace = {
  organizationId: number;
  organizationName: string;
  role: string;
  /** The direct role an IdP take-over is shadowing, if any. */
  preAllianceRole: string | null;
  /** This membership is owned by an IdP — the role is not editable in-app here. */
  idpManaged: boolean;
};

export type PlatformUserRow = {
  id: number;
  email: string;
  firstName: string;
  lastName: string | null;
  position: string | null;
  role: string;
  emailVerified: boolean;
  orgCount: number;
  /** ACTIVE memberships, named. Departments are not here — they are per-tenant data. */
  workspaces: PlatformUserWorkspace[];
  /** True when ANY membership of this account is IdP-owned. */
  idpManaged: boolean;
  createdAt: string;
  /** Suspension state — the list endpoint returns these, so the badge survives a refetch. */
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
    /** Absent on a backend older than support-service #675. */
    memoryMB?: { used: number; total: number; limitSource: 'cgroup' | 'host' } | null;
    process?: {
      rssMB: number;
      heapUsedMB: number;
      heapTotalMB: number;
      externalMB: number;
      arrayBuffersMB: number;
    } | null;
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

export type QueueFailureJobRef = { queue: string; id: string };

export type QueueFailureSample = {
  queue: string;
  id: string;
  name: string;
  failedReason: string | null;
  attemptsMade: number;
  organizationId: number | null;
  failedAt: number | null;
  enqueuedAt: number | null;
};

export type QueueFailureGroup = {
  reason: string;
  count: number;
  queues: Array<{ name: string; count: number }>;
  organizations: Array<{ id: number | null; count: number }>;
  firstFailedAt: number | null;
  lastFailedAt: number | null;
  sample: QueueFailureSample[];
  jobs: QueueFailureJobRef[];
};

export type QueueFailureAnalysis = {
  total: number;
  perQueue: number;
  truncatedQueues: string[];
  groups: QueueFailureGroup[];
};

export type QueueFailureActionResult = {
  requested: number;
  done: number;
  skipped: number;
  errors: number;
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

/**
 * POST /api/admin/plans response. `stripe` is present only when `createStripePrice` was
 * requested, and reports the outcome of that leg separately — the plan itself is created
 * whether or not Stripe answered, so the console can say "created, but not billable yet"
 * instead of implying either total success or total failure.
 */
export type CreatedPlan = AdminPlan & {
  stripe?: { linked: boolean; priceId?: string; error?: string };
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
  /** `null`/`''` unlinks the plan from Stripe. Verified against Stripe server-side. */
  stripePriceId?: string | null;
  /**
   * Required when changing `price` on a plan that IS linked to Stripe, otherwise the BE
   * refuses with 409. A Stripe Price is immutable, so re-pricing means minting a new one
   * and archiving the old — an explicit act, not a side effect of editing a number.
   */
  syncStripePrice?: boolean;
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
  /**
   * Build the Stripe Product + Price for this plan during creation, instead of pasting an
   * id from the Stripe dashboard. Ignored when `stripePriceId` is given, or when the plan
   * is free. Non-fatal server-side: the plan is created either way and the response says
   * whether the Stripe leg succeeded.
   */
  createStripePrice?: boolean;
};

// ─── Workspace departments (plan-budgeted lever) ─────────────────────────────
export type WorkspaceDepartmentCounts = {
  messageSources: number;
  users: number;
  openConversations: number;
  totalConversations: number;
};

export type WorkspaceDepartmentRow = {
  id: number;
  name: string;
  slug: string;
  active: boolean;
  isDefault: boolean;
  counts: WorkspaceDepartmentCounts;
};

export type WorkspaceDepartmentsView = {
  budget: { limit: number; activeCount: number };
  departments: WorkspaceDepartmentRow[];
};

export type DepartmentMergeCounts = {
  conversations: number;
  tickets: number;
  messageSources: number;
  messageSourceLinks: number;
  userMemberships: number;
  ticketingIntegrations: number;
};

export type DeactivateDepartmentResult = {
  departmentId: number;
  merged: boolean;
  mergedInto?: number;
  counts?: DepartmentMergeCounts;
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
    // FE/BE skew guard: `workspaces` and the IdP flags arrive with the take-over wave. A
    // console build that reaches prod first would otherwise read `.length` off undefined
    // and white-screen the whole directory.
    const rows = (res.data.data ?? []).map((row) => ({
      ...row,
      position: row.position ?? null,
      workspaces: row.workspaces ?? [],
      idpManaged: row.idpManaged ?? false,
    }));
    return { rows, pagination: res.data.pagination };
  },

  /**
   * One directory row by id (GET /api/admin/platform/users/:id, requireGlobalAdmin) — the
   * read behind the console user PAGE. The list hands its row to the page for an instant
   * first paint, but a refresh or a pasted link has no row to inherit, so the page must be
   * able to fetch the person itself. Built from the list's own query on the BE, so the two
   * cannot describe the same person differently.
   */
  getUser: async (id: number): Promise<PlatformUserRow> => {
    const res = await apiClient.get<{ data: PlatformUserRow }>(`${PLATFORM}/users/${id}`);
    const row = res.data.data;
    // Same skew guard as listUsers — an older backend omits these and `.length` on
    // undefined would white-screen the page.
    return {
      ...row,
      position: row.position ?? null,
      workspaces: row.workspaces ?? [],
      idpManaged: row.idpManaged ?? false,
    };
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
  createPlan: async (input: CreatePlanInput): Promise<CreatedPlan> => {
    const res = await apiClient.post<{ data: CreatedPlan }>(`${ADMIN}/plans`, input);
    return res.data.data;
  },

  /**
   * DELETE /api/admin/plans/:id. 409 when the plan has ever had a subscription (its
   * billing history depends on the row — deactivate instead) or when it is part of the
   * seeded catalog that every deploy recreates; 502 when its Stripe price could not be
   * archived. The message is written to be shown to the admin verbatim.
   */
  deletePlan: async (id: number): Promise<{ id: number; name: string }> => {
    const res = await apiClient.delete<{ data: { id: number; name: string } }>(
      `${ADMIN}/plans/${id}`
    );
    return res.data.data;
  },

  /** POST /api/admin/plans/:id/stripe-price — make a plan billable without leaving the console. */
  createPlanStripePrice: async (
    id: number
  ): Promise<{ plan: AdminPlan; archivedPriceId: string | null }> => {
    const res = await apiClient.post<{ data: { plan: AdminPlan; archivedPriceId: string | null } }>(
      `${ADMIN}/plans/${id}/stripe-price`,
      {}
    );
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

  getQueueFailureAnalysis: async (perQueue = 100): Promise<QueueFailureAnalysis> => {
    const res = await apiClient.get<{ data: QueueFailureAnalysis }>(
      `${ADMIN}/queues/failures?perQueue=${perQueue}`
    );
    return res.data.data;
  },

  retryFailedJobs: async (jobs: QueueFailureJobRef[]): Promise<QueueFailureActionResult> => {
    const res = await apiClient.post<{ data: QueueFailureActionResult }>(`${ADMIN}/queues/failures/retry`, {
      jobs,
    });
    return res.data.data;
  },

  removeFailedJobs: async (jobs: QueueFailureJobRef[]): Promise<QueueFailureActionResult> => {
    const res = await apiClient.post<{ data: QueueFailureActionResult }>(`${ADMIN}/queues/failures/remove`, {
      jobs,
    });
    return res.data.data;
  },

  getSyncCheckpoints: async (): Promise<SyncCheckpoint[]> => {
    const res = await apiClient.get<{ data: SyncCheckpoint[] }>(`${ADMIN}/sync-checkpoints`);
    return res.data.data;
  },

  clearSyncCheckpoints: async (): Promise<{ count: number }> => {
    const res = await apiClient.delete<{ count: number }>(`${ADMIN}/sync-checkpoints`);
    return { count: res.data?.count ?? 0 };
  },

  // ─── Workspace departments (plan-budgeted lever, global-admin only) ──────────
  /** List a workspace's departments with attachment counts + the plan budget. */
  listWorkspaceDepartments: async (orgId: number): Promise<WorkspaceDepartmentsView> => {
    const res = await apiClient.get<{ data: WorkspaceDepartmentsView }>(
      `${ADMIN}/organizations/${orgId}/departments`
    );
    return res.data.data;
  },

  /**
   * Activate a department. `override` lets a global admin activate beyond the plan
   * budget (the BE returns 403 when over budget without it). Returns the fresh view.
   */
  activateWorkspaceDepartment: async (
    orgId: number,
    departmentId: number,
    override = false
  ): Promise<WorkspaceDepartmentsView> => {
    const res = await apiClient.post<{ data: WorkspaceDepartmentsView }>(
      `${ADMIN}/organizations/${orgId}/departments/${departmentId}/activate${
        override ? '?override=true' : ''
      }`
    );
    return res.data.data;
  },

  /**
   * Deactivate a department. A non-empty department requires `targetDepartmentId` —
   * its conversations/sources/members reroute there before it is tombstoned (the BE
   * returns 400 if a non-empty dept is deactivated without a target). Returns the
   * fresh view plus what the deactivation did.
   */
  deactivateWorkspaceDepartment: async (
    orgId: number,
    departmentId: number,
    targetDepartmentId?: number
  ): Promise<WorkspaceDepartmentsView & { result: DeactivateDepartmentResult }> => {
    const res = await apiClient.post<{
      data: WorkspaceDepartmentsView & { result: DeactivateDepartmentResult };
    }>(`${ADMIN}/organizations/${orgId}/departments/${departmentId}/deactivate`, {
      ...(targetDepartmentId !== undefined ? { targetDepartmentId } : {}),
    });
    return res.data.data;
  },

};
