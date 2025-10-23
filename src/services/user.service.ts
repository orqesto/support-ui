import type { AxiosResponse } from 'axios';
import { apiClient } from '@/lib/api-client';
import type { User, PaginationMeta, ApiResponse } from '@/types';

type UsersListResponse = ApiResponse<User[]> & { pagination: PaginationMeta };

export const userService = {
  // Get all users
  getAll: async (
    search?: string,
    page: number = 1,
    limit: number = 10
  ): Promise<{ data: User[]; pagination: PaginationMeta }> => {
    const params = new URLSearchParams();
    if (search?.trim()) {
      params.append('search', search.trim());
    }
    params.append('page', page.toString());
    params.append('limit', limit.toString());

    const response: AxiosResponse<UsersListResponse> = await apiClient.get(
      `/api/users?${params.toString()}`
    );
    return {
      data: response.data.data ?? [],
      pagination: response.data.pagination ?? {
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
    const response: AxiosResponse<ApiResponse<User>> = await apiClient.get(`/api/users/${id}`);
    return response.data.data as User;
  },

  // Get current user
  getCurrentUser: async (): Promise<User> => {
    const response: AxiosResponse<ApiResponse<User>> = await apiClient.get('/api/users/me');
    return response.data.data as User;
  },

  // Update user
  update: async (id: number, data: Partial<User>): Promise<User> => {
    const response: AxiosResponse<ApiResponse<User>> = await apiClient.put(`/api/users/${id}`, data);
    return response.data.data as User;
  },

  // Delete user
  delete: async (id: number): Promise<void> => {
    await apiClient.delete(`/api/users/${id}`);
  },
};
