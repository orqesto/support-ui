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
  /**
   * With a usable AI: is the check of an automatic reply refused for the workspace as a standing
   * state (trial ended, allowance used up, AI not in the plan, a budget or limit reached), and
   * why. `null` when the backend could not tell or did not ask. Absent on a backend that does not
   * send it yet.
   */
  ruleChecks?: { held: boolean; reason: string | null } | null;
};

/** `ruleChecks` as sent, or undefined for anything else (an older backend, a malformed answer). */
const readRuleChecks = (value: unknown): AIProvidersResponse['ruleChecks'] => {
  if (value === null) return null;
  if (typeof value !== 'object') return undefined;
  const { held, reason } = value as { held?: unknown; reason?: unknown };
  if (typeof held !== 'boolean') return undefined;
  return { held, reason: typeof reason === 'string' ? reason : null };
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
    // `ruleChecks` likewise (backend 2026-11-23): normalised here, undefined = "not sent".
    const { usable, ruleChecks: sentRuleChecks, ...rest } = response.data.data as Omit<
      AIProvidersResponse,
      'ruleChecks'
    > & { ruleChecks?: unknown };
    const ruleChecks = readRuleChecks(sentRuleChecks);
    const data: AIProvidersResponse = {
      ...rest,
      ...(typeof usable === 'boolean' || usable === null ? { usable } : {}),
      ...(ruleChecks === undefined ? {} : { ruleChecks }),
    };
    return { ...response.data, data };
  },
};
