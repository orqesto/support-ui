/**
 * A refused plan upgrade must say why. Two separate defects hid it:
 *
 * 1. `extractApiError` gated on `error instanceof Error && 'response' in error`, and the
 *    api-client interceptor produces an Error with `status`/`data` and NO `.response`
 *    (fixed in #203).
 * 2. `AlertDialog` awaited `onConfirm()` then closed itself, so the error dialog this
 *    page opens from its catch was closed the instant it appeared — the user saw NO
 *    dialog at all. That is why this test could not be written when #205 tried.
 *
 * Fixtures come from the real interceptor via `@/test/apiError`.
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

type ApiResult = { data: unknown };
const get = vi.fn<(...args: unknown[]) => Promise<ApiResult>>();
const post = vi.fn<(...args: unknown[]) => Promise<ApiResult>>();
vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: (...args: unknown[]) => get(...args),
    post: (...args: unknown[]) => post(...args),
  },
}));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('@/components/layout/Layout', () => ({
  Layout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));

import { PricingPage } from '@/pages/PricingPage';
import { apiError, networkError } from '@/test/apiError';

const PLAN = {
  id: 1,
  name: 'pro',
  displayName: 'Pro',
  planType: 'base',
  price: 4900,
  currency: 'EUR',
  billingInterval: 'month',
  features: { aiReplies: true },
  limits: { maxUsers: 10, maxMessagesPerMonth: 5000, maxIntegrations: 3 },
};

const attemptUpgrade = async () => {
  render(<PricingPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Get Started' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Upgrade' }));
};

describe('PricingPage — a refused upgrade explains itself', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    get.mockImplementation((...args: unknown[]) =>
      String(args[0]).includes('/plans')
        ? Promise.resolve({ data: { success: true, data: { plans: [PLAN] } } })
        : Promise.resolve({ data: { success: true, data: { plan: { name: 'free' } } } })
    );
  });
  afterEach(cleanup);

  it("shows the backend's reason rather than nothing at all", async () => {
    post.mockRejectedValue(
      await apiError(409, { error: 'Your card was declined. Update it and try again.' })
    );
    await attemptUpgrade();
    expect(
      await screen.findByText('Your card was declined. Update it and try again.')
    ).toBeInTheDocument();
  });

  it('falls back when the failure carries nothing to say', async () => {
    post.mockRejectedValue(await networkError());
    await attemptUpgrade();
    expect(await screen.findByText('Failed to upgrade plan')).toBeInTheDocument();
  });

  it('never puts a 5xx body in front of a customer', async () => {
    post.mockRejectedValue(
      await apiError(500, { error: 'StripeConnectionError at /srv/app/dist/billing.js:204' })
    );
    await attemptUpgrade();
    expect(await screen.findByText('Failed to upgrade plan')).toBeInTheDocument();
    expect(screen.queryByText(/StripeConnectionError/)).not.toBeInTheDocument();
  });
});
