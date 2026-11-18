import { apiClient } from '@/lib/api-client';
import type { AIModel } from '@/types/aiProviders';

/**
 * Live Bedrock model discovery — the shapes the backend sends and their normalisation.
 */
export type DiscoveredModel = {
  id: string;
  name: string;
  type: 'chat' | 'embedding';
  description?: string;
  requiresInferenceProfile?: boolean;
  inferenceProfileArn?: string;
};

export type DiscoveryPayload = {
  models: DiscoveredModel[];
  source: 'live' | 'cache';
  fetchedAt: string;
};

/** Why there is no live list. Older backends send no reason: treated as `error`. */
export type DiscoveryUnavailable = 'not_configured' | 'access_denied' | 'error';

export type BedrockDiscovery = {
  payload: DiscoveryPayload | null;
  reason?: DiscoveryUnavailable;
};

const REASONS: readonly DiscoveryUnavailable[] = ['not_configured', 'access_denied', 'error'];

/**
 * Tolerates both backend shapes: `{ data, reason }` (current) and `{ data }` (before the reason
 * existed) — the frontend can reach production before the backend that sends it.
 */
export const normalizeBedrockDiscovery = (body: unknown): BedrockDiscovery => {
  const record = (body ?? {}) as { data?: unknown; reason?: unknown };
  const data = record.data as DiscoveryPayload | null | undefined;
  const payload = data && Array.isArray(data.models) ? data : null;
  const reason = REASONS.find((known) => known === record.reason);
  return payload ? { payload } : { payload: null, reason: reason ?? 'error' };
};

/**
 * Live discovery entries as picker models (chat only). AWS reports input modalities on FOUNDATION
 * models (`… · IMAGE` in the description) but not on inference profiles, so a profile takes vision
 * from the foundation model it fronts (`eu.anthropic.x` ← `anthropic.x`). A foundation model that
 * can only be called through a profile says so in its name — its bare id fails on-demand.
 */
export const toPickerModels = (models: DiscoveredModel[]): AIModel[] => {
  const visionIds = new Set(
    // CHAT models only: an image-input EMBEDDING model (and its profile, which the list types as
    // chat) must not reach the vision tier.
    models
      .filter((model) => model.type === 'chat' && /\bIMAGE\b/.test(model.description ?? ''))
      .map((model) => model.id)
  );
  return models
    .filter((model) => model.type === 'chat')
    .map((model) => {
      // A profile id is `<geo>.<foundation id>` (us., eu., apac., global., …): strip the first
      // segment and look it up. A foundation id stripped this way matches nothing, so it is safe.
      const fronted = model.id.slice(model.id.indexOf('.') + 1);
      const vision = visionIds.has(model.id) || visionIds.has(fronted);
      return {
        id: model.id,
        name: model.requiresInferenceProfile ? `${model.name} — inference profile only` : model.name,
        type: model.type,
        contextWindow: 0, // not surfaced by the Bedrock list API
        description: model.description,
        ...(vision && { supportsVision: true }),
      };
    });
};

/** The workspace's Bedrock models (`region` overrides the stored region). */
export const fetchWorkspaceBedrockModels = async (region: string): Promise<BedrockDiscovery> => {
  try {
    const response = await apiClient.get(
      `/api/integrations/bedrock/models?region=${encodeURIComponent(region)}`
    );
    return normalizeBedrockDiscovery(response.data);
  } catch {
    // A failed request is an answer ("could not be loaded"), not the absence of one — the label
    // must not read as if nothing was asked.
    return { payload: null, reason: 'error' };
  }
};

/**
 * The line under a Bedrock model picker: where the list came from, and — when it is the built-in
 * list — the one thing that would make it live. `notConfigured` differs per surface (a workspace
 * card vs the platform console).
 */
export const bedrockModelSourceLabel = (
  query: { isLoading?: boolean; data?: BedrockDiscovery },
  notConfigured: string,
  /** No request was made (no region, form closed): say only where the list came from. */
  idle = 'Built-in list.'
): string => {
  if (query.isLoading) return 'Loading models from AWS…';
  if (!query.data) return idle;
  const payload = query.data.payload;
  // Counted as offered: the pickers show chat models only.
  const chatCount = payload?.models.filter((model) => model.type === 'chat').length ?? 0;
  if (payload && chatCount > 0) {
    return `Live from AWS · ${chatCount} chat models${payload.source === 'cache' ? ' (cached)' : ''}`;
  }
  if (payload) {
    return 'Built-in list — AWS lists no chat models for this identity in this region.';
  }
  switch (query.data.reason) {
    case 'access_denied':
      return (
        "Built-in list — this AWS identity can't list models. Allow bedrock:ListFoundationModels " +
        'and bedrock:ListInferenceProfiles to see every model in this region.'
      );
    case 'not_configured':
      return `Built-in list — ${notConfigured}`;
    default:
      return (
        'Built-in list — the live list could not be loaded from AWS (Test Connection shows whether ' +
        'the credentials work). Pick "Other" to enter any model id.'
      );
  }
};
