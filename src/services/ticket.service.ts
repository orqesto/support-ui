import { apiClient } from '@/lib/api-client';
import { PAGINATION } from '@/lib/constants';
import type { Ticket, CreateTicketRequest, UpdateTicketRequest, ApiResponse } from '@/types';

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

export type TicketsMetadata = {
  total: number;
  totalPages: number;
  limit: number;
  open: number;
  resolved: number;
  inProgress: number;
};

export type MetadataResponse = {
  success: boolean;
  data: TicketsMetadata;
};

export const ticketService = {
  // Get metadata only (counts, no data) - for lazy pagination
  getMetadata: async (filters?: Record<string, string>, limit = PAGINATION.DEFAULT_LIMIT) => {
    const params = new URLSearchParams({
      ...Object.fromEntries(Object.entries(filters ?? {}).filter(([, v]) => v != null)),
      limit: limit.toString(),
    });

    const response = await apiClient.get<MetadataResponse>(
      `/api/tickets/metadata?${params.toString()}`
    );
    return response.data;
  },

  getAll: async (
    filters?: Record<string, string>,
    page = PAGINATION.DEFAULT_PAGE,
    limit = PAGINATION.DEFAULT_LIMIT,
    sortBy?: 'createdAt' | 'updatedAt' | 'priority',
    sortOrder?: 'asc' | 'desc'
  ) => {
    const params = new URLSearchParams({
      ...Object.fromEntries(Object.entries(filters ?? {}).filter(([, v]) => v != null)),
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
      `/api/tickets?${params.toString()}`
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

  createWithAttachments: async (data: CreateTicketRequest, files: File[] = []) => {
    // If no files, use regular JSON POST
    if (!files || files.length === 0) {
      const response = await apiClient.post<ApiResponse<Ticket>>('/api/tickets', data);
      return response.data;
    }

    // With files, use FormData
    const formData = new FormData();

    // Append all ticket data as JSON string
    Object.entries(data).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        formData.append(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
      }
    });

    // Append files
    files.forEach((file) => {
      formData.append('attachments', file);
    });

    const response = await apiClient.post<ApiResponse<Ticket>>('/api/tickets', formData);
    return response.data;
  },

  update: async (id: number, data: UpdateTicketRequest) => {
    const response = await apiClient.put<ApiResponse<Ticket>>(`/api/tickets/${id}`, data);
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
    const response = await apiClient.post<
      ApiResponse<{
        synced: number;
        failed: number;
        total: number;
      }>
    >(url);
    return response.data;
  },

  delete: async (id: number) => {
    const response = await apiClient.delete<ApiResponse<void>>(`/api/tickets/${id}`);
    return response.data;
  },

  convertBotConversation: async (id: number) => {
    const response = await apiClient.post<
      ApiResponse<{ converted: number; skipped: number }>
    >(`/api/tickets/${id}/convert-bot-conversation`);
    return response.data;
  },

  getSimilar: async (id: number, params?: { limit?: number; minSimilarity?: number }) => {
    const queryParams = new URLSearchParams();
    if (params?.limit) {
      queryParams.append('limit', params.limit.toString());
    }
    if (params?.minSimilarity) {
      queryParams.append('minSimilarity', params.minSimilarity.toString());
    }

    const url = queryParams.toString()
      ? `/api/tickets/${id}/similar?${queryParams.toString()}`
      : `/api/tickets/${id}/similar`;

    const response = await apiClient.get<
      ApiResponse<
        Array<{
          ticketId: number;
          messageId: number;
          messageContent: string;
          messageSubject: string | null;
          similarity: number;
          ticketStatus: string;
          ticketTitle: string;
          responses: Array<{
            id: number;
            content: string;
            channel: string;
            sentAt: string | null;
          }>;
        }>
      >
    >(url);
    return response.data;
  },
};
