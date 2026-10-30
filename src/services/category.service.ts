import { apiClient } from '@/lib/api-client';
import { scopedLookup } from '@/lib/scopedLookup';
import type { Category, ApiResponse } from '@/types';

export const categoryService = {
  // Shared for a minute per scope; a write under /api/settings/categories clears it.
  getAll: async () =>
    scopedLookup('categories', async () => {
      const response = await apiClient.get<ApiResponse<Category[]>>('/api/settings/categories');
      return response.data;
    }),

  getById: async (id: number) => {
    const response = await apiClient.get<ApiResponse<Category>>(`/api/settings/categories/${id}`);
    return response.data;
  },
};
