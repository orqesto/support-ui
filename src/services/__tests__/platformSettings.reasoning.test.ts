import { vi, describe, it, expect, beforeEach } from 'vitest';

/**
 * Wiring for the reasoning card: the exact path and body of the save, and that GET survives a
 * backend without the `reasoning` block (the frontend can reach `main` before the backend).
 */
const get = vi.fn();
const patch = vi.fn();
vi.mock('@/lib/api-client', () => ({ apiClient: { get, patch, post: vi.fn() } }));

const { platformSettingsService } = await import('../platformSettings.service');

const BLOCK = {
  stored: { defaultEffort: 'low', effortByFeature: { translation: 'medium' } },
  effective: {
    defaultEffort: 'low',
    effortByFeature: { translation: 'medium' },
    headroomTokens: { value: 3000, source: 'default' },
  },
  options: {
    efforts: ['none', 'minimal', 'low', 'medium', 'high'],
    features: ['translation'],
    headroomTokens: { min: 1000, max: 32000, default: 3000 },
  },
};

const MINIMAL_SETTINGS = {
  ai: { defaultModel: { value: 'gpt-5-mini', source: 'default' } },
  storage: { driver: { value: 'local', source: 'default' } },
};

beforeEach(() => {
  get.mockReset();
  patch.mockReset();
});

describe('platformSettingsService reasoning', () => {
  it('PATCHes the complete object to /settings/reasoning and reads the answer', async () => {
    patch.mockResolvedValue({ data: { success: true, data: BLOCK } });
    const result = await platformSettingsService.updateReasoning({
      defaultEffort: 'low',
      effortByFeature: { translation: 'medium' },
    });
    expect(patch).toHaveBeenCalledWith('/api/admin/platform/settings/reasoning', {
      defaultEffort: 'low',
      effortByFeature: { translation: 'medium' },
    });
    expect(result?.effective.headroomTokens).toEqual({ value: 3000, source: 'default' });
    expect(result?.ignoredFeatures).toEqual([]);
  });

  it('sends {} for a reset, not an absent body', async () => {
    patch.mockResolvedValue({ data: { success: true, data: BLOCK } });
    await platformSettingsService.updateReasoning({});
    expect(patch).toHaveBeenCalledWith('/api/admin/platform/settings/reasoning', {});
  });

  it('GET without a reasoning block leaves it undefined', async () => {
    get.mockResolvedValue({ data: { data: MINIMAL_SETTINGS } });
    const settings = await platformSettingsService.get();
    expect(settings.reasoning).toBeUndefined();
  });

  it('CONTROL: GET with a reasoning block passes it through', async () => {
    get.mockResolvedValue({ data: { data: { ...MINIMAL_SETTINGS, reasoning: BLOCK } } });
    const settings = await platformSettingsService.get();
    expect(settings.reasoning?.stored).toEqual(BLOCK.stored);
  });
});
