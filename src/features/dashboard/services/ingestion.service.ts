import { apiClient } from '@/lib/api-client';
import type { TelegramStartReport } from './telegramStartNotice';
import type { ApiResponse } from '@/types';

/** `/start-all` adds each service's outcome; `telegram.report` = the workspace's bots. */
export type StartAllResponse = ApiResponse<{ message: string }> & {
  details?: { telegram?: { success: boolean; message: string; report?: TelegramStartReport } };
};

/** `/telegram/start` reports the workspace's bots in `telegram`. */
export type StartTelegramResponse = ApiResponse<{ message: string }> & {
  telegram?: TelegramStartReport;
};

export const ingestionService = {
  startAll: async () => {
    const response = await apiClient.post<StartAllResponse>('/api/ingestion/start-all');
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
    const response = await apiClient.post<StartTelegramResponse>('/api/ingestion/telegram/start');
    return response.data;
  },
};
