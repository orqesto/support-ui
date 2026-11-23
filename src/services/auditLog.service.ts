import { apiClient } from '@/lib/api-client';
import { endOfDayIso, startOfDayIso } from '@/lib/receivedRange';

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
  /** One action, or several separated by commas (the automatic replies view asks for two). */
  action?: string;
  /** Automatic replies only: `details.reason` / `details.channel`, exact (backend 2026-11-23). */
  reason?: string;
  channel?: string;
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

/** One row of the automatic replies' counts: what went out, what would have, what was held. */
export type AutoReplyTally = {
  sent: number;
  wouldSend: number;
  held: number;
  acknowledgments: number;
};
export type AutoReplyCounts = {
  range: { startDate: string; endDate: string };
  totals: AutoReplyTally;
  byChannel: Array<AutoReplyTally & { channel: string }>;
  heldByReason: Array<{ reason: string; count: number }>;
};

export const auditLogService = {
  /**
   * Automatic replies counted from their audit records: sent, would have been sent (check-only
   * mode), held — in all, by channel, and the holds by reason. No dates = the last 7 days; the
   * backend refuses a range over 92 days (400, its own sentence).
   */
  async getAutoReplyCounts(range?: {
    startDate?: string;
    endDate?: string;
  }): Promise<AutoReplyCounts> {
    const params = new URLSearchParams();
    if (range?.startDate)
      params.append('startDate', startOfDayIso(range.startDate) ?? range.startDate);
    if (range?.endDate) params.append('endDate', endOfDayIso(range.endDate) ?? range.endDate);
    const queryString = params.toString();
    const { data } = await apiClient.get<{ success: boolean; data: AutoReplyCounts }>(
      `/api/audit-logs/auto-replies/counts${queryString ? `?${queryString}` : ''}`
    );
    const tally = (row: Partial<AutoReplyTally> | undefined): AutoReplyTally => ({
      sent: row?.sent ?? 0,
      wouldSend: row?.wouldSend ?? 0,
      held: row?.held ?? 0,
      acknowledgments: row?.acknowledgments ?? 0,
    });
    return {
      range: data.data.range,
      totals: tally(data.data.totals),
      byChannel: (data.data.byChannel ?? []).map((row) => ({
        ...tally(row),
        channel: row.channel,
      })),
      heldByReason: data.data.heldByReason ?? [],
    };
  },

  async getAll(filters?: AuditLogFilters): Promise<AuditLogsResponse> {
    const params = new URLSearchParams();

    if (filters?.action) {
      params.append('action', filters.action);
    }
    if (filters?.entity) {
      params.append('entity', filters.entity);
    }
    if (filters?.reason) params.append('reason', filters.reason);
    if (filters?.channel) params.append('channel', filters.channel);
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
