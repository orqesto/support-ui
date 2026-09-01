import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import type { PlatformSettings, SecretStatus } from '@/services/platformSettings.service';

const UNSET: SecretStatus = { configured: false, source: 'none', last4: null };

const SAMPLE: PlatformSettings = {
  ai: {
    provider: { value: 'openai', source: 'default' },
    defaultModel: { value: 'gpt-5-mini', source: 'default' },
    strongModel: { value: 'gpt-5-custom', source: 'db' },
    visionModel: { value: 'gpt-4o-mini', source: 'env' },
    defaultCostPer1k: { value: null, source: 'default' },
    strongCostPer1k: { value: 0.01, source: 'db' },
    visionCostPer1k: { value: null, source: 'default' },
    baseUrl: { value: 'https://api.openai.com/v1', source: 'default' },
    organization: { value: null, source: 'default' },
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
  },
  storage: {
    driver: { value: 's3', source: 'db' },
    effectiveDriver: 's3',
    envS3Configured: false,
    endpoint: { value: 'https://s3.example.com', source: 'db' },
    region: { value: 'eu-central-1', source: 'env' },
    bucket: { value: 'odly', source: 'db' },
    prefix: { value: null, source: 'default' },
    forcePathStyle: { value: false, source: 'env' },
    roleArn: { value: null, source: 'default' },
    externalId: { value: null, source: 'default' },
    accessKeyId: { configured: true, source: 'env', last4: 'ABCD' },
    secretAccessKey: UNSET,
  },
  secrets: {
    'ai.openai_api_key': UNSET,
    'ai.anthropic_api_key': UNSET,
    'ai.deepseek_api_key': UNSET,
    'ai.perplexity_api_key': UNSET,
    'ai.qwen_api_key': UNSET,
    'ai.custom_api_key': UNSET,
    'ai.bedrock_access_key_id': UNSET,
    'ai.bedrock_secret_access_key': UNSET,
    'storage.s3_access_key_id': { configured: true, source: 'env', last4: 'ABCD' },
    'storage.s3_secret_access_key': UNSET,
  },
};

let settings: PlatformSettings = SAMPLE;
const noopMutation = { mutate: vi.fn(), isPending: false };
vi.mock('@/hooks/usePlatformSettings', () => ({
  usePlatformSettings: () => ({
    isLoading: false,
    isError: false,
    data: settings,
    refetch: vi.fn(),
  }),
  usePlatformAiModels: () => ({ data: undefined, isLoading: false }),
  useUpdatePlatformAi: () => noopMutation,
  useUpdatePlatformStorage: () => noopMutation,
  useSetPlatformSecret: () => noopMutation,
  useClearPlatformSecret: () => noopMutation,
  useTestPlatformStorage: () => noopMutation,
}));

const { PlatformDefaults } = await import('../PlatformDefaults');

afterEach(cleanup);
beforeEach(() => {
  settings = SAMPLE;
  noopMutation.mutate.mockClear();
});

