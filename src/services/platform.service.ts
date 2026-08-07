import { apiClient } from '@/lib/api-client';

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

export type PlatformUsersResult = { rows: PlatformUserRow[]; pagination: PlatformPagination };
export type PlatformAuditResult = { rows: PlatformAuditRow[]; pagination: PlatformPagination };

export type ListUsersParams = { page: number; pageSize: number; search?: string };
export type ListAuditParams = {
  page: number;
  pageSize: number;
  action?: string;
  organizationId?: number;
};

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

export type SyncCheckpoint = {
  id: number;
  organizationId: number;
  channel: string;
  source: string;
  lastCheckpoint: string | null;
  createdAt: string;
  updatedAt: string;
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
        },
      }
    );
    return { rows: res.data.data, pagination: res.data.pagination };
  },

  listAudit: async (params: ListAuditParams): Promise<PlatformAuditResult> => {
    const res = await apiClient.get<{ data: PlatformAuditRow[]; pagination: PlatformPagination }>(
      `${PLATFORM}/audit`,
      {
        params: {
          page: params.page,
          pageSize: params.pageSize,
          ...(params.action ? { action: params.action } : {}),
          ...(params.organizationId ? { organizationId: params.organizationId } : {}),
        },
      }
    );
    return { rows: res.data.data, pagination: res.data.pagination };
  },

  /** Create a new alliance (POST /api/alliances, requireGlobalAdmin). */
  createAlliance: async (input: { name: string; slug: string }): Promise<{ id: number }> => {
    const res = await apiClient.post<{ data: { id: number } }>('/api/alliances', input);
    return res.data.data;
  },

  // ─── System ops ─────────────────────────────────────────────────────────────
  getQueueStatus: async (): Promise<QueueStatus> => {
    const res = await apiClient.get<{ data: QueueStatus }>(`${ADMIN}/queue-status`);
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

  migrateAllStorage: async (): Promise<{ message: string }> => {
    const res = await apiClient.post<{ message?: string }>(`${ADMIN}/storage/migrate-all`, {});
    return { message: res.data?.message ?? 'Storage migration started' };
  },
};
