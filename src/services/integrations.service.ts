import { apiClient } from '@/lib/api-client';

export type Integration = {
  id: number;
  name: string;
  type: string;
  enabled: boolean;
  config: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  hasCredentials?: boolean;
  lastSync?: string;
  createdAt: string;
  updatedAt: string;
};

export type ApiResponse<T> = {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
};

export const integrationsService = {
  getAll: async (): Promise<ApiResponse<Integration[]>> => {
    const response = await apiClient.get<{ success: boolean; data: Integration[] }>('/api/integrations');
    return { success: response.data.success, data: response.data.data };
  },

  getById: async (id: number): Promise<ApiResponse<Integration>> => {
    const response = await apiClient.get<{ success: boolean; data: Integration }>(`/api/integrations/${id}`);
    return { success: response.data.success, data: response.data.data };
  },

  upsert: async (data: {
    name: string;
    type: string;
    enabled: boolean;
    config: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  }): Promise<ApiResponse<Integration>> => {
    const response = await apiClient.post<{ success: boolean; data: Integration }>('/api/integrations', data);
    return { success: response.data.success, data: response.data.data };
  },

  delete: async (id: number): Promise<ApiResponse<void>> => {
    const response = await apiClient.delete<{ success: boolean; message: string }>(`/api/integrations/${id}`);
    return { success: response.data.success, message: response.data.message };
  },

  test: async (id: number): Promise<ApiResponse<void>> => {
    const response = await apiClient.post<{ success: boolean; message: string }>(`/api/integrations/${id}/test`);
    return { success: response.data.success, message: response.data.message };
  },
};
