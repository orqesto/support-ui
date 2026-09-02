/**
 * Testing the managed AI defaults.
 *
 * ⛔ Saving this card already succeeds when the key is wrong. There was no Test button at all —
 * its sibling `DefaultStorageCard` has had one all along — so a typo saved green and the first
 * sign of trouble was managed workspaces silently failing to get replies. This is the PLATFORM
 * key: one bad value breaks every managed workspace at once, and it is the key that burned ~$18
 * in 18 hours when it was pointed at the wrong workload.
 *
 * 🔑 The assertion that carries the most weight is `shows the provider's own words`. A button
 * that reports a bare "failed" sends an admin nowhere; "Incorrect API key provided" and "model
 * does not exist" send them to two different fixes, and passing that text through is the entire
 * point of the endpoint answering 200 with `ok: false` rather than throwing a status code.
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
// Type-only namespace import: an inline `typeof import(...)` is banned by
// consistent-type-imports, and this gives `importOriginal` its module type without a value
// import of a module this file mocks. `PlatformSettings` comes off the same namespace so the
// module is imported exactly once (import/no-duplicates).
import type * as platformSettingsModule from '@/services/platformSettings.service';

type PlatformSettings = platformSettingsModule.PlatformSettings;

const testManagedAi = vi.fn();

vi.mock('@/services/platformSettings.service', async (importOriginal) => {
  const actual = await importOriginal<typeof platformSettingsModule>();
  return {
    ...actual,
    platformSettingsService: { ...actual.platformSettingsService, testManagedAi },
  };
});

const noopMutation = { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false, reset: vi.fn() };
vi.mock('@/hooks/usePlatformSettings', () => ({
  usePlatformAiModels: () => ({ data: undefined, isLoading: false }),
  useUpdatePlatformAi: () => noopMutation,
  useSetPlatformSecret: () => noopMutation,
  useClearPlatformSecret: () => noopMutation,
}));

const settings = {
  ai: {
    provider: { value: 'openai', source: 'db' },
    defaultModel: { value: 'gpt-4o-mini', source: 'db' },
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
  },
  secrets: {},
} as unknown as PlatformSettings;

const renderCard = async () => {
  const { ManagedAiDefaultsCard } = await import(
    '@/components/console/platformDefaults/ManagedAiDefaultsCard'
  );
  return render(<ManagedAiDefaultsCard ai={settings.ai} secrets={settings.secrets} />);
};

beforeEach(() => {
  testManagedAi.mockReset();
});
afterEach(cleanup);

describe('Managed AI Defaults — Test connection', () => {
  it('offers a Test connection button at all — the gap this closes', async () => {
    await renderCard();
    expect(screen.getByRole('button', { name: /test connection/i })).toBeInTheDocument();
  });

  it('reports the provider and model that actually answered', async () => {
    testManagedAi.mockResolvedValue({
      ok: true,
      provider: 'openai',
      model: 'gpt-4o-mini',
      latencyMs: 412,
    });
    await renderCard();
    fireEvent.click(screen.getByRole('button', { name: /test connection/i }));

    await waitFor(() =>
      expect(screen.getByText(/openai answered with gpt-4o-mini/i)).toBeInTheDocument()
    );
    // Naming the model matters: a key can be valid and still have no access to the model this
    // platform is configured to use, which is a different fix from a bad key.
    expect(screen.getByText(/412ms/)).toBeInTheDocument();
  });

  it("⛔ shows the provider's OWN words when it fails, not a generic failure", async () => {
    testManagedAi.mockResolvedValue({
      ok: false,
      provider: 'openai',
      reason: 'Incorrect API key provided: sk-proj-****',
    });
    await renderCard();
    fireEvent.click(screen.getByRole('button', { name: /test connection/i }));

    await waitFor(() =>
      expect(screen.getByText(/Incorrect API key provided/i)).toBeInTheDocument()
    );
  });

  it('says WHY managed AI is unusable when there is nothing to test', async () => {
    testManagedAi.mockResolvedValue({ ok: false, reason: 'No API key is stored for openai.' });
    await renderCard();
    fireEvent.click(screen.getByRole('button', { name: /test connection/i }));

    await waitFor(() =>
      expect(screen.getByText(/No API key is stored for openai/i)).toBeInTheDocument()
    );
  });

  it('surfaces a thrown request error rather than staying silent', async () => {
    testManagedAi.mockRejectedValue(new Error('Network unreachable'));
    await renderCard();
    fireEvent.click(screen.getByRole('button', { name: /test connection/i }));

    await waitFor(() => expect(screen.getByText(/Network unreachable/i)).toBeInTheDocument());
  });
});
