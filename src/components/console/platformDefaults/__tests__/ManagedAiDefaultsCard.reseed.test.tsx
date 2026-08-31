import { vi, describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import type { PlatformSettings, SecretStatus } from '@/services/platformSettings.service';

const noopMutation = { mutate: vi.fn(), isPending: false };
const saveMutation = {
  mutate: vi.fn((_input: unknown, opts?: { onSuccess?: () => void }) => opts?.onSuccess?.()),
  isPending: false,
};
vi.mock('@/hooks/usePlatformSettings', () => ({
  useUpdatePlatformAi: () => saveMutation,
  useSetPlatformSecret: () => noopMutation,
  useClearPlatformSecret: () => noopMutation,
  usePlatformAiModels: () => ({ data: undefined, isLoading: false }),
}));

const { ManagedAiDefaultsCard } = await import('../ManagedAiDefaultsCard');

const UNSET: SecretStatus = { configured: false, source: 'none', last4: null };

type Ai = PlatformSettings['ai'];

const aiWithOrganization = (organization: string): Ai => ({
  provider: { value: 'openai', source: 'db' },
  defaultModel: { value: 'gpt-5-mini', source: 'db' },
  strongModel: { value: 'gpt-5', source: 'db' },
  visionModel: { value: 'gpt-4o-mini', source: 'db' },
  defaultCostPer1k: { value: null, source: 'default' },
  strongCostPer1k: { value: null, source: 'default' },
  visionCostPer1k: { value: null, source: 'default' },
  baseUrl: { value: 'https://api.openai.com/v1', source: 'default' },
  organization: { value: organization, source: 'db' },
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

const orgInput = () => screen.getByPlaceholderText<HTMLInputElement>(/^org-/);

afterEach(cleanup);

/**
 * Same defect as DefaultStorageCard: state seeded by `useState` initialisers that
 * run only on mount, so a refetch updated the badges while the inputs kept what had
 * been typed. This card has no single edit choke point, so its "Saved" flag is
 * derived from the draft — these tests pin that it clears itself on the next edit.
 */
describe('ManagedAiDefaultsCard save state', () => {
  it('shows what the server stored once the stored defaults change', () => {
    const { rerender } = render(
      <ManagedAiDefaultsCard ai={aiWithOrganization('org-original')} secrets={SECRETS} />
    );
    expect(orgInput().value).toBe('org-original');

    fireEvent.change(orgInput(), { target: { value: 'org-typed-but-never-stored' } });
    expect(orgInput().value).toBe('org-typed-but-never-stored');

    rerender(<ManagedAiDefaultsCard ai={aiWithOrganization('org-from-server')} secrets={SECRETS} />);

    expect(orgInput().value).toBe('org-from-server');
  });

  it('confirms a save, then drops the confirmation on the next edit', () => {
    render(<ManagedAiDefaultsCard ai={aiWithOrganization('org-original')} secrets={SECRETS} />);
    expect(screen.queryByText('Saved')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /save ai defaults/i }));
    expect(screen.getByText('Saved')).toBeTruthy();

    fireEvent.change(orgInput(), { target: { value: 'org-changed-again' } });

    expect(screen.queryByText('Saved')).toBeNull();
  });
});
