/**
 * The cost-rates card is MOUNTED on the page an admin actually opens, with the workspace's AI
 * providers in it — and only those. A card that exists but is never rendered (or renders the
 * local-embeddings row, which bills nothing) passes every test of the card itself.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AIProvidersSettings } from '../AIProvidersSettings';

const rows = [
  { id: 11, organizationId: 5, name: 'Our OpenAI', type: 'openai', enabled: true, config: {}, inputCostPer1M: 0.4, outputCostPer1M: 1.6 },
  { id: 12, organizationId: 5, name: 'Local embeddings', type: 'local_embeddings', enabled: true, config: {} },
];

vi.mock('@/services/organization.service', () => ({
  organizationService: { getAiMode: () => Promise.resolve('byo') },
}));
vi.mock('@/services/onboarding.service', () => ({
  onboardingService: { getStatus: () => Promise.resolve({ managedAiAvailable: false }) },
}));
vi.mock('@/services/integrations.service', () => ({
  integrationsService: {
    getAll: () => Promise.resolve({ success: true, data: rows }),
    test: vi.fn(),
    updateAiCostRates: vi.fn(),
  },
}));
vi.mock('@/services/ai.service', () => ({
  aiService: { getModels: () => Promise.resolve({ success: false }) },
}));
vi.mock('@/lib/socketManager', () => ({ subscribeToEvent: vi.fn(), unsubscribeFromEvent: vi.fn() }));
vi.mock('@/components/settings/AckReplyPerSourceList', () => ({ AckReplyPerSourceList: () => null }));
vi.mock('@/components/settings/VisionSettings', () => ({ VisionSettings: () => null }));
vi.mock('@/components/settings/AIProviderHealthCheck', () => ({ AIProviderHealthCheck: () => null }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const renderPage = (showCostRates = true) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <AIProvidersSettings showModeSwitch showCostRates={showCostRates} />
    </QueryClientProvider>
  );

describe('AIProvidersSettings — cost rates', () => {
  it("shows the card with the provider's stored rates", async () => {
    renderPage();
    const input = await screen.findByLabelText<HTMLInputElement>('Our OpenAI input cost per 1M tokens');
    expect(screen.getByText('Cost rates')).toBeTruthy();
    expect(input.value).toBe('0.4');
  });

  it('does not offer rates for local embeddings, which bill nothing', async () => {
    renderPage();
    await screen.findByLabelText('Our OpenAI input cost per 1M tokens');
    expect(screen.queryByLabelText('Local embeddings input cost per 1M tokens')).toBeNull();
  });

  it('stays out of the onboarding wizard, which renders this page without the flag', async () => {
    renderPage(false);
    await screen.findByText(/Two kinds of auto-reply/);
    expect(screen.queryByText('Cost rates')).toBeNull();
  });
});
