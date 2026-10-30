import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

/**
 * The last step's Finish button, rendered through the real wizard — the gate's helper is
 * unit-tested in wizardSteps.test.ts, but only this proves the wizard reads the plan.
 *
 * Staging 2026-10-30: a new signup on Free that skipped Channels reached the Payment step
 * with "Finish without a card" disabled and "connect a channel", although the Channels
 * step offered "Skip this step". Owner: Free may finish without a channel; paid may not.
 *
 * The steps are stubbed: each has its own tests, and this is about the footer gate only.
 */

vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));

vi.mock('../steps/AiChoiceStep', () => ({ AiChoiceStep: () => null }));
vi.mock('../steps/ChannelsStep', () => ({ ChannelsStep: () => null }));
vi.mock('../steps/DatabaseStep', () => ({ DatabaseStep: () => null }));
vi.mock('../steps/InviteTeamStep', () => ({ InviteTeamStep: () => null }));
vi.mock('../steps/KbStep', () => ({ KbStep: () => null }));
vi.mock('../steps/PaymentStep', () => ({ PaymentStep: () => null }));
vi.mock('../steps/StorageStep', () => ({ StorageStep: () => null }));
vi.mock('../SetupReconcileNotice', () => ({ SetupReconcileNotice: () => null }));
vi.mock('@/components/layout/ThemeToggle', () => ({ ThemeToggle: () => null }));

vi.mock('@/hooks/useBackendVersion', () => ({
  useBackendVersion: () => ({ data: { billingEnabled: true } }),
}));

vi.mock('@/stores/authStore', () => ({
  useAuthStore: (pick: (store: { user: { role: string } }) => unknown) =>
    pick({ user: { role: 'org_admin' } }),
}));

const onboardingStore = {
  onboarding: { status: 'pending', currentStep: 7, aiChoice: 'managed' },
  managedAiAvailable: true,
  database: { managedAllowed: true, current: { mode: 'managed' } },
  markComplete: vi.fn(),
  refresh: vi.fn(() => Promise.resolve()),
  setDatabaseCurrent: vi.fn(),
};
vi.mock('@/stores/onboardingStore', () => ({
  useOnboardingStore: (pick: (store: typeof onboardingStore) => unknown) => pick(onboardingStore),
}));

vi.mock('@/services/onboarding.service', () => ({
  onboardingService: {
    getSetupStatus: () => Promise.resolve({ allSatisfied: false, steps: [] }),
    updateProgress: () => Promise.resolve({}),
    complete: () => Promise.resolve(null),
    skip: () => Promise.resolve(null),
    reconcile: () => Promise.resolve({ isComplete: false }),
  },
}));

// No channel connected — the case the gate is about.
vi.mock('@/services/integrations.service', () => ({
  integrationsService: { getAll: () => Promise.resolve({ success: true, data: [] }) },
}));

const getPlanState = vi.fn<() => Promise<Record<string, string>>>();
vi.mock('@/services/subscription.service', () => ({
  subscriptionService: { getPlanState: () => getPlanState(), chooseFree: vi.fn() },
}));

const { OnboardingWizard } = await import('../OnboardingWizard');

const finishButton = async () => screen.findByRole('button', { name: /Finish without a card/ });

describe('wizard Finish gate — channel', () => {
  beforeEach(() => {
    getPlanState.mockReset();
  });
  afterEach(cleanup);

  it('lets a trial that ends on Free finish with no channel connected', async () => {
    getPlanState.mockResolvedValue({
      name: 'free',
      status: 'trialing',
      cancellationRoute: 'local',
    });
    render(<OnboardingWizard />);

    const button = await finishButton();
    await vi.waitFor(() => expect(getPlanState).toHaveBeenCalled());
    await vi.waitFor(() => expect(button).toBeEnabled());
    expect(screen.queryByRole('button', { name: 'connect a channel' })).not.toBeInTheDocument();
  });

  it('keeps Finish disabled on a paid plan with no channel, and says why', async () => {
    getPlanState.mockResolvedValue({
      name: 'pro',
      status: 'trialing',
      cancellationRoute: 'stripe',
    });
    render(<OnboardingWizard />);

    expect(await screen.findByRole('button', { name: 'connect a channel' })).toBeInTheDocument();
    expect(await finishButton()).toBeDisabled();
  });

  it('does not trap the user when the plan cannot be read', async () => {
    getPlanState.mockResolvedValue({});
    render(<OnboardingWizard />);

    const button = await finishButton();
    await vi.waitFor(() => expect(getPlanState).toHaveBeenCalled());
    await vi.waitFor(() => expect(button).toBeEnabled());
  });
});
