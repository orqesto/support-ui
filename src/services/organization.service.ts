import { apiClient } from '@/lib/api-client';
import type { ApiResponse, PaginationMeta } from '@/types';

// Core org + member shapes are generated from the backend zod contract
// (../BE-service/openapi.json). See src/types/api.ts.
import type { Organization as ApiOrganization, OrganizationMember } from '@/types/api';

export type TenantDbInfo = {
  deploymentType: 'shared' | 'dedicated' | 'external';
  dbSecretRef: string | null;
  region: string | null;
  status: 'provisioning' | 'active' | 'degraded' | 'suspended';
};

/**
 * The generated org contract (id/name/slug/code/description/email/settings/
 * billingCustomerId/fallbackDepartmentId/active/isSystem/createdAt/updatedAt) plus
 * `tenantDb`, which only the global-admin list endpoint attaches (not yet modelled
 * in the contract — tracked as a follow-up).
 */
export type Organization = ApiOrganization & { tenantDb?: TenantDbInfo | null };

export type { OrganizationMember };

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
  // Speed-to-Lead report knobs (optional — undefined = use defaults / off)
  slowLeadThresholdMinutes?: number;
  avgLeadValue?: number;
  weeklyDigestEnabled?: boolean;
  digestRecipients?: string[];
};

export const organizationService = {
  getById: async (id: number) => {
    const response = await apiClient.get<ApiResponse<Organization>>(`/api/organizations/${id}`);
    if (!response.data.data) throw new Error('Organization not found');
    return response.data.data;
  },

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

  update: async (data: { name?: string; description?: string | null; active?: boolean }) => {
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
      description?: string | null;
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
    // Wave 4 PR 7: per-dept overrides, keyed by stringified department ID.
    // Each entry may set any subset; unset fields fall back to the org-level value.
    departmentSettings?: Record<
      string,
      {
        autoReplyEnabled?: boolean;
        autoReplyRequestMissingInfo?: boolean;
        autoReplySuggestSolutions?: boolean;
        autoReplyHighConfidenceThreshold?: number;
        escalationPhrases?: string[];
      }
    >;
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

  getSelfEditSkills: async (): Promise<{ allowSelfEditSkills: boolean }> => {
    const response = await apiClient.get<ApiResponse<{ allowSelfEditSkills: boolean }>>('/api/organizations/self-edit-skills');
    return response.data.data ?? { allowSelfEditSkills: false };
  },

  updateSelfEditSkills: async (allowSelfEditSkills: boolean): Promise<void> => {
    await apiClient.patch('/api/organizations/self-edit-skills', { allowSelfEditSkills });
  },

  getSecuritySettings: async (): Promise<{ require2FA: boolean }> => {
    const response = await apiClient.get<ApiResponse<{ require2FA: boolean }>>(
      '/api/organizations/security-settings'
    );
    return response.data.data ?? { require2FA: false };
  },

  updateSecuritySettings: async (data: {
    require2FA?: boolean;
  }): Promise<{ require2FA: boolean }> => {
    const response = await apiClient.patch<ApiResponse<{ require2FA: boolean }>>(
      '/api/organizations/security-settings',
      data
    );
    return response.data.data ?? { require2FA: false };
  },
};
