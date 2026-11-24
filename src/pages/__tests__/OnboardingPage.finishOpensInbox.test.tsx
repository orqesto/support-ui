import { vi, describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useNavigate } from 'react-router-dom';

/**
 * Finish must open the inbox. The wizard marks the workspace complete and then navigates to
 * /threads; the page around it sends a COMPLETE workspace to /dashboard, and that must not fire
 * for the completion the wizard made itself. In the browser the router's navigation is a React
 * transition that can commit AFTER the store update and any timer, so the page must not rely on
 * timing: a completion marked by the wizard never bounces, however long the navigation takes.
 * Setup finished elsewhere, or already complete on arrival, still goes to the dashboard.
 * Uses the real onboarding store; only its HTTP service is stubbed.
 */

const service = vi.hoisted(() => ({
  status: { isComplete: false, onboarding: { status: 'pending' }, trial: null } as {
    isComplete: boolean;
    onboarding: { status: string };
    trial: null;
  },
}));
vi.mock('@/services/onboarding.service', () => ({
  onboardingService: { getStatus: () => Promise.resolve(service.status) },
}));
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (pick: (state: unknown) => unknown) =>
    pick({ user: { role: 'user', organizationRole: 'org_admin' }, selectedOrganizationId: 7 }),
}));
vi.mock('@/stores/subscriptionGateStore', () => ({
  useSubscriptionGateStore: (pick: (state: unknown) => unknown) => pick({ gated: false }),
}));

const { useOnboardingStore } = await import('@/stores/onboardingStore');

// The wizard's two ways out (OnboardingWizard.leaveWizard): mark complete then navigate, or (to
// model the transition that has not committed yet) mark complete and navigate only later.
const leave = vi.hoisted(() => ({ navigateNow: true }));
vi.mock('@/components/onboarding/OnboardingWizard', () => ({
  OnboardingWizard: () => {
    const navigate = useNavigate();
    const markComplete = useOnboardingStore((state) => state.markComplete);
    return (
      <button
        type="button"
        onClick={() => {
          markComplete();
          if (leave.navigateNow) navigate('/threads', { replace: true });
        }}
      >
        Finish
      </button>
    );
  },
}));

const { OnboardingPage } = await import('../OnboardingPage');

const renderAt = () =>
  render(
    <MemoryRouter initialEntries={['/onboarding']}>
      <Routes>
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route path="/threads" element={<div>inbox-page</div>} />
        <Route path="/dashboard" element={<div>dashboard-page</div>} />
      </Routes>
    </MemoryRouter>
  );

const resetStore = () =>
  useOnboardingStore.setState({ status: 'unknown', onboarding: null, fetchedForOrg: null });

beforeEach(() => {
  leave.navigateNow = true;
  service.status = { isComplete: false, onboarding: { status: 'pending' }, trial: null };
  resetStore();
});
afterEach(cleanup);

describe('OnboardingPage around a finishing wizard', () => {
  it('Finish lands on the inbox, not the dashboard', async () => {
    renderAt();
    fireEvent.click(await screen.findByRole('button', { name: 'Finish' }));
    expect(await screen.findByText('inbox-page')).toBeInTheDocument();
    expect(screen.queryByText('dashboard-page')).not.toBeInTheDocument();
  });

  it('does not bounce on its own completion while the navigation is still pending', async () => {
    leave.navigateNow = false;
    renderAt();
    fireEvent.click(await screen.findByRole('button', { name: 'Finish' }));
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
    expect(screen.queryByText('dashboard-page')).not.toBeInTheDocument();
  });

  it('setup finished in another tab while the wizard is open still leaves for the dashboard', async () => {
    renderAt();
    await screen.findByRole('button', { name: 'Finish' });
    act(() => useOnboardingStore.setState({ status: 'complete' }));
    expect(await screen.findByText('dashboard-page')).toBeInTheDocument();
  });

  it('a workspace already complete on arrival goes to the dashboard, even after an earlier Finish', async () => {
    renderAt();
    fireEvent.click(await screen.findByRole('button', { name: 'Finish' }));
    await screen.findByText('inbox-page');
    cleanup();
    resetStore();
    service.status = { isComplete: true, onboarding: { status: 'completed' }, trial: null };
    renderAt();
    expect(await screen.findByText('dashboard-page')).toBeInTheDocument();
  });
});
