import { vi, describe, it, expect } from 'vitest';

/**
 * The console ships from `main` (production on merge) while the backend ships on
 * its own release train, so for the window between the two deploys this frontend
 * talks to a backend that predates the multi-provider AI fields, the per-slot
 * `secrets` map, and the storage `effectiveDriver` / `envS3Configured` /
 * AssumeRole fields. Every one of those was read as `field.value` — against
 * `undefined` that throws and white-screens the entire Platform Defaults page.
 *
 * These pin the normalization that makes the old shape survivable.
 */
const get = vi.fn();
vi.mock('@/lib/api-client', () => ({ apiClient: { get, patch: vi.fn(), post: vi.fn() } }));

const { platformSettingsService } = await import('../platformSettings.service');

/** Exactly what the currently-deployed backend returns. */
const OLD_PAYLOAD = {
  ai: {
    defaultModel: { value: 'gpt-5-mini', source: 'default' },
    strongModel: { value: 'gpt-5', source: 'default' },
    visionModel: { value: 'gpt-4o-mini', source: 'default' },
    defaultCostPer1k: { value: null, source: 'default' },
    strongCostPer1k: { value: null, source: 'default' },
    visionCostPer1k: { value: null, source: 'default' },
    apiKey: { configured: true, source: 'env', last4: 'WXYZ' },
  },
  storage: {
    driver: { value: 's3', source: 'env' },
    endpoint: { value: null, source: 'env' },
    region: { value: null, source: 'env' },
    bucket: { value: 'odly', source: 'env' },
    prefix: { value: null, source: 'env' },
    forcePathStyle: { value: false, source: 'env' },
    accessKeyId: { configured: true, source: 'env', last4: 'ABCD' },
    secretAccessKey: { configured: false, source: 'none', last4: null },
  },
};

describe('platformSettingsService.get — tolerates an older backend', () => {
  it('fills in every field the old payload omits, with no undefined holes', async () => {
    get.mockResolvedValueOnce({ data: { data: OLD_PAYLOAD } });
    const settings = await platformSettingsService.get();

    // Each of these threw before normalization.
    expect(settings.ai.provider.value).toBe('openai');
    expect(settings.ai.baseUrl.value).toBeNull();
    expect(settings.ai.bedrockRegion.source).toBe('default');
    expect(settings.storage.roleArn.value).toBeNull();
    expect(settings.storage.externalId.source).toBe('default');
    expect(settings.ai.baseUrlEditable).toBe(false);
  });

  it('carries the old single-key statuses into the per-slot secrets map', async () => {
    get.mockResolvedValueOnce({ data: { data: OLD_PAYLOAD } });
    const settings = await platformSettingsService.get();
    expect(settings.ai.keySlot).toBe('ai.openai_api_key');
    expect(settings.secrets['ai.openai_api_key'].last4).toBe('WXYZ');
    expect(settings.secrets['storage.s3_access_key_id'].last4).toBe('ABCD');
    // Slots the old backend knows nothing about read as unset, not undefined.
    expect(settings.secrets['ai.anthropic_api_key']).toEqual({
      configured: false,
      source: 'none',
      last4: null,
    });
  });

  it('assumes the old backend already served uploads from its resolved driver', async () => {
    // Without effectiveDriver, showing "still writing to local disk" would be a lie.
    get.mockResolvedValueOnce({ data: { data: OLD_PAYLOAD } });
    const settings = await platformSettingsService.get();
    expect(settings.storage.effectiveDriver).toBe('s3');
    expect(settings.storage.envS3Configured).toBe(false);
  });

  it('passes a current payload through unchanged', async () => {
    get.mockResolvedValueOnce({
      data: {
        data: {
          ...OLD_PAYLOAD,
          ai: {
            ...OLD_PAYLOAD.ai,
            provider: { value: 'anthropic', source: 'db' },
            keySlot: 'ai.anthropic_api_key',
            baseUrlEditable: false,
          },
          storage: { ...OLD_PAYLOAD.storage, effectiveDriver: 'local', envS3Configured: true },
          secrets: { 'ai.anthropic_api_key': { configured: true, source: 'db', last4: '1234' } },
        },
      },
    });
    const settings = await platformSettingsService.get();
    expect(settings.ai.provider.value).toBe('anthropic');
    expect(settings.ai.keySlot).toBe('ai.anthropic_api_key');
    expect(settings.storage.effectiveDriver).toBe('local');
    expect(settings.storage.envS3Configured).toBe(true);
    expect(settings.secrets['ai.anthropic_api_key'].last4).toBe('1234');
  });
});
