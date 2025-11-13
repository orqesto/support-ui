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

  reply: async (id: number, content: string, resolve = true) => {
    const response = await apiClient.post<ApiResponse<void>>(`/api/messages/${id}/reply`, {
      content,
      resolve,
    });
    return response.data;
  },

  resolve: async (id: number) => {
    const response = await apiClient.post<ApiResponse<void>>(`/api/messages/${id}/resolve`, {});
    return response.data;
  },

  reopen: async (id: number) => {
    const response = await apiClient.post<ApiResponse<void>>(`/api/messages/${id}/reopen`, {});
    return response.data;
  },

  getThreadMessages: async (id: number) => {
    const response = await apiClient.get<ApiResponse<Message[]>>(`/api/messages/${id}/thread`);
    return response.data;
  },

  getSimilarResolvedMessages: async (id: number, limit = 5, minSimilarity = 0.7) => {
    const params = new URLSearchParams({
      limit: limit.toString(),
      minSimilarity: minSimilarity.toString(),
    });
    const response = await apiClient.get<
      ApiResponse<
        Array<{
          messageId?: number;
          content: string;
          subject?: string | null;
          sender?: string;
          directReply: string;
          similarity: number;
          repliedAt?: string | null;
          repliedBy?: number | null;
          source: 'documentation' | 'message';
          documentationId?: number;
          documentTitle?: string;
          chunkId?: number;
          chunkIndex?: number;
          chunkMetadata?: { extractedText?: string; page?: number };
          references?: Array<{
            chunkId: number;
            chunkIndex: number;
            metadata: unknown;
          }>;
        }>
      >
    >(`/api/messages/${id}/similar-resolved?${params.toString()}`);
    return response.data;
  },

  reanalyze: async (id: number) => {
    const response = await apiClient.post<ApiResponse<void>>(`/api/messages/${id}/analyze`, {});
    return response.data;
  },
};
