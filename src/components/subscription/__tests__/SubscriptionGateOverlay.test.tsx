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
vi.mock('@/stores/subscriptionGateStore', () => ({
  useSubscriptionGateStore: (select: (state: { gated: boolean; message: string }) => unknown) =>
    select({ gated: true, message: 'Your free trial has expired.' }),
}));

const { SubscriptionGateOverlay } = await import('@/components/subscription/SubscriptionGateOverlay');

describe('SubscriptionGateOverlay — the way back for a lapsed workspace', () => {
  beforeEach(() => {
    navigate.mockReset();
    pathname = '/messages';
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
});
