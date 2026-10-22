import { apiClient } from '@/lib/api-client';
import { endOfDayIso, startOfDayIso } from '@/components/messages/filters/receivedRange';

export type AuditLog = {
  id: number;
  action: string;
  entity: string;
  entityId: string;
  details: Record<string, unknown> | null;
  createdAt: string;
  ipAddress: string | null;
  userAgent: string | null;
  userId: number | null;
  userEmail: string | null;
};

export type AuditLogFilters = {
  action?: string;
  entity?: string;
  userId?: number;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
};

export type AuditLogStats = {
  actionCounts: Array<{ action: string; count: number }>;
  entityCounts: Array<{ entity: string; count: number }>;
  userActivity: Array<{ userId: number | null; userEmail: string | null; count: number }>;
  period: string;
};

export type AuditLogsResponse = {
  logs: AuditLog[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

export const auditLogService = {
  async getAll(filters?: AuditLogFilters): Promise<AuditLogsResponse> {
    const params = new URLSearchParams();

    if (filters?.action) {
      params.append('action', filters.action);
    }
    if (filters?.entity) {
      params.append('entity', filters.entity);
    }
    if (filters?.userId) {
      params.append('userId', filters.userId.toString());
    }
    // The filter holds local days; the API gets their first and last INSTANT. A bare
    // `YYYY-MM-DD` was read as UTC midnight, so the "to" day itself was cut off.
    if (filters?.startDate) {
      params.append('startDate', startOfDayIso(filters.startDate) ?? filters.startDate);
    }
    if (filters?.endDate) {
      params.append('endDate', endOfDayIso(filters.endDate) ?? filters.endDate);
    }
    if (filters?.page) {
      params.append('page', filters.page.toString());
    }
    if (filters?.limit) {
      params.append('limit', filters.limit.toString());
    }

    const queryString = params.toString();
    const { data } = await apiClient.get<{ success: boolean; data: AuditLogsResponse }>(
      `/api/audit-logs${queryString ? `?${queryString}` : ''}`
    );
    return data.data;
  },

  async getStats(): Promise<AuditLogStats> {
    const { data } = await apiClient.get<{ success: boolean; data: AuditLogStats }>(
      '/api/audit-logs/stats'
    );
    return data.data;
  },
};
