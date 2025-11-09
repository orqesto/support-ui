import { apiClient } from '@/lib/api-client';
import type { ApiResponse } from '@/types';

export type SupportRuleCategory = 'issue' | 'help' | 'question' | 'access' | 'account' | 'urgent';

export type SupportRule = {
  id: number;
  organizationId: number;
  name: string;
  description: string;
  pattern: string;
  category: SupportRuleCategory;
  confidence: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CreateSupportRuleInput = {
  name: string;
  description: string;
  pattern: string;
  category: SupportRuleCategory;
  confidence?: number;
  active?: boolean;
};

export type UpdateSupportRuleInput = Partial<CreateSupportRuleInput>;

export const supportRuleService = {
  getAll: async () => {
    const response = await apiClient.get<ApiResponse<SupportRule[]>>(
      '/api/settings/support-rules'
    );
    return response.data;
  },

  getById: async (id: number) => {
    const response = await apiClient.get<ApiResponse<SupportRule>>(
      `/api/settings/support-rules/${id}`
    );
    return response.data;
  },

  create: async (data: CreateSupportRuleInput) => {
    const response = await apiClient.post<ApiResponse<SupportRule>>(
      '/api/settings/support-rules',
      data
    );
    return response.data;
  },

  update: async (id: number, data: UpdateSupportRuleInput) => {
    const response = await apiClient.put<ApiResponse<SupportRule>>(
      `/api/settings/support-rules/${id}`,
      data
    );
    return response.data;
  },

  delete: async (id: number) => {
    const response = await apiClient.delete<ApiResponse<void>>(
      `/api/settings/support-rules/${id}`
    );
    return response.data;
  },
};
