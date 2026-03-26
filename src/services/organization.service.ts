import { apiClient } from '@/lib/api-client';
import type { ApiResponse, PaginationMeta } from '@/types';

export type TenantDbInfo = {
  deploymentType: 'shared' | 'dedicated' | 'external';
  dbSecretRef: string | null;
  region: string | null;
  status: 'provisioning' | 'active' | 'degraded' | 'suspended';
};

export type Organization = {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  settings: Record<string, unknown> | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  tenantDb?: TenantDbInfo | null;
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

export type LeadQualificationFieldConfig = {
  key: string;
  label: string;
  required: boolean;
};

export type LeadCategoryConfig = {
  key: string;
  label: string;
  priority: 'high' | 'medium' | 'low';
  autoEscalate?: boolean;
};

export type OrgLeadConfig = {
  departments: string[];
  requiredContactFields: ('name' | 'email' | 'phone' | 'company')[];
  autoMarkNewSenders: boolean;
  qualificationFields: LeadQualificationFieldConfig[];
  categories: LeadCategoryConfig[];
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

  create: async (data: {
    name: string;
    slug: string;
    description?: string;
    deploymentType?: 'shared' | 'dedicated' | 'external';
    dbSecretRef?: string;
    region?: string;
  }) => {
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

  getAutoReply: async () => {
    const response = await apiClient.get<
      ApiResponse<{
        enabled: boolean;
        requestMissingInfo: boolean;
        suggestSolutions: boolean;
        highConfidenceThreshold: number;
      }>
    >('/api/organizations/auto-reply');
    return {
      enabled: response.data.data?.enabled ?? false,
      requestMissingInfo: response.data.data?.requestMissingInfo ?? true,
      suggestSolutions: response.data.data?.suggestSolutions ?? true,
      highConfidenceThreshold: response.data.data?.highConfidenceThreshold ?? 0.9,
    };
  },

  updateAutoReply: async (data: {
    enabled?: boolean;
    requestMissingInfo?: boolean;
    suggestSolutions?: boolean;
    highConfidenceThreshold?: number;
  }) => {
    const response = await apiClient.patch<
      ApiResponse<{
        enabled: boolean;
        requestMissingInfo: boolean;
        suggestSolutions: boolean;
        highConfidenceThreshold: number;
      }>
    >('/api/organizations/auto-reply', data);
    return response.data;
  },

  getLeadConfig: async (): Promise<OrgLeadConfig> => {
    const response = await apiClient.get<ApiResponse<OrgLeadConfig>>(
      '/api/organizations/lead-config'
    );
    return response.data.data ?? {
      departments: ['sales'],
      requiredContactFields: ['name', 'email'],
      autoMarkNewSenders: false,
      qualificationFields: [],
      categories: [],
    };
  },

  updateLeadConfig: async (data: Partial<OrgLeadConfig>) => {
    const response = await apiClient.patch<ApiResponse<OrgLeadConfig>>(
      '/api/organizations/lead-config',
      data
    );
    return response.data;
  },

  getRoutingKeys: async (): Promise<Array<{ id: number; key: string; description: string | null }>> => {
    const response = await apiClient.get<ApiResponse<Array<{ id: number; key: string; description: string | null }>>>('/api/organizations/routing-keys');
    return response.data.data ?? [];
  },

  addRoutingKey: async (key: string, description?: string): Promise<void> => {
    await apiClient.post('/api/organizations/routing-keys', { key, description });
  },

  deleteRoutingKey: async (key: string): Promise<void> => {
    await apiClient.delete(`/api/organizations/routing-keys/${encodeURIComponent(key)}`);
  },

  getAutoAssign: async (): Promise<{ mode: 'off' | 'match_only' | 'always' }> => {
    const response = await apiClient.get<ApiResponse<{ mode: 'off' | 'match_only' | 'always' }>>('/api/organizations/auto-assign');
    return response.data.data ?? { mode: 'always' };
  },

  updateAutoAssign: async (mode: 'off' | 'match_only' | 'always'): Promise<void> => {
    await apiClient.patch('/api/organizations/auto-assign', { mode });
  },
};
