/**
 * v1.1.300 release audit A-F1 / A-F4 (2026-10-23): Settings › AI shows the mode the workspace RUNS
 * on, not only the stored `settings.aiMode`.
 * - A workspace with no stored choice that the backend runs on our AI shows "Use our AI" selected,
 *   not "No AI provider configured".
 * - "Bring your own keys" writes the choice even when it is what runs now and nothing is stored.
 * - Free: the "Use our AI" card never says "Included in your plan"; a FREE_AI_ALLOWANCE_USED
 *   refusal turns it into the used-up card.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AIProvidersSettings } from '../AIProvidersSettings';
import { managedCardText } from '../AiProviderModeSwitch';

let modeState: { resolved: 'byo' | 'managed'; stored: 'byo' | 'managed' | undefined };
const setAiModeSelf = vi.fn<(mode: string) => Promise<unknown>>();
let planName: string | undefined;
let usageAi: Record<string, unknown> | undefined;

vi.mock('@/services/organization.service', () => ({
  organizationService: {
    getAiModeState: () => Promise.resolve(modeState),
    setAiModeSelf: (mode: string) => setAiModeSelf(mode),
  },
}));
vi.mock('@/services/subscription.service', () => ({
  subscriptionService: {
    getPlanName: () => Promise.resolve(planName),
    getUsage: () => Promise.resolve(usageAi ? { ai: usageAi } : {}),
  },
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
vi.mock('@/components/settings/AIProviderHealthCheck', () => ({
  AIProviderHealthCheck: () => <div>AI provider health panel</div>,
}));
vi.mock('@/components/settings/AINoProviderBanner', () => ({
  AINoProviderBanner: () => <div>No AI provider configured</div>,
}));

const renderPage = () =>
  render(
    <MemoryRouter>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <AIProvidersSettings showModeSwitch />
      </QueryClientProvider>
    </MemoryRouter>
  );

beforeEach(() => {
  modeState = { resolved: 'byo', stored: undefined };
  planName = 'pro';
  usageAi = undefined;
  setAiModeSelf.mockReset().mockResolvedValue({ aiMode: 'byo' });
});
afterEach(cleanup);

describe('AIProvidersSettings: the resolved mode (A-F1)', () => {
  it('nothing stored, runs on our AI: "Use our AI" is selected, no "No AI provider configured"', async () => {
    modeState = { resolved: 'managed', stored: undefined };
    renderPage();
    expect(await screen.findByText(/nothing\s+to configure here/)).toBeTruthy();
    expect(screen.queryByText('No AI provider configured')).toBeNull();
    await waitFor(() =>
      expect(screen.getByRole('button', { pressed: true }).textContent).toMatch(/Use our AI/)
    );
  });

  it('nothing stored, resolved to own keys: "Bring your own keys" still writes the choice', async () => {
    renderPage();
    const byo = await screen.findByRole('button', { name: /Bring your own keys/ });
    await waitFor(() => expect(byo.getAttribute('aria-pressed')).toBe('true'));
    fireEvent.click(byo);
    await waitFor(() => expect(setAiModeSelf).toHaveBeenCalledWith('byo'));
  });

  it('CONTROL: own keys already STORED — clicking it again writes nothing', async () => {
    modeState = { resolved: 'byo', stored: 'byo' };
    renderPage();
    const byo = await screen.findByRole('button', { name: /Bring your own keys/ });
    await waitFor(() => expect(byo.getAttribute('aria-pressed')).toBe('true'));
    fireEvent.click(byo);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(setAiModeSelf).not.toHaveBeenCalled();
  });

  it('shows why no AI runs (verify email) on the page', async () => {
    usageAi = {
      currency: 'USD',
      active: true,
      paused: false,
      reason: null,
      unavailableReason: 'admin_not_verified',
    };
    renderPage();
    expect(await screen.findByTestId('ai-unavailable-notice')).toBeTruthy();
  });
});

describe('Free: "Use our AI" wording (A-F4)', () => {
  it('Free with no allowance block: one-time starter allowance, never "Included in your plan"', async () => {
    planName = 'free';
    renderPage();
    await waitFor(() =>
      expect(screen.getByTestId('managed-ai-card-text').textContent).toMatch(
        /one-time starter allowance/
      )
    );
    expect(screen.getByTestId('managed-ai-card-text').textContent).not.toMatch(/Included in your plan/);
  });

  it('Free with an allowance: shows what is left', () => {
    const text = managedCardText(
      { totalMicros: 400_000, usedMicros: 100_000, remainingMicros: 300_000, exhausted: false, microsPerMessage: 4_000 },
      true
    );
    expect(text).toMatch(/about 75 of 100 messages left/);
    expect(text).not.toMatch(/Included in your plan/);
  });

  it('CONTROL: a paid plan keeps "Included in your plan"', () => {
    expect(managedCardText(undefined, false)).toMatch(/Included in your plan/);
  });

  it('a FREE_AI_ALLOWANCE_USED refusal turns the card into the used-up card', async () => {
    planName = 'free';
    setAiModeSelf.mockRejectedValue(
      Object.assign(new Error('refused'), {
        data: { code: 'FREE_AI_ALLOWANCE_USED', message: 'used' },
      })
    );
    renderPage();
    const ours = await screen.findByRole('button', { name: /Use our AI/ });
    fireEvent.click(ours);
    expect(await screen.findByTestId('managed-ai-starter-used')).toBeTruthy();
    expect(
      await screen.findByText('Your free AI allowance is used. Connect your own provider, or upgrade your plan.')
    ).toBeTruthy();
  });
});
