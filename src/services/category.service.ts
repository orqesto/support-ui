import { apiClient } from '@/lib/api-client';
import type { Category, ApiResponse } from '@/types';

export const categoryService = {
  getAll: async () => {
    const response = await apiClient.get<ApiResponse<Category[]>>('/api/settings/categories');
    return response.data;
  },

  getById: async (id: number) => {
    const response = await apiClient.get<ApiResponse<Category>>(`/api/settings/categories/${id}`);
    return response.data;
  },
};
