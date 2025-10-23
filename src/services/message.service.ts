import { apiClient } from '@/lib/api-client';
import { PAGINATION } from '@/lib/constants';
import type { Message, ApiResponse } from '@/types';

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

export const messageService = {
  getAll: async (
    filters?: Record<string, string>,
    page = PAGINATION.DEFAULT_PAGE,
    limit = PAGINATION.DEFAULT_LIMIT,
    sortOrder?: 'asc' | 'desc'
  ) => {
    const params = new URLSearchParams({
      ...filters,
      page: page.toString(),
      limit: limit.toString(),
    });

    if (sortOrder) {
      params.append('sortOrder', sortOrder);
    }

    const response = await apiClient.get<PaginatedResponse<Message[]>>(
      `/api/messages?${params.toString()}`
    );
    return response.data;
  },

  getById: async (id: number) => {
    const response = await apiClient.get<ApiResponse<Message>>(`/api/messages/${id}`);
    return response.data;
  },

  markAsProcessed: async (id: number, ticketId?: number) => {
    const response = await apiClient.post<ApiResponse<Message>>(
      `/api/messages/${id}/process`,
      ticketId ? { ticketId } : {}
    );
    return response.data;
  },

  markAsUnprocessed: async (id: number) => {
    const response = await apiClient.post<ApiResponse<Message>>(
      `/api/messages/${id}/unprocess`,
      {}
    );
    return response.data;
  },

  delete: async (id: number) => {
    const response = await apiClient.delete<ApiResponse<void>>(`/api/messages/${id}`);
    return response.data;
  },
};
