import { apiClient } from '@/lib/api-client';
import type { ApiResponse } from '@/types';

export type DetectionRuleCategory = 'issue' | 'help' | 'question' | 'access' | 'account' | 'urgent';

export type DetectionRule = {
  id: number;
  organizationId: number;
  departmentId: number | null;
  name: string;
  description: string;
  pattern: string;
  exampleText: string | null;
  category: DetectionRuleCategory;
  confidence: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CreateDetectionRuleInput = {
  name: string;
  description: string;
  pattern: string;
  exampleText?: string;
  category: DetectionRuleCategory;
  confidence?: number;
  active?: boolean;
};

export type UpdateDetectionRuleInput = Partial<CreateDetectionRuleInput>;

export const detectionRuleService = {
  getAll: async () => {
    const response = await apiClient.get<ApiResponse<DetectionRule[]>>(
      '/api/settings/detection-rules'
    );
    return response.data;
  },

  getById: async (id: number) => {
    const response = await apiClient.get<ApiResponse<DetectionRule>>(
      `/api/settings/detection-rules/${id}`
    );
    return response.data;
  },

  create: async (data: CreateDetectionRuleInput) => {
    const response = await apiClient.post<ApiResponse<DetectionRule>>(
      '/api/settings/detection-rules',
      data
    );
    return response.data;
  },

  update: async (id: number, data: UpdateDetectionRuleInput) => {
    const response = await apiClient.put<ApiResponse<DetectionRule>>(
      `/api/settings/detection-rules/${id}`,
      data
    );
    return response.data;
  },

  delete: async (id: number) => {
    const response = await apiClient.delete<ApiResponse<void>>(
      `/api/settings/detection-rules/${id}`
    );
    return response.data;
  },
};
