import { apiClient } from '@/lib/api-client';
import type { AIModel, AIProvider } from '@/types/aiProviders';

type AIModelsResponse = {
  all: AIModel[];
  chat: AIModel[];
  embedding: AIModel[];
};

/**
 * `platform` is OPTIONAL on purpose. It arrives only from BE v1.1.248+, and this bundle can
 * be served against an older API during a deploy window — reading it unguarded is how a new
 * BE field white-screens a page. Every consumer must treat absence as "not managed".
 */
type PlatformAI = { active: false } | { active: true; provider: string; model: string; tier: string };

type AIProvidersResponse = {
  enabled: AIProvider[];
  available: AIProvider[];
  platform?: PlatformAI;
};

export const aiService = {
  getModels: async (provider: AIProvider) => {
    const response = await apiClient.get<{ success: boolean; data: AIModelsResponse }>(
      `/api/ai/models?provider=${provider}`
    );
    return response.data;
  },

  getProviders: async () => {
    const response = await apiClient.get<{ success: boolean; data: AIProvidersResponse }>('/api/ai/providers');
    return response.data;
  },
};
