import { apiClient } from '@/lib/api-client';
import type { AIModel, AIProvider } from '@/types/aiProviders';

type AIModelsResponse = {
  all: AIModel[];
  chat: AIModel[];
  embedding: AIModel[];
};

type AIProvidersResponse = {
  enabled: AIProvider[];
  available: AIProvider[];
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
