/**
 * A workspace with no active plan (expired / cancelled) moves itself to Free from here (BE allows
 * lapsed → Free, owner 2026-09-24). Its plan card used to read "Current Plan" and be DISABLED, so an
 * expired Free trial had no way back to Free at all.
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

const plan = (name: string, displayName: string, price: number) => ({
  id: price + 1,
  name,
  displayName,
  planType: 'base',
  price,
  currency: 'EUR',
  billingInterval: 'month',
  features: {},
  limits: { maxUsers: 2, maxMessagesPerMonth: 500, maxIntegrations: 1 },
});

const load = (status: string) => {
  get.mockImplementation((...args: unknown[]) =>
    String(args[0]).includes('/plans')
      ? Promise.resolve({ data: { success: true, data: { plans: [plan('free', 'Free', 0), plan('pro', 'Pro', 50000)] } } })
      : Promise.resolve({ data: { success: true, data: { plan: { name: 'free' }, subscription: { status } } } })
  );
};

describe('PricingPage — a lapsed workspace can move itself to Free', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    post.mockResolvedValue({ data: { success: true, data: { message: 'ok', plan: { name: 'free' } } } });
  });
  afterEach(cleanup);

  it('an expired Free trial: Free is offered again, says what it means, and posts the switch', async () => {
    load('expired');
    render(<PricingPage />);
    const buttons = await screen.findAllByRole('button', { name: 'Get Started' });
    expect(buttons).toHaveLength(2); // Free and Pro — nothing marked current
    expect(screen.queryByRole('button', { name: 'Current Plan' })).not.toBeInTheDocument();
    fireEvent.click(buttons[0]);
    expect(await screen.findByText(/Free's limits apply and AI runs on your own key/)).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'Switch to Free' }));
    expect(post).toHaveBeenCalledWith('/api/subscriptions/upgrade', { planName: 'free' });
  });

  it('a cancelled plan is not "current" either', async () => {
    load('cancelled');
    render(<PricingPage />);
    expect(await screen.findAllByRole('button', { name: 'Get Started' })).toHaveLength(2);
  });

  it('control: an ACTIVE Free workspace still sees Free as its current plan', async () => {
    load('active');
    render(<PricingPage />);
    expect(await screen.findByRole('button', { name: 'Current Plan' })).toBeDisabled();
  });
});
