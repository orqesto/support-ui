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
  /**
   * Whether the workspace's AI can actually be used (what the automatic-reply checks resolve):
   * `null` when the backend could not tell. Absent on a backend that does not send it yet.
   */
  usable?: boolean | null;
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
    // `usable` is new (backend 2026-11-23): this bundle is also served against a backend that
    // does not send it. Anything but a boolean or null is read as "not sent".
    const { usable, ...rest } = response.data.data;
    const data: AIProvidersResponse =
      typeof usable === 'boolean' || usable === null ? { ...rest, usable } : rest;
    return { ...response.data, data };
  },
};
