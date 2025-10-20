import { apiClient } from '@/lib/api-client';

export type ServiceStatus = {
  status: 'active' | 'inactive' | 'error';
  message?: string;
  lastCheck?: string;
};

export type HealthResponse = {
  success: boolean;
  timestamp: string;
  services: {
    database: ServiceStatus;
    email: ServiceStatus;
    websocket: ServiceStatus;
    ai: ServiceStatus;
  };
};

export type ApiResponse<T> = {
  success: boolean;
  data?: T;
  error?: string;
};

export const healthService = {
  getStatus: async (): Promise<ApiResponse<HealthResponse>> => {
    const response = await apiClient.get<HealthResponse>('/api/health/status');
    return { success: true, data: response.data };
  },
};
