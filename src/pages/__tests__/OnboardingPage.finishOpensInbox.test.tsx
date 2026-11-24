import { vi, describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { create } from 'zustand';

/**
 * Finish must open the inbox. The wizard marks the workspace complete and then navigates to
 * /threads; the page around it bounces a COMPLETE workspace to /dashboard, and that bounce must
 * not fire for the completion the wizard just made itself, or it overrides the inbox.
 * A workspace that is already complete when the page opens is still sent to the dashboard.
 */

type Status = 'unknown' | 'pending' | 'complete';
const store = vi.hoisted(() => ({ current: null as unknown as ReturnType<typeof makeStore> }));
const makeStore = (status: Status) =>
  create<{ status: Status; fetchOnce: () => void; markComplete: () => void }>((set) => ({
    status,
    fetchOnce: () => undefined,
    markComplete: () => set({ status: 'complete' }),
  }));

vi.mock('@/stores/onboardingStore', () => ({
  useOnboardingStore: (pick: (state: unknown) => unknown) => store.current(pick as never),
}));
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (pick: (state: unknown) => unknown) =>
    pick({ user: { role: 'user', organizationRole: 'org_admin' }, selectedOrganizationId: 7 }),
}));
vi.mock('@/stores/subscriptionGateStore', () => ({
  useSubscriptionGateStore: (pick: (state: unknown) => unknown) => pick({ gated: false }),
}));
// The wizard's own leave path: mark complete, then open the inbox (OnboardingWizard.leaveWizard).
vi.mock('@/components/onboarding/OnboardingWizard', () => ({
  OnboardingWizard: () => {
    const navigate = useNavigate();
    const markComplete = store.current((state) => state.markComplete);
    return (
      <button
        type="button"
        onClick={() => {
          markComplete();
          navigate('/threads', { replace: true });
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

afterEach(cleanup);

describe('OnboardingPage around a finishing wizard', () => {
  it('Finish lands on the inbox, not the dashboard', async () => {
    store.current = makeStore('pending');
    renderAt();
    fireEvent.click(await screen.findByRole('button', { name: 'Finish' }));
    expect(await screen.findByText('inbox-page')).toBeInTheDocument();
    expect(screen.queryByText('dashboard-page')).not.toBeInTheDocument();
  });

  it('setup finished in another tab while the wizard is open still leaves for the dashboard', async () => {
    store.current = makeStore('pending');
    renderAt();
    await screen.findByRole('button', { name: 'Finish' });
    act(() => store.current.setState({ status: 'complete' }));
    expect(await screen.findByText('dashboard-page')).toBeInTheDocument();
  });

  it('a workspace that is already complete on arrival still goes to the dashboard', async () => {
    store.current = makeStore('complete');
    renderAt();
    expect(await screen.findByText('dashboard-page')).toBeInTheDocument();
  });
});
