/**
 * The gate overlay is the lapsed workspace's only door back. It must let the user reach the page
 * where they can move to Free (`/pricing`) — it used to cover that page and say only "contact us".
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

const navigate = vi.fn();
let pathname = '/messages';
vi.mock('react-router-dom', () => ({
  useNavigate: () => navigate,
  useLocation: () => ({ pathname }),
}));
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (select: (state: { logout: () => void }) => unknown) => select({ logout: vi.fn() }),
}));
type GateState = { gated: boolean; message: string; code: string | null; canChoosePlan: boolean | null };
let gate: GateState = { gated: true, message: 'Your free trial has expired.', code: null, canChoosePlan: null };
vi.mock('@/stores/subscriptionGateStore', () => ({
  useSubscriptionGateStore: (select: (state: GateState) => unknown) => select(gate),
}));

const { SubscriptionGateOverlay } = await import('@/components/subscription/SubscriptionGateOverlay');

describe('SubscriptionGateOverlay — the way back for a lapsed workspace', () => {
  beforeEach(() => {
    navigate.mockReset();
    pathname = '/messages';
    gate = { gated: true, message: 'Your free trial has expired.', code: null, canChoosePlan: null };
  });
  afterEach(cleanup);

  it('offers "Choose a plan" (Free included) and takes the user to /pricing', () => {
    render(<SubscriptionGateOverlay />);
    expect(screen.getByText(/Free included/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Choose a plan' }));
    expect(navigate).toHaveBeenCalledWith('/pricing');
  });

  it('stays out of the way on /pricing, where the switch happens', () => {
    pathname = '/pricing';
    const { container } = render(<SubscriptionGateOverlay />);
    expect(container).toBeEmptyDOMElement();
  });

  it('control: still stays out of the way on /subscription', () => {
    pathname = '/subscription';
    const { container } = render(<SubscriptionGateOverlay />);
    expect(container).toBeEmptyDOMElement();
  });

  describe('task #8 — a trial that ended, and who may choose', () => {
    it('an admin is told the trial ended and gets the choice', () => {
      gate = { gated: true, message: 'Choose a plan to continue — Free included.', code: 'SUBSCRIPTION_TRIAL_EXPIRED', canChoosePlan: true };
      render(<SubscriptionGateOverlay />);
      expect(screen.getByRole('heading', { name: 'Your free trial has ended' })).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Choose a plan' }));
      expect(navigate).toHaveBeenCalledWith('/pricing');
    });

    it('anyone else is told an admin has been asked — and gets no button that can only be refused', () => {
      gate = { gated: true, message: 'An admin of this workspace needs to choose a plan to continue.', code: 'SUBSCRIPTION_TRIAL_EXPIRED', canChoosePlan: false };
      render(<SubscriptionGateOverlay />);
      expect(screen.getByRole('heading', { name: 'Your free trial has ended' })).toBeInTheDocument();
      expect(screen.getByText(/An admin of this workspace has been asked/)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Choose a plan' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'View billing' })).toBeNull();
      // Still a way forward: reload once a plan is chosen, or sign out.
      expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Log out' })).toBeInTheDocument();
    });

    it('CONTROL: an older backend (no canChoosePlan) keeps the original screen with the choice', () => {
      gate = { gated: true, message: 'Your free trial has ended.', code: 'SUBSCRIPTION_TRIAL_EXPIRED', canChoosePlan: null };
      render(<SubscriptionGateOverlay />);
      expect(screen.getByRole('heading', { name: 'Subscription inactive' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Choose a plan' })).toBeInTheDocument();
    });

    it('CONTROL: a lapsed PAID plan (not the trial) keeps the original screen', () => {
      gate = { gated: true, message: 'Your subscription is not active.', code: 'SUBSCRIPTION_INACTIVE', canChoosePlan: false };
      render(<SubscriptionGateOverlay />);
      expect(screen.getByRole('heading', { name: 'Subscription inactive' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Choose a plan' })).toBeInTheDocument();
    });
  });
});
