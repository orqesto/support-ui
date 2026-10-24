/**
 * Release audit B4 (2026-10-23): a paid → paid change is made on the live Stripe subscription
 * (prorated) and the upgrade call answers `requiresCheckout: false` — the page says it is done,
 * reads the plan and usage again, and never waits for a checkout redirect. ALREADY_ON_PLAN has
 * our words.
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { apiError } from '@/test/apiError';

type ApiResult = { data: unknown };
const get = vi.fn<(...args: unknown[]) => Promise<ApiResult>>();
const post = vi.fn<(...args: unknown[]) => Promise<ApiResult>>();
vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: (...args: unknown[]) => get(...args),
    post: (...args: unknown[]) => post(...args),
  },
}));
const invalidate = vi.fn<(arg: unknown) => Promise<void>>(() => Promise.resolve());
vi.mock('@/lib/queryClient', () => ({
  queryClient: { invalidateQueries: (arg: unknown) => invalidate(arg) },
}));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('@/components/layout/Layout', () => ({
  Layout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
const navigateTo = vi.fn();
vi.mock('react-router-dom', () => ({ useNavigate: () => navigateTo }));
vi.mock('@/hooks/useBackendVersion', () => ({ useBackendVersion: () => ({ data: undefined }) }));

import { PricingPage } from '@/pages/PricingPage';

const plan = (name: string, displayName: string, price: number) => ({
  id: price + 1,
  name,
  displayName,
  planType: 'base',
  price,
  currency: 'EUR',
  billingInterval: 'month',
  features: {},
  limits: { maxUsers: 5, maxMessagesPerMonth: 500, maxIntegrations: 3 },
});

const hrefSet = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  get.mockImplementation((...args: unknown[]) =>
    String(args[0]).includes('/plans')
      ? Promise.resolve({
          data: { success: true, data: { plans: [plan('starter', 'Starter', 2000), plan('pro', 'Pro', 5000)] } },
        })
      : Promise.resolve({ data: { success: true, data: { plan: { name: 'starter' }, subscription: { status: 'active' } } } })
  );
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { set href(url: string) { hrefSet(url); }, get href() { return ''; } },
  });
});
afterEach(cleanup);

const choosePro = async () => {
  render(<PricingPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Get Started' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Upgrade' }));
};

describe('PricingPage: paid → paid in place', () => {
  it('requiresCheckout false: success with the proration line, plan and usage read again, no redirect', async () => {
    post.mockResolvedValue({
      data: {
        success: true,
        data: {
          requiresCheckout: false,
          message: 'Plan changed. The difference is prorated on your next invoice.',
          plan: { id: 2, name: 'pro', displayName: 'Pro' },
        },
      },
    });
    await choosePro();
    expect(
      await screen.findByText(/Successfully changed to the pro plan\. The difference is prorated on your next invoice\./)
    ).toBeInTheDocument();
    expect(screen.queryByText(/scheduled cancellation/)).toBeNull();
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['usage-current'] }));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['workspace', 'ai-usage'] });
    expect(hrefSet).not.toHaveBeenCalled();
  });

  it('CONTROL: requiresCheckout true still hands off to the checkout', async () => {
    post.mockResolvedValue({
      data: { success: true, data: { requiresCheckout: true, checkoutUrl: 'https://checkout.example/s1' } },
    });
    await choosePro();
    await waitFor(() => expect(hrefSet).toHaveBeenCalledWith('https://checkout.example/s1'));
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("409 ALREADY_ON_PLAN: \"You're already on this plan.\"", async () => {
    post.mockRejectedValue(
      await apiError(409, { code: 'ALREADY_ON_PLAN', error: 'This workspace is already on Pro.' })
    );
    await choosePro();
    expect(await screen.findByText("You're already on this plan.")).toBeInTheDocument();
  });

  it('cancellationRemoved: the success line says the scheduled cancellation was removed', async () => {
    post.mockResolvedValue({
      data: { success: true, data: { requiresCheckout: false, cancellationRemoved: true } },
    });
    await choosePro();
    expect(
      await screen.findByText(/Your scheduled cancellation was removed\. The difference is prorated/)
    ).toBeInTheDocument();
  });

  it('409 SUBSCRIPTION_PAST_DUE: pay first, and the button goes to the payment card', async () => {
    post.mockRejectedValue(
      await apiError(409, { code: 'SUBSCRIPTION_PAST_DUE', error: 'Your last payment failed.' })
    );
    await choosePro();
    expect(
      await screen.findByText('Update your payment method first, then change plan.')
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Update payment method' }));
    expect(navigateTo).toHaveBeenCalledWith('/subscription#payment');
  });
});
