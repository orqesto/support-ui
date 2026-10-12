/**
 * The Managed AI defaults pickers list the Bedrock models the PLATFORM's credentials can see, live
 * from AWS, instead of only the built-in catalog — a model enabled in the account (a new Claude
 * release) was unreachable from the console except by typing its id from memory.
 */
import { vi, describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import type { PlatformSettings } from '@/services/platformSettings.service';
import type { BedrockDiscovery } from '@/services/bedrockDiscovery.service';
import { chooseOption, listOptions } from '@/test/chooseOption';

const noopMutation = { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false, reset: vi.fn() };
let discovery: { data?: BedrockDiscovery; isLoading: boolean } = { data: undefined, isLoading: false };
const askedRegions: Array<string | undefined> = [];
vi.mock('@/hooks/usePlatformSettings', () => ({
  usePlatformBedrockModels: (region: string | undefined) => {
    askedRegions.push(region);
    return discovery;
  },
  usePlatformAiModels: () => ({ data: undefined, isLoading: false }),
  useUpdatePlatformAi: () => noopMutation,
  useSetPlatformSecret: () => noopMutation,
  useClearPlatformSecret: () => noopMutation,
}));
vi.mock('@/hooks/useBackendVersion', () => ({
  useBackendVersion: () => ({ data: { bedrockInstanceProfile: false }, isLoading: false }),
}));

const settings = {
  ai: {
    provider: { value: 'openai', source: 'db' },
    defaultModel: { value: 'gpt-5-mini', source: 'default' },
    strongModel: { value: null, source: 'default' },
    visionModel: { value: null, source: 'default' },
    defaultCostPer1k: { value: null, source: 'default' },
    strongCostPer1k: { value: null, source: 'default' },
    visionCostPer1k: { value: null, source: 'default' },
    baseUrl: { value: null, source: 'default' },
    organization: { value: null, source: 'default' },
    bedrockRegion: { value: 'eu-west-1', source: 'db' },
    bedrockRoleArn: { value: null, source: 'default' },
    bedrockExternalId: { value: null, source: 'default' },
    bedrockUseInstanceProfile: { value: null, source: 'default' },
    bedrockInferenceProfileArn: { value: null, source: 'default' },
    bedrockAccessKeyId: { configured: false, source: 'none' },
    bedrockSecretAccessKey: { configured: false, source: 'none' },
  },
  secrets: {},
} as unknown as PlatformSettings;

const { ManagedAiDefaultsCard } = await import('../ManagedAiDefaultsCard');

const LIVE: BedrockDiscovery = {
  payload: {
    source: 'live',
    fetchedAt: '2026-10-12T10:00:00Z',
    models: [
      { id: 'eu.anthropic.claude-example-9', name: 'Claude Example 9 (inference profile)', type: 'chat' },
      { id: 'anthropic.claude-example-9', name: 'Claude Example 9 (Anthropic)', type: 'chat', description: 'Anthropic · IMAGE' },
      { id: 'meta.text-only-example', name: 'Text Only (Meta)', type: 'chat', description: 'Meta' },
      { id: 'amazon.titan-embed-example', name: 'Titan Embed (Amazon)', type: 'embedding' },
    ],
  },
};

const renderBedrockEditing = async () => {
  render(<ManagedAiDefaultsCard ai={settings.ai} secrets={settings.secrets} />);
  fireEvent.click(screen.getByRole('button', { name: /edit|configure/i }));
  await chooseOption(screen.getByRole('combobox', { name: 'Provider' }), 'AWS Bedrock');
};

beforeEach(() => {
  discovery = { data: undefined, isLoading: false };
  askedRegions.length = 0;
});
afterEach(cleanup);

describe('Managed AI Defaults — live Bedrock models', () => {
  it('lists the live chat models and says the list is live', async () => {
    discovery = { data: LIVE, isLoading: false };
    await renderBedrockEditing();

    const labels = await listOptions(screen.getByRole('combobox', { name: 'Default tier — model' }));
    expect(labels.some((label) => label.includes('eu.anthropic.claude-example-9'))).toBe(true);
    expect(labels.some((label) => label.includes('amazon.titan-embed-example'))).toBe(false);
    // The built-in catalog is replaced, not merged.
    expect(labels.some((label) => label.includes('claude-haiku-4-5'))).toBe(false);
    expect(screen.getByText('Live from AWS · 3 chat models')).toBeInTheDocument();
    // Asked for the region in the form.
    expect(askedRegions).toContain('eu-west-1');
  });

  it('offers the vision tier models AWS lists with image input, and their inference profiles', async () => {
    discovery = { data: LIVE, isLoading: false };
    await renderBedrockEditing();
    const labels = await listOptions(screen.getByRole('combobox', { name: 'Vision tier — model' }));
    expect(labels.some((label) => label.includes('— anthropic.claude-example-9'))).toBe(true);
    // The profile fronts a vision model, so it is offered too.
    expect(labels.some((label) => label.includes('eu.anthropic.claude-example-9'))).toBe(true);
    // Control: a text-only model is not.
    expect(labels.some((label) => label.includes('meta.text-only-example'))).toBe(false);
  });

  it('keeps the built-in list and names the permission when AWS refuses', async () => {
    discovery = { data: { payload: null, reason: 'access_denied' }, isLoading: false };
    await renderBedrockEditing();
    const labels = await listOptions(screen.getByRole('combobox', { name: 'Default tier — model' }));
    expect(labels.some((label) => label.includes('claude-haiku-4-5'))).toBe(true);
    expect(screen.getByText(/bedrock:ListFoundationModels/)).toBeInTheDocument();
  });

  it('does not ask AWS while the card is read-only, and says nothing about a list it never loaded', () => {
    // Bedrock is the STORED provider. (The tier pickers and their source line render only in the
    // edit form — ConfigCard shows children while editing — so this pins the summary view.)
    const storedBedrock = {
      ...settings.ai,
      provider: { value: 'bedrock', source: 'db' },
    } as unknown as typeof settings.ai;
    render(<ManagedAiDefaultsCard ai={storedBedrock} secrets={settings.secrets} />);
    expect(askedRegions.every((region) => region === undefined)).toBe(true);
    expect(screen.queryByText(/Built-in list/)).not.toBeInTheDocument();
  });
});
