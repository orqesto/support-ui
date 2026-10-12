import { describe, it, expect, vi } from 'vitest';

const get = vi.fn<(...args: unknown[]) => Promise<{ data: unknown }>>();
vi.mock('@/lib/api-client', () => ({ apiClient: { get: (...args: unknown[]) => get(...args) } }));
import {
  bedrockModelSourceLabel,
  fetchWorkspaceBedrockModels,
  normalizeBedrockDiscovery,
  toPickerModels,
  type DiscoveryPayload,
} from '@/services/bedrockDiscovery.service';

const payload: DiscoveryPayload = {
  models: [{ id: 'model-a', name: 'Model A', type: 'chat' }],
  source: 'live',
  fetchedAt: 'x',
};

describe('normalizeBedrockDiscovery', () => {
  it('reads a live list', () => {
    expect(normalizeBedrockDiscovery({ success: true, data: payload })).toEqual({ payload });
  });

  it('reads the reason the backend sends', () => {
    expect(normalizeBedrockDiscovery({ success: true, data: null, reason: 'access_denied' })).toEqual({
      payload: null,
      reason: 'access_denied',
    });
  });

  it('treats an older backend (no reason) and junk as error', () => {
    expect(normalizeBedrockDiscovery({ success: true, data: null })).toEqual({
      payload: null,
      reason: 'error',
    });
    expect(normalizeBedrockDiscovery({ data: null, reason: 'surprise' })).toEqual({
      payload: null,
      reason: 'error',
    });
    expect(normalizeBedrockDiscovery(undefined)).toEqual({ payload: null, reason: 'error' });
  });
});

describe('bedrockModelSourceLabel', () => {
  it('says loading, live and cached', () => {
    expect(bedrockModelSourceLabel({ isLoading: true }, 'n/a')).toBe('Loading models from AWS…');
    expect(bedrockModelSourceLabel({ data: { payload } }, 'n/a')).toBe(
      'Live from AWS · 1 chat models'
    );
    expect(
      bedrockModelSourceLabel({ data: { payload: { ...payload, source: 'cache' } } }, 'n/a')
    ).toBe('Live from AWS · 1 chat models (cached)');
  });

  it('uses the surface’s own text for not_configured', () => {
    expect(
      bedrockModelSourceLabel({ data: { payload: null, reason: 'not_configured' } }, 'save first.')
    ).toBe('Built-in list — save first.');
  });
});

describe('bedrockModelSourceLabel — what it does not claim', () => {
  it('says nothing about AWS when no request was made', () => {
    expect(bedrockModelSourceLabel({ isLoading: false }, 'n/a')).toBe('Built-in list.');
    expect(bedrockModelSourceLabel({}, 'n/a', 'Pick a region.')).toBe('Pick a region.');
  });

  it('counts only the chat models it offers', () => {
    const mixed: DiscoveryPayload = {
      ...payload,
      models: [...payload.models, { id: 'embed-a', name: 'Embed A', type: 'embedding' }],
    };
    expect(bedrockModelSourceLabel({ data: { payload: mixed } }, 'n/a')).toBe(
      'Live from AWS · 1 chat models'
    );
  });
});

describe('toPickerModels', () => {
  const models: DiscoveryPayload['models'] = [
    { id: 'anthropic.model-x', name: 'Model X (Anthropic)', type: 'chat', description: 'Anthropic · IMAGE', requiresInferenceProfile: true },
    { id: 'eu.anthropic.model-x', name: 'EU Model X (inference profile)', type: 'chat', description: 'Cross-region inference profile · SYSTEM_DEFINED' },
    { id: 'meta.text-only', name: 'Text only (Meta)', type: 'chat', description: 'Meta' },
    { id: 'eu.meta.text-only', name: 'EU Text only (inference profile)', type: 'chat', description: 'Cross-region inference profile · SYSTEM_DEFINED' },
    { id: 'amazon.embed', name: 'Embed', type: 'embedding' },
  ];

  it('gives a profile the vision of the model it fronts, and drops embeddings', () => {
    const vision = toPickerModels(models)
      .filter((model) => model.supportsVision)
      .map((model) => model.id);
    expect(vision).toEqual(['anthropic.model-x', 'eu.anthropic.model-x']);
    expect(toPickerModels(models).map((model) => model.id)).not.toContain('amazon.embed');
  });

  it('does not pass an image-input EMBEDDING model\u2019s flag to its profile', () => {
    const withEmbed: DiscoveryPayload['models'] = [
      { id: 'vendor.embed-image', name: 'Embed Image', type: 'embedding', description: 'Vendor · IMAGE' },
      { id: 'us.vendor.embed-image', name: 'US Embed Image (inference profile)', type: 'chat' },
    ];
    expect(toPickerModels(withEmbed)[0]).not.toHaveProperty('supportsVision');
  });

    it('marks a model that can only be called through a profile', () => {
    const [first] = toPickerModels(models);
    expect(first?.name).toBe('Model X (Anthropic) — inference profile only');
    expect(toPickerModels(models)[2]?.name).toBe('Text only (Meta)');
  });
});

describe('fetchWorkspaceBedrockModels', () => {
  it('reports a failed request (older backend 404, 5xx, network) as error, not as no answer', async () => {
    get.mockRejectedValueOnce(new Error('Request failed with status code 404'));
    const answer = await fetchWorkspaceBedrockModels('eu-west-1');
    expect(answer).toEqual({ payload: null, reason: 'error' });
    expect(bedrockModelSourceLabel({ data: answer }, 'n/a')).toMatch(/could not be loaded from AWS/);
  });
});

describe('bedrockModelSourceLabel — a list with no chat models', () => {
  it('says the list loaded but holds nothing to pick', () => {
    const embedOnly: DiscoveryPayload = {
      ...payload,
      models: [{ id: 'embed-a', name: 'Embed A', type: 'embedding' }],
    };
    expect(bedrockModelSourceLabel({ data: { payload: embedOnly } }, 'n/a')).toMatch(
      /AWS lists no chat models/
    );
  });
});
