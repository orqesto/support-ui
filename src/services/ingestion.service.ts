import { apiClient } from '@/lib/api-client';
import type { ApiResponse } from '@/types';

export const ingestionService = {
  startAll: async () => {
    const response = await apiClient.post<ApiResponse<{ message: string }>>(
      '/api/ingestion/start-all'
    );
    return response.data;
  },

  startEmail: async () => {
    const response = await apiClient.post<ApiResponse<{ message: string }>>(
      '/api/ingestion/email/start'
    );
    return response.data;
  },

  checkEmails: async () => {
    const response = await apiClient.post<ApiResponse<{ message: string }>>(
      '/api/ingestion/email/check'
    );
    return response.data;
  },

  startTelegram: async () => {
    const response = await apiClient.post<ApiResponse<{ message: string }>>(
      '/api/ingestion/telegram/start'
    );
    return response.data;
  },
};
