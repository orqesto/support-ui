import { apiClient } from '@/lib/api-client';
import type { User, PaginationMeta } from '@/types';

export const userService = {
  // Get all users
  getAll: async (search?: string, page: number = 1, limit: number = 10): Promise<{ data: User[]; pagination: PaginationMeta }> => {
    const params = new URLSearchParams();
    if (search && search.trim()) {
      params.append('search', search.trim());
    }
    params.append('page', page.toString());
    params.append('limit', limit.toString());
    
    const response = await apiClient.get(`/api/users?${params}`);
    return {
      data: response.data.data || [],
      pagination: response.data.pagination || {
        page,
        limit,
        total: 0,
        totalPages: 0,
        hasMore: false,
      },
    };
  },

  // Get user by ID
  getById: async (id: number): Promise<User> => {
    const response = await apiClient.get(`/api/users/${id}`);
    return response.data;
  },

  // Get current user
  getCurrentUser: async (): Promise<User> => {
    const response = await apiClient.get('/api/users/me');
    return response.data;
  },

  // Update user
  update: async (id: number, data: Partial<User>): Promise<User> => {
    const response = await apiClient.put(`/api/users/${id}`, data);
    return response.data;
  },

  // Delete user
  delete: async (id: number): Promise<void> => {
    await apiClient.delete(`/api/users/${id}`);
  },
};
