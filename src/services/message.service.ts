import { apiClient } from '@/lib/api-client';
import type { Message, ApiResponse } from '@/types';

export const messageService = {
  getAll: async (filters?: Record<string, string>) => {
    const params = new URLSearchParams(filters);
    const response = await apiClient.get<ApiResponse<Message[]>>(
      `/api/messages?${params}`
    );
    return response.data;
  },

  getById: async (id: number) => {
    const response = await apiClient.get<ApiResponse<Message>>(`/api/messages/${id}`);
    return response.data;
  },

  markAsProcessed: async (id: number) => {
    const response = await apiClient.patch<ApiResponse<Message>>(
      `/api/messages/${id}/processed`
    );
    return response.data;
  },

  delete: async (id: number) => {
    const response = await apiClient.delete<ApiResponse<void>>(`/api/messages/${id}`);
    return response.data;
  },
};
