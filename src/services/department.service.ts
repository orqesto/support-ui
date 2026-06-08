import { apiClient } from '@/lib/api-client';
import type { Department } from '@/types';

export type { Department };

export const departmentService = {
  getAll: async (): Promise<Department[]> => {
    const response = await apiClient.get<{ success: boolean; data: Department[] }>(
      '/api/departments'
    );
    return response.data.data;
  },
};
