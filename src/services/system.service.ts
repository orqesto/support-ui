import { apiClient } from '@/lib/api-client';

type ApiResponse<T> = {
  success: boolean;
  data?: T;
  message?: string;
};

type QueueInfo = {
  queues: string[];
  count: number;
};

type CleanupResponse = {
  deletedRecords?: number;
  deletedFiles?: number;
  clearedKeys?: number;
};

/** One membership a global admin holds in a customer workspace — the invariant violation. */
export type StrayAdminMembership = {
  membershipId: number;
  userId: number;
  userEmail: string;
  organizationId: number;
  organizationName: string;
  active: boolean;
};

export type GlobalAdminMembershipCleanup = {
  memberships: StrayAdminMembership[];
  found: number;
  removed: number;
  applied: boolean;
  note?: string;
};

const systemService = {
  /**
   * Global admins holding memberships in customer workspaces — the platform invariant that a
   * global admin belongs only to the internal system org. Read-only.
   */
  listGlobalAdminMemberships: async (organizationId?: number) => {
    const response = await apiClient.get<
      ApiResponse<{ memberships: StrayAdminMembership[]; total: number }>
    >('/api/system/global-admin-memberships', {
      ...(organizationId ? { params: { organizationId } } : {}),
    });
    return response.data;
  },

  /**
   * Remove them. ⛔ DRY-RUN unless `apply` is true — the backend requires exactly boolean
   * true, and this deletes rows across organisations.
   */
  cleanupGlobalAdminMemberships: async (apply: boolean, organizationId?: number) => {
    const response = await apiClient.post<ApiResponse<GlobalAdminMembershipCleanup>>(
      '/api/system/cleanup-global-admin-memberships',
      { apply, ...(organizationId ? { organizationId } : {}) }
    );
    return response.data;
  },

  /**
   * Stop all processing queues
   */
  stopQueues: async () => {
    const response = await apiClient.post<ApiResponse<QueueInfo>>('/api/system/stop-queues');
    return response.data;
  },

  /**
   * Resume all processing queues.
   *
   * The undo for stopQueues. BullMQ persists the paused flag in Redis, so a
   * stopped queue stays stopped across restarts and releases — without this the
   * Stop control is a one-way door that only redis-cli on the host can reopen.
   */
  startQueues: async () => {
    const response = await apiClient.post<ApiResponse<QueueInfo>>('/api/system/start-queues');
    return response.data;
  },

  /**
   * Clear all Redis queues
   */
  clearQueues: async () => {
    const response = await apiClient.delete<ApiResponse<CleanupResponse>>('/api/system/queues');
    return response.data;
  },

  /**
   * Delete all messages for current organization (optionally filtered by department)
   */
  deleteAllMessages: async (departmentSlug?: string) => {
    const params = departmentSlug ? { departmentSlug } : {};
    const response = await apiClient.delete<ApiResponse<null>>('/api/system/messages', { params });
    return response.data;
  },

  /**
   * Delete all tickets for current organization (optionally filtered by department)
   */
  deleteAllTickets: async (departmentSlug?: string) => {
    const params = departmentSlug ? { departmentSlug } : {};
    const response = await apiClient.delete<ApiResponse<null>>('/api/system/tickets', { params });
    return response.data;
  },

  /**
   * Delete all KB entries for current organization (optionally filtered by department)
   */
  deleteAllKB: async (departmentSlug?: string) => {
    const params = departmentSlug ? { departmentSlug } : {};
    const response = await apiClient.delete<ApiResponse<null>>('/api/system/knowledge-base', {
      params,
    });
    return response.data;
  },

  /**
   * Delete all attachments for current organization
   */
  deleteAllAttachments: async () => {
    const response =
      await apiClient.delete<ApiResponse<CleanupResponse>>('/api/system/attachments');
    return response.data;
  },

  /**
   * Nuclear cleanup - delete EVERYTHING for current organization
   * Requires confirmation string "DELETE EVERYTHING"
   */
  nuclearCleanup: async (confirmation: string) => {
    const response = await apiClient.delete<ApiResponse<null>>('/api/system/nuclear', {
      data: { confirmation },
    });
    return response.data;
  },

  cleanupSpamLog: async (days = 90) => {
    const response = await apiClient.delete<ApiResponse<{ deletedCount: number }>>(
      '/api/spam-logs/cleanup',
      { params: { days } }
    );
    return response.data;
  },
};

export default systemService;
