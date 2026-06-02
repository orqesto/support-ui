import { apiClient } from '@/lib/api-client';

export type Department = {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  color: string | null;
  active: boolean;
};

export const departmentService = {
  getAll: async (): Promise<Department[]> => {
    const response = await apiClient.get<{ success: boolean; data: Department[] }>(
      '/api/departments'
    );
    return response.data.data;
  },
};
