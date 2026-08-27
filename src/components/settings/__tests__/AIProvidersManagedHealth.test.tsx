/**
 * "Use our AI" must say whether the AI is working, not only that there is nothing to
 * configure.
 *
 * Managed mode has no `ai_providers` row, so `hasAnyProvider` was false and the health
 * panel — the only thing on this tab that reports whether the AI actually works — never
 * mounted. The page said "nothing to configure here", which an admin reasonably reads as
 * a status and which is not one. The backend reports a platform entry for this case.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AIProvidersSettings } from '../AIProvidersSettings';

const getAiMode = vi.fn();

vi.mock('@/services/organization.service', () => ({
  organizationService: { getAiMode: () => getAiMode() as unknown },
}));
vi.mock('@/services/onboarding.service', () => ({
  onboardingService: { getStatus: () => Promise.resolve({ managedAiAvailable: true }) },
}));
vi.mock('@/services/integrations.service', () => ({
  integrationsService: { getAll: () => Promise.resolve({ data: [] }), test: vi.fn() },
}));
vi.mock('@/services/ai.service', () => ({
  aiService: { getModels: () => Promise.resolve({ success: false }) },
}));
vi.mock('@/lib/socketManager', () => ({
  subscribeToEvent: vi.fn(),
  unsubscribeFromEvent: vi.fn(),
}));
vi.mock('@/components/settings/AckReplyPerSourceList', () => ({
  AckReplyPerSourceList: () => null,
}));
vi.mock('@/components/settings/VisionSettings', () => ({ VisionSettings: () => null }));
// The panel under test is identified by a stand-in: this asserts that the page MOUNTS it
// in managed mode, which is the defect. What it renders is its own component's business.
vi.mock('@/components/settings/AIProviderHealthCheck', () => ({
  AIProviderHealthCheck: () => <div>AI provider health panel</div>,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// The BYO branch renders provider cards that fetch through react-query, so the control
// case needs a client even though the managed branch does not.
const renderPage = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <AIProvidersSettings showModeSwitch />
    </QueryClientProvider>
  );

describe('AIProvidersSettings — managed mode', () => {
  it('shows the health panel when the workspace uses our AI', async () => {
    getAiMode.mockResolvedValue('managed');

    renderPage();

    expect(await screen.findByText('AI provider health panel')).toBeTruthy();
  });

  it('still explains there is nothing to configure', async () => {
    // The banner is not replaced by the panel — both facts belong on the page.
    getAiMode.mockResolvedValue('managed');

    renderPage();

    expect(await screen.findByText(/nothing\s+to configure here/)).toBeTruthy();
  });

  it('shows no health panel for a BYO workspace with no provider yet', async () => {
    // CONTROL. The panel is gated on having something to report; a BYO org with zero
    // providers is the case that gate was written for, and it must keep working.
    getAiMode.mockResolvedValue('byo');

    renderPage();

    await waitFor(() => expect(screen.queryByText(/Managed AI is on/)).toBeNull());
    expect(screen.queryByText('AI provider health panel')).toBeNull();
  });
});
