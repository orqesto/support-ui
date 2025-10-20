import { apiClient } from '@/lib/api-client';
import { PAGINATION } from '@/lib/constants';
import type {
  Ticket,
  CreateTicketRequest,
  UpdateTicketRequest,
  ApiResponse,
} from '@/types';

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

export const ticketService = {
  getAll: async (
    filters?: Record<string, string>, 
    page = PAGINATION.DEFAULT_PAGE, 
    limit = PAGINATION.DEFAULT_LIMIT,
    sortBy?: 'createdAt' | 'updatedAt',
    sortOrder?: 'asc' | 'desc'
  ) => {
    const params = new URLSearchParams({
      ...filters,
      page: page.toString(),
      limit: limit.toString(),
    });
    
    if (sortBy) {
      params.append('sortBy', sortBy);
    }
    if (sortOrder) {
      params.append('sortOrder', sortOrder);
    }
    
    const response = await apiClient.get<PaginatedResponse<Ticket[]>>(
      `/api/tickets?${params}`
    );
    return response.data;
  },

  getById: async (id: number) => {
    const response = await apiClient.get<ApiResponse<Ticket>>(`/api/tickets/${id}`);
    return response.data;
  },

  create: async (data: CreateTicketRequest) => {
    const response = await apiClient.post<ApiResponse<Ticket>>('/api/tickets', data);
    return response.data;
  },

  update: async (id: number, data: UpdateTicketRequest) => {
    const response = await apiClient.put<ApiResponse<Ticket>>(
      `/api/tickets/${id}`,
      data
    );
    return response.data;
  },

  pushToJira: async (id: number, integrationId?: number) => {
    const url = integrationId 
      ? `/api/tickets/${id}/jira?integrationId=${integrationId}`
      : `/api/tickets/${id}/jira`;
    const response = await apiClient.post<ApiResponse<{ jiraKey: string; jiraUrl: string }>>(url);
    return response.data;
  },

  syncAllToJira: async (integrationId?: number) => {
    const url = integrationId
      ? `/api/tickets/sync/jira?integrationId=${integrationId}`
      : '/api/tickets/sync/jira';
    const response = await apiClient.post<ApiResponse<{
      synced: number;
      failed: number;
      total: number;
    }>>(url);
    return response.data;
  },

  delete: async (id: number) => {
    const response = await apiClient.delete<ApiResponse<void>>(`/api/tickets/${id}`);
    return response.data;
  },
};
