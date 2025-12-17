import { apiClient } from '@/lib/api-client';
import type { PaginationMeta } from '@/types';

export type SpamLog = {
  id: number;
  organizationId: number;
  messageSourceId: number | null;
  messageSourceName: string | null;
  departmentRole: 'support' | 'sales' | 'billing' | 'general' | 'hr' | null;
  spamRuleId: number | null;
  ruleName: string;
  senderEmail: string;
  senderDomain: string;
  subject: string | null;
  contentSnippet: string | null;
  content: string | null;
  matchedPattern: string | null;
  redFlags: string[];
  greenFlags: string[];
  category: string;
  severity: number;
  confidence: number;
  channel: string;
  detectedAt: string;
};

export type SpamLogFilters = {
  channel?: 'email' | 'telegram' | 'slack';
  category?: string;
  departmentRole?: 'support' | 'sales' | 'billing' | 'general' | 'hr';
  messageSourceId?: number;
  senderDomain?: string;
  minSeverity?: number;
  maxSeverity?: number;
  days?: number;
  search?: string;
  sortOrder?: 'asc' | 'desc';
  sortConfidence?: 'asc' | 'desc';
  startDate?: string;
  endDate?: string;
  confidence?: number;
};

export type SpamLogStats = {
  totalSpam: number;
  byCategory: Record<string, number>;
  byChannel: Record<string, number>;
  byDepartment: Record<string, number>;
  topDomains: Array<{ domain: string; count: number }>;
  avgSeverity: number;
  avgConfidence: number;
};

type GetSpamLogsResponse = {
  success: boolean;
  data: SpamLog[];
  pagination: PaginationMeta;
  message?: string;
  error?: string;
};

type GetSpamLogResponse = {
  success: boolean;
  data: SpamLog;
  message?: string;
  error?: string;
};

type GetSpamStatsResponse = {
  success: boolean;
  data: SpamLogStats;
  message?: string;
  error?: string;
};

type CleanupResponse = {
  success: boolean;
  data: { deletedCount: number };
  message?: string;
  error?: string;
};

const getAll = async (
  filters: SpamLogFilters = {},
  page = 1,
  limit = 20
): Promise<GetSpamLogsResponse> => {
  const params = new URLSearchParams({
    page: page.toString(),
    limit: limit.toString(),
  });

  if (filters.channel) {
    params.append('channel', filters.channel);
  }

  if (filters.category) {
    params.append('category', filters.category);
  }

  if (filters.departmentRole) {
    params.append('departmentRole', filters.departmentRole);
  }

  if (filters.messageSourceId) {
    params.append('messageSourceId', filters.messageSourceId.toString());
  }

  if (filters.senderDomain) {
    params.append('senderDomain', filters.senderDomain);
  }

  if (filters.minSeverity !== undefined) {
    params.append('minSeverity', filters.minSeverity.toString());
  }

  if (filters.days) {
    params.append('days', filters.days.toString());
  }

  if (filters.search) {
    params.append('search', filters.search);
  }


  if (filters.confidence !== undefined) {
    params.append('confidence', filters.confidence.toString());
  }
  if (filters.sortOrder) {
    params.append('sortOrder', filters.sortOrder);
  }
  if (filters.sortConfidence) {
    params.append('sortConfidence', filters.sortConfidence);
  }

  console.log('📡 [spamLog.service] Sending API request with params:', Object.fromEntries(params));

  const response = await apiClient.get<GetSpamLogsResponse>(`/api/spam-logs?${params.toString()}`);
  return response.data;
};

const getById = async (id: number): Promise<GetSpamLogResponse> => {
  const response = await apiClient.get<GetSpamLogResponse>(`/api/spam-logs/${id}`);
  return response.data;
};

const getStats = async (days = 30): Promise<GetSpamStatsResponse> => {
  const response = await apiClient.get<GetSpamStatsResponse>(`/api/spam-logs/stats?days=${days}`);
  return response.data;
};

const cleanup = async (days = 90): Promise<CleanupResponse> => {
  const response = await apiClient.delete<CleanupResponse>(`/api/spam-logs/cleanup?days=${days}`);
  return response.data;
};

export const spamLogService = {
  getAll,
  getById,
  getStats,
  cleanup,
};
