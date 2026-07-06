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

  /**
   * Promote a department to the org-level default (fallback). The BE clears the previous
   * default in the same transaction, so exactly one department stays default per org.
   */
  setDefault: async (id: number): Promise<Department> => {
    const response = await apiClient.patch<{ success: boolean; data: Department }>(
      `/api/departments/${id}`,
      { isDefault: true }
    );
    return response.data.data;
  },
};
