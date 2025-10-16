import { apiClient } from '@/lib/api-client';
import type {
  Ticket,
  CreateTicketRequest,
  UpdateTicketRequest,
  ApiResponse,
} from '@/types';

export const ticketService = {
  getAll: async (filters?: Record<string, string>) => {
    const params = new URLSearchParams(filters);
    const response = await apiClient.get<ApiResponse<Ticket[]>>(
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

  pushToJira: async (id: number) => {
    const response = await apiClient.post<ApiResponse<{ jiraKey: string; jiraUrl: string }>>(
      `/api/tickets/${id}/jira`
    );
    return response.data;
  },

  syncAllToJira: async () => {
    const response = await apiClient.post<ApiResponse<{
      synced: number;
      failed: number;
      total: number;
    }>>('/api/tickets/sync/jira');
    return response.data;
  },

  delete: async (id: number) => {
    const response = await apiClient.delete<ApiResponse<void>>(`/api/tickets/${id}`);
    return response.data;
  },
};
