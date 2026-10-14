import { vi, describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { chooseOption } from '@/test/chooseOption';
import type { PlatformSettings, SecretStatus } from '@/services/platformSettings.service';

const noopMutation = { mutate: vi.fn(), isPending: false };
const saveMutation = {
  mutate: vi.fn((_input: unknown, opts?: { onSuccess?: () => void }) => opts?.onSuccess?.()),
  isPending: false,
};
vi.mock('@/hooks/useBackendVersion', () => ({
  useBackendVersion: () => ({ data: { bedrockInstanceProfile: false }, isLoading: false }),
}));
vi.mock('@/hooks/usePlatformSettings', () => ({
  useUpdatePlatformAi: () => saveMutation,
  useSetPlatformSecret: () => noopMutation,
  useClearPlatformSecret: () => noopMutation,
  usePlatformBedrockModels: () => ({ data: undefined, isLoading: false }),
  usePlatformAiModels: () => ({ data: undefined, isLoading: false }),
}));

const { ManagedAiDefaultsCard } = await import('../ManagedAiDefaultsCard');

const UNSET: SecretStatus = { configured: false, source: 'none', last4: null };

type Ai = PlatformSettings['ai'];

const aiWithCosts = (): Ai => ({
  provider: { value: 'openai', source: 'db' },
  defaultModel: { value: 'gpt-5-mini', source: 'db' },
  strongModel: { value: 'gpt-5', source: 'db' },
  visionModel: { value: 'gpt-4o-mini', source: 'db' },
  defaultCostPer1k: { value: 0.00013, source: 'db' },
  strongCostPer1k: { value: null, source: 'default' },
  visionCostPer1k: { value: 0.002, source: 'env' },
  baseUrl: { value: 'https://api.openai.com/v1', source: 'default' },
  organization: { value: '', source: 'default' },
  bedrockRegion: { value: null, source: 'default' },
  bedrockRoleArn: { value: null, source: 'default' },
  bedrockExternalId: { value: null, source: 'default' },
  bedrockUseInstanceProfile: { value: null, source: 'default' },
  bedrockInferenceProfileArn: { value: null, source: 'default' },
  keySlot: 'ai.openai_api_key',
  baseUrlEditable: false,
  apiKey: UNSET,
  bedrockAccessKeyId: UNSET,
  bedrockSecretAccessKey: UNSET,
});

const SECRETS = {
  'ai.openai_api_key': UNSET,
  'ai.anthropic_api_key': UNSET,
  'ai.deepseek_api_key': UNSET,
  'ai.perplexity_api_key': UNSET,
  'ai.qwen_api_key': UNSET,
  'ai.custom_api_key': UNSET,
  'ai.bedrock_access_key_id': UNSET,
  'ai.bedrock_secret_access_key': UNSET,
  'storage.s3_access_key_id': UNSET,
  'storage.s3_secret_access_key': UNSET,
} satisfies PlatformSettings['secrets'];

const cost = (tier: string, unit: string) =>
  screen.getByLabelText<HTMLInputElement>(`${tier} — cost per ${unit} tokens`);

const openEditor = () =>
  fireEvent.click(screen.getByRole('button', { name: /^(edit|configure)/i }));

const sentInput = () => saveMutation.mutate.mock.lastCall?.[0] as Record<string, unknown>;

afterEach(() => {
  cleanup();
  saveMutation.mutate.mockClear();
});

/**
 * Costs are stored per 1k tokens, but typed per 1k a Haiku price is 0.00013 — "this quantity of
 * zeroes" (2026-10-14). The card types them per 1M by default and converts on the way in and out.
 */
describe('ManagedAiDefaultsCard — cost unit', () => {
  it('shows a stored per-1k cost per 1M and saves it back per 1k', () => {
    render(<ManagedAiDefaultsCard ai={aiWithCosts()} secrets={SECRETS} />);
    openEditor();

    expect(cost('Default tier', '1M').value).toBe('0.13');
    // An env value is the placeholder, in the same unit.
    expect(cost('Vision tier', '1M').placeholder).toBe('2');

    fireEvent.change(cost('Strong tier', '1M'), { target: { value: '0.8' } });
    fireEvent.click(screen.getByRole('button', { name: /save ai defaults/i }));

    expect(sentInput()).toMatchObject({ defaultCostPer1k: 0.00013, strongCostPer1k: 0.0008 });
    expect(sentInput()).not.toHaveProperty('visionCostPer1k');
  });

  it('converts typed values when the unit is switched to 1k', async () => {
    render(<ManagedAiDefaultsCard ai={aiWithCosts()} secrets={SECRETS} />);
    openEditor();
    fireEvent.change(cost('Strong tier', '1M'), { target: { value: '0.8' } });

    await chooseOption(screen.getByRole('combobox', { name: 'Cost unit' }), '1k tokens');

    expect(cost('Default tier', '1k').value).toBe('0.00013');
    expect(cost('Strong tier', '1k').value).toBe('0.0008');
    expect(cost('Vision tier', '1k').placeholder).toBe('0.002');

    fireEvent.change(cost('Strong tier', '1k'), { target: { value: '0.003' } });
    fireEvent.click(screen.getByRole('button', { name: /save ai defaults/i }));

    expect(sentInput()).toMatchObject({ defaultCostPer1k: 0.00013, strongCostPer1k: 0.003 });
  });
});
