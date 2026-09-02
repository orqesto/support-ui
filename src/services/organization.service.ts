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
export type Organization = ApiOrganization & {
  tenantDb?: TenantDbInfo | null;
  /**
   * The alliance this org belongs to, or null/absent when standalone. Returned by
   * the full-row endpoints (getCurrent/getById) but not yet in the generated
   * contract. When set, the per-org SSO/SCIM settings tabs go read-only — identity
   * is governed by the alliance console (LOCKED-6; the BE resolver is authoritative).
   */
  allianceId?: number | null;
  /**
   * The workspace's current plan, or null when it has no subscription. Attached only
   * by the global-admin list endpoint (getAllOrganizations) — not in the generated
   * contract, so optional here (absent on the single-org getCurrent/getById reads).
   */
  plan?: { name: string; displayName: string } | null;
  /** Active member count. Attached only by the global-admin list endpoint. */
  memberCount?: number;
};

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
  /**
   * Department IDs. `string` is tolerated only for a row not yet migrated off the old slug
   * form — the UI writes ids, and the backend normalises anything it is sent
   * (support-service#623).
   */
  departments: (number | string)[];
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

export type BusinessHoursWeekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

/** `[open, close]` as `HH:MM` wall-clock in the org's own timezone. */
export type BusinessHoursRange = [string, string];

export type BusinessHoursConfig = {
  timezone: string;
  week: Partial<Record<BusinessHoursWeekday, BusinessHoursRange[]>>;
  holidays?: string[];
};

/**
 * `configured: false` is a real answer, not an error — an org that has never set a calendar
 * reports wall-clock only. Distinguishing it from "the endpoint is not deployed here" is the
 * caller's job; see the 404 handling in BusinessHoursSettings.
 */
export type BusinessHoursResponse = {
  configured: boolean;
  businessHours: BusinessHoursConfig | null;
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

  /** The workspace's live AI mode: 'managed' = platform AI, 'byo' = tenant's own keys. */
  getAiMode: async (): Promise<'byo' | 'managed'> => {
    const org = await organizationService.getCurrent();
    const settings = (org.settings ?? {}) as { aiMode?: unknown };
    // Managed AI is platform spend, so read it closed: only the literal 'managed' opts in.
    // Anything else — a stray casing, a number, an absent key — resolves to BYO.
    return settings.aiMode === 'managed' ? 'managed' : 'byo';
  },

  /**
   * Tenant-facing AI-mode switch (org_admin). Switching to BYO is always allowed; switching to
   * MANAGED is platform spend, so the BE requires the org to be entitled AND have a
   * verified-email admin — otherwise it returns 403 and the thrown error carries a `code` on
   * `.data` ('managed_ai_not_entitled' | 'managed_ai_requires_verified_admin').
   * PATCH /api/organizations/ai-mode/self.
   */
  setAiModeSelf: async (aiMode: 'byo' | 'managed'): Promise<{ aiMode: 'byo' | 'managed' }> => {
    const response = await apiClient.patch<ApiResponse<{ aiMode: 'byo' | 'managed' }>>(
      '/api/organizations/ai-mode/self',
      { aiMode }
    );
    return response.data.data ?? { aiMode };
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

  /** Change a member's workspace role (PATCH .../members/:userId/role, global-admin). */
  updateMemberRole: async (orgId: number, userId: number, role: string) => {
    const response = await apiClient.patch<ApiResponse<void>>(
      `/api/organizations/${orgId}/members/${userId}/role`,
      { role }
    );
    return response.data;
  },

  /** Set a member's departments within a workspace (PATCH .../members/:userId/departments). */
  setMemberDepartments: async (orgId: number, userId: number, departmentIds: number[]) => {
    const response = await apiClient.patch<ApiResponse<void>>(
      `/api/organizations/${orgId}/members/${userId}/departments`,
      { departmentIds }
    );
    return response.data;
  },

  /** Switch a workspace's subscription plan (PATCH .../subscription/plan, global-admin). */
  switchWorkspacePlan: async (orgId: number, planId: number) => {
    const response = await apiClient.patch<ApiResponse<Organization>>(
      `/api/organizations/${orgId}/subscription/plan`,
      { planId }
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

  getVisionConfig: async (): Promise<{ enabled: boolean; provider?: string; model?: string }> => {
    const response = await apiClient.get<
      ApiResponse<{ enabled: boolean; provider?: string; model?: string }>
    >('/api/organizations/vision-config');
    return response.data.data ?? { enabled: true };
  },

  updateVisionConfig: async (data: {
    enabled?: boolean;
    provider?: string | null;
    model?: string | null;
  }) => {
    const response = await apiClient.patch<
      ApiResponse<{ enabled: boolean; provider?: string; model?: string }>
    >('/api/organizations/vision-config', data);
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

  getBusinessHours: async (): Promise<BusinessHoursResponse> => {
    const response = await apiClient.get<ApiResponse<BusinessHoursResponse>>(
      '/api/organizations/business-hours'
    );
    return response.data.data ?? { configured: false, businessHours: null };
  },

  updateBusinessHours: async (
    businessHours: BusinessHoursConfig | null
  ): Promise<BusinessHoursResponse> => {
    const response = await apiClient.patch<ApiResponse<BusinessHoursResponse>>(
      '/api/organizations/business-hours',
      { businessHours }
    );
    return response.data.data ?? { configured: businessHours !== null, businessHours };
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
