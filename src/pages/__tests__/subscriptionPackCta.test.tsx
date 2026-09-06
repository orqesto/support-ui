/**
 * Where the message pack is offered. Owner, first staging run of packs (2026-09-05):
 * "pretty hard to find where exactly that buy 1000 messages on page" — the only button sat
 * in a muted card under the tiles while the red limit-reached alert offered nothing but an
 * upgrade. The pack must be offered where the limit is FELT: in that alert and on the
 * Messages tile. And never to a workspace the backend refuses a pack for.
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

const PLAN = {
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

const dashboard = (messagesUsed: number, packAvailable: boolean) => ({
  plan: PLAN,
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
  plan: PLAN,
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

const load = (messagesUsed: number, packAvailable: boolean) => {
  get.mockImplementation((url: unknown) =>
    Promise.resolve({
      data: {
        success: true,
        data: String(url).includes('dashboard') ? dashboard(messagesUsed, packAvailable) : details,
      },
    })
  );
};

beforeEach(() => {
  get.mockReset();
  post.mockReset();
});
afterEach(cleanup);

describe('where the message pack is offered', () => {
  it('at the cap: a primary Buy button inside the limit-reached alert, and one on the Messages tile', async () => {
    load(16000, true);
    render(<SubscriptionPage />);
    expect(await screen.findByText('Message limit reached')).toBeInTheDocument();
    expect(screen.getByTestId('buy-message-pack-alert')).toHaveTextContent('Buy 1,000 messages');
    expect(screen.getByTestId('buy-message-pack-tile')).toHaveTextContent('Buy 1,000 messages');
    // The upgrade door stays next to it.
    expect(screen.getByText('View Upgrade Options')).toBeInTheDocument();
  });

  it('below the cap: the tile still offers the pack (buying ahead), the alert does not exist', async () => {
    load(400, true);
    render(<SubscriptionPage />);
    expect(await screen.findByTestId('buy-message-pack-tile')).toBeInTheDocument();
    expect(screen.queryByTestId('buy-message-pack-alert')).not.toBeInTheDocument();
    expect(screen.queryByText('Message limit reached')).not.toBeInTheDocument();
  });

  it('never offers a pack the backend refuses (trial, free, lapsed): upgrade is the only door', async () => {
    load(16000, false);
    render(<SubscriptionPage />);
    expect(await screen.findByText('Message limit reached')).toBeInTheDocument();
    expect(screen.queryByTestId('buy-message-pack-alert')).not.toBeInTheDocument();
    expect(screen.queryByTestId('buy-message-pack-tile')).not.toBeInTheDocument();
    expect(screen.queryByTestId('buy-message-pack')).not.toBeInTheDocument();
    expect(screen.getByText('View Upgrade Options')).toBeInTheDocument();
  });
});
