/**
 * The Subscription card's billing date (2026-09-28): a free plan never billed must not show a
 * months-old "Next Billing Date"; a past date is never "next".
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

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
vi.mock('@/lib/toast', () => ({
  toast: { success: vi.fn(), info: vi.fn(), failure: vi.fn(), error: vi.fn() },
}));
vi.mock('@/components/layout/Layout', () => ({
  Layout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
}));
vi.mock('@/stores/authStore', () => ({
  useAuthStore: () => ({ user: { role: 'user', organizationRole: 'org_admin' } }),
}));
vi.mock('@/types/roles', () => ({
  hasPermission: () => true,
  Permission: { MANAGE_SUBSCRIPTION: 'MANAGE_SUBSCRIPTION' },
}));

const { SubscriptionPage } = await import('@/pages/SubscriptionPage');

const PAID_PLAN = {
  id: 3,
  name: 'pro',
  displayName: 'Pro',
  planType: 'base',
  price: 50000,
  currency: 'EUR',
  billingInterval: 'month',
  limits: { maxUsers: 20, maxMessagesPerMonth: 16000, maxIntegrations: 10 },
  features: { aiAutoReply: true },
};

const usageItem = (current: number, limit: number) => {
  const percentage = Math.round((current / limit) * 100);
  return {
    current,
    limit,
    percentage,
    warning: percentage >= 80,
    critical: percentage >= 100,
    formatted: `${current} / ${limit}`,
  };
};

const baseDashboard = (messagesUsed: number, packAvailable: boolean) => ({
  plan: PAID_PLAN,
  subscription: { status: 'active', trialEndsAt: null, currentPeriodEnd: '2026-09-24T11:48:02Z' },
  usage: {
    users: usageItem(1, 20),
    integrations: usageItem(1, 10),
    messages: { ...usageItem(messagesUsed, 16000), planLimit: 16000, extra: 0 },
    aiCalls: usageItem(0, 96000),
    storage: usageItem(3, 102400),
  },
  limits: {
    maxUsers: 20,
    maxIntegrations: 10,
    maxMessagesPerMonth: 16000,
    maxAICallsPerMonth: 96000,
    maxStorageMb: 102400,
  },
  period: {
    key: '2026-08-24',
    start: '2026-08-24T11:48:02Z',
    end: '2026-09-24T11:48:02Z',
    source: 'billing',
  },
  messagePack: packAvailable
    ? { available: true, messages: 1000, priceCents: 5000, currency: 'EUR' }
    : { available: false, reason: 'not_active', messages: 1000, priceCents: 5000, currency: 'EUR' },
});

const details = {
  plan: PAID_PLAN,
  subscription: {
    status: 'active',
    currentPeriodStart: '2026-08-24T11:48:02Z',
    currentPeriodEnd: '2026-09-24T11:48:02Z',
    trialEndsAt: null,
    cancelAt: null,
    canCancel: true,
    cancellationRoute: 'stripe',
    hasBillingPortal: true,
  },
};

const FREE_PLAN = {
  ...PAID_PLAN,
  id: 1,
  name: 'admin',
  displayName: 'System Administrator',
  price: 0,
};

/** Serve the page a plan and a period end; the dashboard call gets the matching plan. */
const load = (plan: typeof PAID_PLAN, currentPeriodEnd: string) => {
  get.mockImplementation((url: unknown) => {
    const dash = baseDashboard(400, false);
    return Promise.resolve({
      data: {
        success: true,
        data: String(url).includes('dashboard')
          ? { ...dash, plan }
          : { ...details, plan, subscription: { ...details.subscription, currentPeriodEnd } },
      },
    });
  });
};

beforeEach(() => {
  get.mockReset();
  post.mockReset();
});
afterEach(cleanup);

// Relative to the real clock, so the test does not rot.
const DAY = 24 * 60 * 60 * 1000;
const past = new Date(Date.now() - 34 * DAY).toISOString();
const future = new Date(Date.now() + 27 * DAY).toISOString();

describe('the billing date on the Subscription card (cloud only: BillingRoute keeps self-hosted off this page)', () => {
  it('shows no billing date at all on a free plan whose stored period has passed (prod, 2026-09-28)', async () => {
    load(FREE_PLAN, past);
    render(<SubscriptionPage />);
    expect(await screen.findByText('Current Plan')).toBeInTheDocument();
    expect(screen.queryByText('Next Billing Date')).not.toBeInTheDocument();
    expect(screen.queryByText(/Period (Ended|Ends)/i)).not.toBeInTheDocument();
  });

  it('keeps "Next Billing Date" for a paid plan with a future period end', async () => {
    load(PAID_PLAN, future);
    render(<SubscriptionPage />);
    expect(await screen.findByText('Next Billing Date')).toBeInTheDocument();
  });

  it('does not call a past date "next" — nor "ended" — on an active paid plan', async () => {
    load(PAID_PLAN, past);
    render(<SubscriptionPage />);
    expect(await screen.findByText('Current Plan')).toBeInTheDocument();
    expect(screen.queryByText('Next Billing Date')).not.toBeInTheDocument();
    expect(screen.queryByText(/Period (Ended|Ends)/i)).not.toBeInTheDocument();
  });
});