describe('PlatformDefaults', () => {
  it('renders both cards with secret status, and says where each value came from', () => {
    render(<PlatformDefaults />);
    expect(screen.getByText('Managed AI Defaults')).toBeInTheDocument();
    expect(screen.getByText('Default Storage')).toBeInTheDocument();
    // Unset secrets (AI key + S3 secret) show a "Not set" badge in every state.
    expect(screen.getAllByText('Not set').length).toBeGreaterThanOrEqual(2);
    // An env-set access key shows its masked last4, never the value.
    expect(screen.getByText(/····ABCD/)).toBeInTheDocument();
    // Provenance survives the read-only view — "gpt-5-custom, set here" and
    // "gpt-4o-mini, from environment" are different facts, and only one of them is
    // undone by clearing this form.
    const ai = within(cardFor('Managed AI Defaults'));
    expect(ai.getAllByText(/set here/i).length).toBeGreaterThan(0);
    expect(ai.getAllByText(/from environment/i).length).toBeGreaterThan(0);
  });

  it('keeps the source badges on the fields once the editor is open', () => {
    render(<PlatformDefaults />);
    openAiEditor();
    expect(screen.getAllByText('Console').length).toBeGreaterThan(0); // db-sourced fields
    expect(screen.getAllByText('Environment').length).toBeGreaterThan(0); // env-sourced fields
  });

  /**
   * Both cards open read-only; each form exists only in that card's editing state. With more
   * than one ConfigCard on the screen "the Edit button" is ambiguous, so each is addressed
   * through its own card rather than by document order.
   */
  const cardFor = (title: string): HTMLElement => {
    const card = document.querySelector<HTMLElement>(`[data-config-card="${title}"]`);
    if (!card) throw new Error(`no ConfigCard titled ${title}`);
    return card;
  };
  const openEditor = (title: string) =>
    fireEvent.click(within(cardFor(title)).getByRole('button', { name: /^(edit|configure)/i }));
  const openStorageEditor = () => openEditor('Default Storage');
  const openAiEditor = () => openEditor('Managed AI Defaults');

  it('offers local disk LAST and labels it a fallback', () => {
    // Ordering is the point: a managed platform should land on S3, not on the
    // node-local disk that dies with the container.
    render(<PlatformDefaults />);
    openStorageEditor();
    const options = screen
      .getAllByRole('option')
      .map((option) => option.textContent ?? '')
      .filter((label) => /S3|Local disk/.test(label));
    expect(options[0]).toMatch(/S3/);
    expect(options[options.length - 1]).toMatch(/Local disk/);
    expect(options[options.length - 1]).toMatch(/fallback/i);
  });

  it('offers the environment S3 target only when the environment provides one', () => {
    render(<PlatformDefaults />);
    openStorageEditor();
    expect(screen.queryByText(/use the environment/i)).not.toBeInTheDocument();
    cleanup();

    settings = {
      ...SAMPLE,
      storage: { ...SAMPLE.storage, envS3Configured: true },
    };
    render(<PlatformDefaults />);
    openStorageEditor();
    expect(screen.getByText(/use the environment/i)).toBeInTheDocument();
  });

  it('warns when env S3 is present but files still go to local disk', () => {
    settings = {
      ...SAMPLE,
      storage: {
        ...SAMPLE.storage,
        driver: { value: 's3', source: 'env' },
        effectiveDriver: 'local',
        envS3Configured: true,
      },
    };
    render(<PlatformDefaults />);
    expect(screen.getByText(/still being written to local disk/i)).toBeInTheDocument();
  });

  it('gates S3 Save behind a successful connection test', () => {
    render(<PlatformDefaults />);
    openStorageEditor();
    expect(screen.getByText(/Run a successful connection test/i)).toBeInTheDocument();
    const save = screen.getByRole('button', { name: /save storage default/i });
    expect(save).toBeDisabled();
    fireEvent.click(save);
    expect(noopMutation.mutate).not.toHaveBeenCalled();
  });

  it('lists every supported AI provider', () => {
    render(<PlatformDefaults />);
    openAiEditor();
    const providerLabels = screen.getAllByRole('option').map((option) => option.textContent ?? '');
    [
      'OpenAI',
      'Anthropic',
      'DeepSeek',
      'Perplexity',
      'Qwen',
      'Ollama',
      'Bedrock',
      'Custom',
    ].forEach((name) => {
      expect(providerLabels.some((label) => label.includes(name))).toBe(true);
    });
  });

  it('does not offer a base URL field for a hosted provider', () => {
    // Repointing a hosted provider is exactly the SSRF hole managed traffic is
    // kept out of, so the endpoint is shown as fixed rather than editable.
    render(<PlatformDefaults />);
    openAiEditor();
    expect(screen.getByText(/endpoint is fixed for hosted providers/i)).toBeInTheDocument();
  });
  it('opens read-only, so a typed draft can never be mistaken for stored config', () => {
    render(<PlatformDefaults />);
    const ai = within(cardFor('Managed AI Defaults'));
    // Nothing to type into until you say you are editing.
    expect(ai.queryByRole('combobox')).not.toBeInTheDocument();
    openAiEditor();
    expect(ai.getByRole('combobox')).toBeInTheDocument();
  });

  it('discards the draft on Cancel and returns to what the server holds', () => {
    render(<PlatformDefaults />);
    openAiEditor();
    const ai = within(cardFor('Managed AI Defaults'));
    const provider = ai.getByRole<HTMLSelectElement>('combobox');
    fireEvent.change(provider, { target: { value: 'anthropic' } });
    expect(provider.value).toBe('anthropic');

    fireEvent.click(ai.getByRole('button', { name: /^cancel$/i }));
    openAiEditor();
    // Re-opened on the stored provider, not on the abandoned draft.
    expect(
      within(cardFor('Managed AI Defaults')).getByRole<HTMLSelectElement>('combobox').value
    ).toBe('openai');
  });
});
