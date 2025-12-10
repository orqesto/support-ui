// src/services/spamLog.service.ts
import { apiClient } from '@/lib/api-client';
import { PAGINATION } from '@/lib/constants';
import type { ApiResponse } from '@/types';

export type SpamLog = {
  id: number;
  organizationId: number;
  departmentRole?: string;
  spamRuleId?: number;
  ruleName?: string;
  senderEmail: string;          
  senderDomain?: string;
  subject?: string;
  contentSnippet?: string;     
  content: string;
  matchedPattern?: string;     
  redFlags?: string[];
  greenFlags?: string[];
  category: 'spam' | 'promotional' | 'transactional' | 'invalid_response' | 'other';
  severity: number;          
  confidence: number;          
  channel: string;
  detectedAt: string;           
  messageSourceId?: number;
  
 
  sender?: string;              
  flaggedAt?: string;           
  reason?: string;             
  status: 'pending' | 'confirmed' | 'false_positive' | 'whitelisted';
};

export type SpamLogFilters = {
  status?: 'pending' | 'confirmed' | 'false_positive' | 'whitelisted' | 'all';
  category?: 'spam' | 'promotional' | 'transactional' | 'invalid_response' | 'other' | 'all';
  minScore?: number;
  maxScore?: number;
  minConfidence?: number;
  maxConfidence?: number;
  reviewed?: boolean;
  startDate?: string;
  endDate?: string;
  search?: string;
  sortOrder?: 'asc' | 'desc';
  // optional sortBy field to indicate which property to sort on (e.g. 'detectedAt' or 'severity')
  sortBy?: string;
  channel?: string;
  sender?: string;
};

export type PaginationMeta = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
};

export type PaginatedResponse<T> = {
  success: boolean;
  data: T;
  pagination: PaginationMeta;
};

export const spamLogService = {
  getAll: async (
    filters?: SpamLogFilters,
    page = PAGINATION.DEFAULT_PAGE,
    limit = PAGINATION.DEFAULT_LIMIT,
    sortOrder?: 'asc' | 'desc'
  ) => {
    const params = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
    });

    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          params.append(key, String(value));
        }
      });
    }

    if (sortOrder) {
      params.append('sortOrder', sortOrder);
    }

    const url = `/api/spam-logs?${params.toString()}`;
    console.log('[SpamLogService] Requesting:', url);
    console.log('[SpamLogService] Search param:', filters?.search);

    const response = await apiClient.get<PaginatedResponse<SpamLog[]>>(url);
    console.log('[SpamLogService] Response:', response.data);
    return response.data;
  },

  getById: async (id: number) => {
    const response = await apiClient.get<ApiResponse<SpamLog>>(`/api/spam-logs/${id}`);
    return response.data;
  },

  getStats: async (filters?: { startDate?: string; endDate?: string; category?: string }) => {
    const params = new URLSearchParams();

    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value) {
          params.append(key, value);
        }
      });
    }

    const queryString = params.toString();
    const url = queryString 
      ? `/api/spam-logs/stats?${queryString}`
      : '/api/spam-logs/stats';

    const response = await apiClient.get<ApiResponse<Record<string, unknown>>>(url);
    return response.data;
  },

  cleanup: async (options: {
    olderThanDays?: number;
    maxEntries?: number;
    categories?: string[];
    keepReviewed?: boolean;
  }) => {
    const response = await apiClient.delete<ApiResponse<{ deletedCount: number }>>(
      '/api/spam-logs/cleanup',
      { data: options }
    );
    return response.data;
  },

  updateStatus: async (id: number, status: SpamLog['status'], notes?: string) => {
    const response = await apiClient.put<ApiResponse<SpamLog>>(
      `/api/spam-logs/${id}/status`,
      { status, notes }
    );
    return response.data;
  },

  delete: async (id: number) => {
    const response = await apiClient.delete<ApiResponse<{ deleted: boolean }>>(
      `/api/spam-logs/${id}`
    );
    return response.data;
  },
};