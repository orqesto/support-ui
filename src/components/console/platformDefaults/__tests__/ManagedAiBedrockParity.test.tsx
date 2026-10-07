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
import { chooseOption, listOptions } from '@/test/chooseOption';

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

/** `undefined` = the version query has not answered yet. */
let backendVersionData: { bedrockInstanceProfile: boolean } | undefined = {
  bedrockInstanceProfile: false,
};
vi.mock('@/hooks/useBackendVersion', () => ({
  useBackendVersion: () => ({
    data: backendVersionData,
    isLoading: backendVersionData === undefined,
  }),
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
const switchToBedrock = () =>
  chooseOption(screen.getByRole('combobox', { name: 'Provider' }), 'AWS Bedrock');

afterEach(cleanup);

describe('Managed AI Defaults — testing while editing', () => {
  // A probe of the STORED provider under a Bedrock draft read as "Bedrock is broken" when it
  // was OpenAI being probed (2026-09-07). The editor therefore offers no test of what is stored
  // at all — only "Save and test", which probes the draft once it IS stored (2026-09-30).
  it('offers only Save and test, and says the stored provider serves traffic until saved', async () => {
    renderEditing();
    await switchToBedrock();
    expect(screen.queryByRole('button', { name: /^test connection/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save and test/i })).toBeEnabled();
    expect(screen.getByText(/Save and test stores this draft/)).toHaveTextContent(
      /managed traffic stays on OpenAI/
    );
  });

  it('CONTROL: Test connection on the read-only view', () => {
    render(<ManagedAiDefaultsCard ai={settings.ai} secrets={settings.secrets} />);
    expect(screen.getByRole('button', { name: /^test connection/i })).toBeEnabled();
    expect(screen.queryByText(/Save and test stores this draft/)).not.toBeInTheDocument();
  });
});

describe('Managed AI Defaults — Bedrock parity with the workspace card', () => {
  it('lists the curated catalog (Claude Haiku 4.5 first), not the stale server list', async () => {
    renderEditing();
    await switchToBedrock();
    const labels = await listOptions(
      screen.getByRole('combobox', { name: 'Default tier — model' })
    );
    expect(
      labels.some((label) => label.includes('eu.anthropic.claude-haiku-4-5-20251001-v1:0'))
    ).toBe(true);
    // Embeddings cannot serve a tier and must not be offered.
    expect(labels.some((label) => label.includes('amazon.titan-embed-text-v2:0'))).toBe(false);
  });

  it("does not name the stored provider's model as the default of another provider", async () => {
    renderEditing();
    await switchToBedrock();
    expect(screen.queryByText(/Use the default \(gpt-5-mini\)/)).not.toBeInTheDocument();
    expect(screen.getAllByText("Use this provider's default").length).toBeGreaterThan(0);
  });

  it('gates the instance-profile switch exactly like the workspace card', async () => {
    backendVersionData = { bedrockInstanceProfile: false };
    renderEditing();
    await switchToBedrock();
    expect(screen.getByRole('switch')).toBeDisabled();
    expect(screen.getByText(/Not available on this deployment/)).toBeInTheDocument();
    cleanup();
    backendVersionData = { bedrockInstanceProfile: true };
    renderEditing();
    await switchToBedrock();
    expect(screen.getByRole('switch')).toBeEnabled();
    expect(screen.queryByText(/Not available on this deployment/)).not.toBeInTheDocument();
  });

  // Found reviewing the first cut: `data?.bedrockInstanceProfile ?? false` read a LOADING
  // version as "not allowed", so the switch rendered disabled and a Save in that window
  // persisted `false` over a stored `true` on the very box where the mode works.
  it('does not gate, and does not clear the switch, while the version is still unknown', async () => {
    backendVersionData = undefined;
    renderEditing();
    await switchToBedrock();
    const toggle = screen.getByRole('switch');
    expect(toggle).toBeEnabled();
    expect(screen.queryByText(/Not available on this deployment/)).not.toBeInTheDocument();
    fireEvent.click(toggle);
    fireEvent.click(screen.getByRole('button', { name: /save ai defaults/i }));
    expect(noopMutation.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'bedrock', bedrockUseInstanceProfile: true }),
      expect.anything()
    );
  });
});
