import type { AxiosResponse } from 'axios';
import { apiClient } from '@/lib/api-client';
import type { User, PaginationMeta, ApiResponse } from '@/types';

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

    const response: AxiosResponse<ApiResponse<{ users: User[]; pagination: PaginationMeta }>> = await apiClient.get(
      `/api/users?${params.toString()}`
    );
    return {
      data: response.data.data?.users ?? [],
      pagination: response.data.data?.pagination ?? {
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

  // Update current user (self)
  updateSelf: async (data: { signature?: string | null }): Promise<User> => {
    const authStore = (await import('@/stores/authStore')).useAuthStore.getState();
    const userId = authStore.user?.id;
    if (!userId) throw new Error('Not authenticated');
    const response: AxiosResponse<ApiResponse<User>> = await apiClient.put(`/api/users/${userId}`, data);
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

  // Skill values (structured key→value routing skills) — admin access by user ID
  getSkillValues: async (userId: number): Promise<Record<string, string[]>> => {
    const response: AxiosResponse<ApiResponse<Record<string, string[]>>> = await apiClient.get(`/api/users/${userId}/skill-values`);
    return response.data.data ?? {};
  },

  setSkillValues: async (userId: number, key: string, values: string[]): Promise<void> => {
    await apiClient.put(`/api/users/${userId}/skill-values/${encodeURIComponent(key)}`, { values });
  },

  deleteSkillKey: async (userId: number, key: string): Promise<void> => {
    await apiClient.delete(`/api/users/${userId}/skill-values/${encodeURIComponent(key)}`);
  },

  getCanEditSkills: async (userId: number): Promise<boolean> => {
    const response: AxiosResponse<ApiResponse<{ canEditSkills: boolean }>> = await apiClient.get(`/api/users/${userId}/can-edit-skills`);
    return response.data.data?.canEditSkills ?? false;
  },

  setCanEditSkills: async (userId: number, canEditSkills: boolean): Promise<void> => {
    await apiClient.patch(`/api/users/${userId}/can-edit-skills`, { canEditSkills });
  },

  // Self-access skill routes — no elevated permission required
  getSelfSkillValues: async (): Promise<Record<string, string[]>> => {
    const response: AxiosResponse<ApiResponse<Record<string, string[]>>> = await apiClient.get('/api/users/me/skill-values');
    return response.data.data ?? {};
  },

  setSelfSkillValues: async (key: string, values: string[]): Promise<void> => {
    await apiClient.put(`/api/users/me/skill-values/${encodeURIComponent(key)}`, { values });
  },

  deleteSelfSkillKey: async (key: string): Promise<void> => {
    await apiClient.delete(`/api/users/me/skill-values/${encodeURIComponent(key)}`);
  },

  getSelfCanEditSkills: async (): Promise<boolean> => {
    const response: AxiosResponse<ApiResponse<{ canEditSkills: boolean }>> = await apiClient.get('/api/users/me/can-edit-skills');
    return response.data.data?.canEditSkills ?? false;
  },

  // Create user directly (admin only)
  create: async (data: {
    email: string;
    password: string;
    firstName: string;
    lastName?: string;
    position?: string;
    role?: 'admin' | 'user';
    organizationRole?: 'org_admin' | 'moderator' | 'support' | 'associate';
    departmentRole?: 'support' | 'sales' | 'billing' | 'general' | 'hr';
  }): Promise<User> => {
    const response: AxiosResponse<ApiResponse<User>> = await apiClient.post('/api/users', data);
    return response.data.data as User;
  },
};
