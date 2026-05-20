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

const systemService = {
  /**
   * Stop all processing queues
   */
  stopQueues: async () => {
    const response = await apiClient.post<ApiResponse<QueueInfo>>('/api/system/stop-queues');
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
  deleteAllMessages: async (departmentRole?: string) => {
    const params = departmentRole ? { departmentRole } : {};
    const response = await apiClient.delete<ApiResponse<null>>('/api/system/messages', { params });
    return response.data;
  },

  /**
   * Delete all tickets for current organization (optionally filtered by department)
   */
  deleteAllTickets: async (departmentRole?: string) => {
    const params = departmentRole ? { departmentRole } : {};
    const response = await apiClient.delete<ApiResponse<null>>('/api/system/tickets', { params });
    return response.data;
  },

  /**
   * Delete all KB entries for current organization (optionally filtered by department)
   */
  deleteAllKB: async (departmentRole?: string) => {
    const params = departmentRole ? { departmentRole } : {};
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
    const response = await apiClient.delete<ApiResponse<{ deletedCount: number }>>('/api/spam-logs/cleanup', { params: { days } });
    return response.data;
  },
};

export default systemService;
