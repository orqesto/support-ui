/**
 * Owner, 2026-09-07, two screenshots: the platform card with AWS Bedrock selected and unsaved
 * said "Not working: No API key is stored for openai" on Test connection, while the workspace
 * Bedrock card on the same host passed on its EC2 instance profile.
 *
 * Three things were true at once and none was said on screen:
 *   1. Test connection probes what is STORED (the key never reaches the browser), so an
 *      unsaved provider switch tests the OLD provider — and the result named it, which read
 *      as "Bedrock is broken".
 *   2. The tier placeholder printed the stored provider's resolved model ("Use the default
 *      (gpt-5-mini)") under Bedrock.
 *   3. The platform card's Bedrock catalog came from the server list, which had drifted behind
 *      the workspace card's curated list (no Claude Haiku 4.5) — and the instance-profile
 *      switch was offered live on a deployment where the server ignores it.
 */
import { vi, describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import type { PlatformSettings } from '@/services/platformSettings.service';

const noopMutation = { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false, reset: vi.fn() };
vi.mock('@/hooks/usePlatformSettings', () => ({
  // The server's Bedrock list is deliberately STALE here: the card must not use it.
  usePlatformAiModels: () => ({
    data: {
      openai: [{ id: 'gpt-5-mini', name: 'GPT-5 mini', type: 'chat', contextWindow: 1 }],
      bedrock: [
        {
          id: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
          name: 'Claude 3.5 Sonnet',
          type: 'chat',
          contextWindow: 1,
        },
      ],
    },
    isLoading: false,
  }),
  useUpdatePlatformAi: () => noopMutation,
  useSetPlatformSecret: () => noopMutation,
  useClearPlatformSecret: () => noopMutation,
}));

let bedrockInstanceProfile = false;
vi.mock('@/hooks/useBackendVersion', () => ({
  useBackendVersion: () => ({ data: { bedrockInstanceProfile }, isLoading: false }),
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
    bedrockRegion: { value: null, source: 'default' },
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

const renderEditing = () => {
  render(<ManagedAiDefaultsCard ai={settings.ai} secrets={settings.secrets} />);
  fireEvent.click(screen.getByRole('button', { name: /edit|configure/i }));
};
const switchToBedrock = () => {
  const providerSelect = screen.getAllByRole('combobox')[0];
  fireEvent.change(providerSelect, { target: { value: 'bedrock' } });
};

afterEach(cleanup);

describe('Managed AI Defaults — Test connection while editing', () => {
  it('is disabled and says it would test the STORED provider, not the draft', () => {
    renderEditing();
    switchToBedrock();
    expect(screen.getByRole('button', { name: /test connection/i })).toBeDisabled();
    expect(screen.getByText(/Save first/)).toHaveTextContent(/stored defaults \(OpenAI\)/);
  });

  it('CONTROL: enabled on the read-only view', () => {
    render(<ManagedAiDefaultsCard ai={settings.ai} secrets={settings.secrets} />);
    expect(screen.getByRole('button', { name: /test connection/i })).toBeEnabled();
    expect(screen.queryByText(/Save first/)).not.toBeInTheDocument();
  });
});

describe('Managed AI Defaults — Bedrock parity with the workspace card', () => {
  it('lists the curated catalog (Claude Haiku 4.5 first), not the stale server list', () => {
    renderEditing();
    switchToBedrock();
    const labels = screen.getAllByRole('option').map((option) => option.textContent ?? '');
    expect(
      labels.some((label) => label.includes('eu.anthropic.claude-haiku-4-5-20251001-v1:0'))
    ).toBe(true);
    // Embeddings cannot serve a tier and must not be offered.
    expect(labels.some((label) => label.includes('amazon.titan-embed-text-v2:0'))).toBe(false);
  });

  it("does not name the stored provider's model as the default of another provider", () => {
    renderEditing();
    switchToBedrock();
    expect(screen.queryByText(/Use the default \(gpt-5-mini\)/)).not.toBeInTheDocument();
    expect(screen.getAllByText("Use this provider's default").length).toBeGreaterThan(0);
  });

  it('gates the instance-profile switch exactly like the workspace card', () => {
    bedrockInstanceProfile = false;
    renderEditing();
    switchToBedrock();
    expect(screen.getByRole('switch')).toBeDisabled();
    expect(screen.getByText(/Not available on this deployment/)).toBeInTheDocument();
    cleanup();
    bedrockInstanceProfile = true;
    renderEditing();
    switchToBedrock();
    expect(screen.getByRole('switch')).toBeEnabled();
    expect(screen.queryByText(/Not available on this deployment/)).not.toBeInTheDocument();
  });
});
