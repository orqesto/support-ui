/**
 * Volume caps on the Subscription page (BE 2026-09-24): stored messages and KB items get their
 * own tiles, their own sentence when full — and nothing at all on a backend that predates them,
 * because this page reaches prod on merge, before the backend release.
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

const baseDashboard = (messagesUsed: number, packAvailable: boolean) => ({
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

type Extra = { storedMessages?: ReturnType<typeof usageItem>; kbItems?: ReturnType<typeof usageItem> };

const load = (extra: Extra) => {
  get.mockImplementation((url: unknown) => {
    const dash = baseDashboard(400, true);
    return Promise.resolve({
      data: {
        success: true,
        data: String(url).includes('dashboard') ? { ...dash, usage: { ...dash.usage, ...extra } } : details,
      },
    });
  });
};

beforeEach(() => {
  get.mockReset();
  post.mockReset();
});
afterEach(cleanup);

describe('volume caps on the Subscription page', () => {
  it('shows both tiles with their numbers when the backend reports them', async () => {
    load({ storedMessages: usageItem(1200, 5000), kbItems: usageItem(40, 200) });
    render(<SubscriptionPage />);
    expect(await screen.findByText('Stored messages')).toBeInTheDocument();
    expect(screen.getByText('Knowledge base items')).toBeInTheDocument();
    expect(screen.getByText('1,200')).toBeInTheDocument();
    expect(screen.getByText('/ 5,000')).toBeInTheDocument();
    expect(screen.queryByText(/Stored-message limit reached/)).not.toBeInTheDocument();
  });

  it('renders no tile at all on a backend without the fields', async () => {
    load({});
    render(<SubscriptionPage />);
    expect(await screen.findByText('Storage (MB)')).toBeInTheDocument();
    expect(screen.queryByText('Stored messages')).not.toBeInTheDocument();
    expect(screen.queryByText('Knowledge base items')).not.toBeInTheDocument();
  });

  it('says what a full cap means: mail keeps arriving, imports stop, KB stops growing', async () => {
    load({ storedMessages: usageItem(5000, 5000), kbItems: usageItem(200, 200) });
    render(<SubscriptionPage />);
    expect(await screen.findByText(/Stored-message limit reached: new mail still arrives/)).toBeInTheDocument();
    expect(screen.getByText(/Knowledge base is full/)).toBeInTheDocument();
  });
});
