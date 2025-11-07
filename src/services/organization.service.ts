import { apiClient } from '@/lib/api-client';
import type { ApiResponse, PaginationMeta } from '@/types';

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
  getAll: async (search?: string, page: number = 1, limit: number = 10) => {
    const params = new URLSearchParams();
    if (search?.trim()) {
      params.append('search', search.trim());
    }
    params.append('page', page.toString());
    params.append('limit', limit.toString());

    const response = await apiClient.get<
      ApiResponse<Organization[]> & { pagination: PaginationMeta }
    >(`/api/organizations?${params.toString()}`);
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

  getCurrent: async () => {
    const response = await apiClient.get<ApiResponse<Organization>>('/api/organizations/current');
    if (!response.data.data) {
      throw new Error('Organization data not found');
    }
    return response.data.data;
  },

  update: async (data: { name?: string; description?: string; active?: boolean }) => {
    const response = await apiClient.patch<ApiResponse<Organization>>(
      '/api/organizations/current',
      data
    );
    if (!response.data.data) {
      throw new Error('Organization data not found');
    }
    return response.data.data;
  },

  getMembers: async () => {
    const response = await apiClient.get<ApiResponse<OrganizationMember[]>>(
      '/api/organizations/members'
    );
    return response.data.data ?? [];
  },

  create: async (data: { name: string; slug: string; description?: string }) => {
    const response = await apiClient.post<ApiResponse<Organization>>('/api/organizations', data);
    return response.data.data;
  },

  updateById: async (
    id: number,
    data: {
      name?: string;
      description?: string;
      active?: boolean;
    }
  ) => {
    const response = await apiClient.patch<ApiResponse<Organization>>(
      `/api/organizations/${id}`,
      data
    );
    if (!response.data.data) {
      throw new Error('Organization data not found');
    }
    return response.data.data;
  },

  delete: async (id: number) => {
    const response = await apiClient.delete<ApiResponse<void>>(`/api/organizations/${id}`);
    return response.data;
  },

  addMember: async (orgId: number, userId: number, role: string) => {
    const response = await apiClient.post<ApiResponse<void>>(
      `/api/organizations/${orgId}/members`,
      { userId, role }
    );
    return response.data;
  },

  removeMember: async (orgId: number, userId: number) => {
    const response = await apiClient.delete<ApiResponse<void>>(
      `/api/organizations/${orgId}/members/${userId}`
    );
    return response.data;
  },

  getAIProvider: async () => {
    const response = await apiClient.get<
      ApiResponse<{ preferredProvider: string | null }>
    >('/api/organizations/ai-provider');
    return response.data.data?.preferredProvider ?? null;
  },

  updateAIProvider: async (provider: string | null) => {
    const response = await apiClient.patch<ApiResponse<{ preferredProvider: string | null }>>(
      '/api/organizations/ai-provider',
      { preferredProvider: provider }
    );
    return response.data;
  },

  getAutoReply: async () => {
    const response = await apiClient.get<
      ApiResponse<{ enabled: boolean; requestMissingInfo: boolean; suggestSolutions: boolean; highConfidenceThreshold: number }>
    >('/api/organizations/auto-reply');
    return {
      enabled: response.data.data?.enabled ?? false,
      requestMissingInfo: response.data.data?.requestMissingInfo ?? true,
      suggestSolutions: response.data.data?.suggestSolutions ?? true,
      highConfidenceThreshold: response.data.data?.highConfidenceThreshold ?? 0.9,
    };
  },

  updateAutoReply: async (data: { enabled?: boolean; requestMissingInfo?: boolean; suggestSolutions?: boolean; highConfidenceThreshold?: number }) => {
    const response = await apiClient.patch<
      ApiResponse<{ enabled: boolean; requestMissingInfo: boolean; suggestSolutions: boolean; highConfidenceThreshold: number }>
    >('/api/organizations/auto-reply', data
    );
    return response.data;
  },
};
