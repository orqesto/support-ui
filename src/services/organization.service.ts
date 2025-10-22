import { apiClient } from '@/lib/api-client';
import type { ApiResponse } from '@/types';

export type Organization = {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  settings: Record<string, unknown> | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type OrganizationMember = {
  id: number;
  userId: number;
  firstName: string;
  lastName: string;
  email: string;
  position: string | null;
  userRole: string;
  organizationRole: string;
  joinedAt: string;
};

export const organizationService = {
  getAll: async () => {
    const response = await apiClient.get<ApiResponse<Organization[]>>(
      '/api/organizations'
    );
    return response.data.data || [];
  },

  getCurrent: async () => {
    const response = await apiClient.get<ApiResponse<Organization>>(
      '/api/organizations/current'
    );
    return response.data.data!;
  },

  update: async (data: {
    name?: string;
    description?: string;
    active?: boolean;
  }) => {
    const response = await apiClient.patch<ApiResponse<Organization>>(
      '/api/organizations/current',
      data
    );
    return response.data.data!;
  },

  getMembers: async () => {
    const response = await apiClient.get<ApiResponse<OrganizationMember[]>>(
      '/api/organizations/members'
    );
    return response.data.data || [];
  },

  create: async (data: {
    name: string;
    slug: string;
    description?: string;
  }) => {
    const response = await apiClient.post<ApiResponse<Organization>>(
      '/api/organizations',
      data
    );
    return response.data.data;
  },

  updateById: async (id: number, data: {
    name?: string;
    description?: string;
    active?: boolean;
  }) => {
    const response = await apiClient.patch<ApiResponse<Organization>>(
      `/api/organizations/${id}`,
      data
    );
    return response.data.data!;
  },

  delete: async (id: number) => {
    const response = await apiClient.delete<ApiResponse<void>>(
      `/api/organizations/${id}`
    );
    return response.data;
  },
};
