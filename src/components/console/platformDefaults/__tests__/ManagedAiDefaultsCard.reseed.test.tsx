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

/** The card opens read-only now; the form only exists in the editing state. */
const openEditor = () =>
  fireEvent.click(screen.getByRole('button', { name: /^(edit|configure)/i }));

afterEach(cleanup);

/**
 * Same defect as DefaultStorageCard: state seeded by `useState` initialisers that
 * run only on mount, so a refetch updated the badges while the inputs kept what had
 * been typed. The re-seed test below still pins that, unchanged.
 *
 * ⚠️ The second test was rewritten deliberately, not deleted to make a change pass. It
 * used to assert a derived "Saved" badge that cleared itself on the next keystroke. The
 * card now sits on `ConfigCard`, where saving LEAVES the editing state and lands on a
 * read-only view rendered from server data — a stronger guarantee than a badge, because
 * what you are looking at afterwards IS the stored config rather than a claim about it.
 * If the badge ever comes back, this test should go back with it.
 */
describe('ManagedAiDefaultsCard save state', () => {
  it('shows what the server stored once the stored defaults change', () => {
    const { rerender } = render(
      <ManagedAiDefaultsCard ai={aiWithOrganization('org-original')} secrets={SECRETS} />
    );
    openEditor();
    expect(orgInput().value).toBe('org-original');

    fireEvent.change(orgInput(), { target: { value: 'org-typed-but-never-stored' } });
    expect(orgInput().value).toBe('org-typed-but-never-stored');

    rerender(
      <ManagedAiDefaultsCard ai={aiWithOrganization('org-from-server')} secrets={SECRETS} />
    );

    expect(orgInput().value).toBe('org-from-server');
  });

  it('answers a save with the stored config, not with a claim that it saved', () => {
    render(<ManagedAiDefaultsCard ai={aiWithOrganization('org-original')} secrets={SECRETS} />);
    openEditor();

    fireEvent.click(screen.getByRole('button', { name: /save ai defaults/i }));

    // Back to read-only: the form is gone, and what remains is rendered from `ai`.
    expect(screen.queryByPlaceholderText(/^org-/)).toBeNull();
    expect(screen.getByRole('button', { name: /^edit$/i })).toBeTruthy();
    expect(saveMutation.mutate).toHaveBeenCalled();
  });

  it('CONTROL: a failed save keeps you in the editor with your draft', () => {
    // The mutation that does not call onSuccess stands in for a rejected save. Landing on
    // the read-only view then would say "stored" about something the server refused.
    saveMutation.mutate.mockImplementationOnce(() => undefined);
    render(<ManagedAiDefaultsCard ai={aiWithOrganization('org-original')} secrets={SECRETS} />);
    openEditor();
    fireEvent.change(orgInput(), { target: { value: 'org-typed' } });

    fireEvent.click(screen.getByRole('button', { name: /save ai defaults/i }));

    expect(orgInput().value).toBe('org-typed');
  });
});
