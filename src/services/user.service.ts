import { apiClient } from '@/lib/api-client';
import type { User } from '@/types';

export const userService = {
  // Get all users
  getAll: async (): Promise<User[]> => {
    const response = await apiClient.get('/api/users');
    return response.data.data || response.data; // Handle both {data: [...]} and direct array
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
