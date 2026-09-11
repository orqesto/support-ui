import { vi, describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
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
  usePlatformAiModels: () => ({ data: undefined, isLoading: false }),
}));

const { ManagedAiDefaultsCard } = await import('../ManagedAiDefaultsCard');

const UNSET: SecretStatus = { configured: false, source: 'none', last4: null };

const ai: PlatformSettings['ai'] = {
  provider: { value: 'openai', source: 'db' },
  defaultModel: { value: 'gpt-5-mini', source: 'db' },
  strongModel: { value: 'gpt-5', source: 'db' },
  visionModel: { value: 'gpt-4o-mini', source: 'db' },
  defaultCostPer1k: { value: null, source: 'default' },
  strongCostPer1k: { value: null, source: 'default' },
  visionCostPer1k: { value: null, source: 'default' },
  baseUrl: { value: 'https://api.openai.com/v1', source: 'default' },
  organization: { value: '', source: 'db' },
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
};

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

const openEditor = () =>
  fireEvent.click(screen.getByRole('button', { name: /^(edit|configure)/i }));
const saveButton = () => screen.getByRole('button', { name: /save ai defaults/i });
const keyInput = () => screen.getByPlaceholderText<HTMLInputElement>(/enter a value/i);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

/**
 * A credential typed here saves through ITS OWN button, never through "Save AI defaults".
 * Pressing the form's Save with a key still in the box persisted the provider switch and
 * dropped the credential, after which Test connection failed and the provider looked broken —
 * the workspace AI-provider card posts keys and config together, which is exactly why the two
 * surfaces behaved differently for the same steps (2026-09-11).
 */
describe('Managed AI defaults — a credential nobody saved', () => {
  it('blocks the form save and says why', () => {
    render(<ManagedAiDefaultsCard ai={ai} secrets={SECRETS} />);
    openEditor();

    expect(saveButton()).not.toBeDisabled();

    fireEvent.change(keyInput(), { target: { value: 'sk-typed-but-not-saved' } });

    expect(saveButton()).toBeDisabled();
    expect(screen.getByText(/nobody has saved yet/i)).toBeInTheDocument();
    fireEvent.click(saveButton());
    expect(saveMutation.mutate).not.toHaveBeenCalled();
  });

  it('does not treat whitespace as a credential', () => {
    render(<ManagedAiDefaultsCard ai={ai} secrets={SECRETS} />);
    openEditor();
    fireEvent.change(keyInput(), { target: { value: '   ' } });
    expect(saveButton()).not.toBeDisabled();
  });

  it('unblocks once the field is emptied again', () => {
    render(<ManagedAiDefaultsCard ai={ai} secrets={SECRETS} />);
    openEditor();
    fireEvent.change(keyInput(), { target: { value: 'sk-oops' } });
    expect(saveButton()).toBeDisabled();

    fireEvent.change(keyInput(), { target: { value: '' } });
    expect(saveButton()).not.toBeDisabled();
  });

  it('does not stay blocked after the form is cancelled and reopened', () => {
    // ⛔ The dirty flag outlived the draft in the first cut of this fix, leaving the card
    // permanently unsaveable over a field the operator had already discarded.
    render(<ManagedAiDefaultsCard ai={ai} secrets={SECRETS} />);
    openEditor();
    fireEvent.change(keyInput(), { target: { value: 'sk-oops' } });
    expect(saveButton()).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
    openEditor();

    expect(saveButton()).not.toBeDisabled();
  });

  it('does not stay blocked after the provider switch unmounts that field', () => {
    // Switching provider swaps which credential fields exist. A flag left behind by an
    // unmounted field blocked saving over a box that was no longer on screen.
    render(<ManagedAiDefaultsCard ai={ai} secrets={SECRETS} />);
    openEditor();
    fireEvent.change(keyInput(), { target: { value: 'sk-for-openai' } });
    expect(saveButton()).toBeDisabled();

    const providerSelect = screen.getAllByRole('combobox')[0];
    fireEvent.change(providerSelect, { target: { value: 'bedrock' } });

    expect(saveButton()).not.toBeDisabled();
  });
});
