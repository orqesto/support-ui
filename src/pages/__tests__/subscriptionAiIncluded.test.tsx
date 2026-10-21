/**
 * Money-budget build, Task 11: the Subscription page sells MESSAGES (AI included). No AI Calls tile
 * or limit box; an AI-paused banner from the API's `ai` block; own-key wording; the one trial sentence.
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';

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
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => (
    <a href={to}>{children}</a>
  ),
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

const dashboard = (messagesUsed: number, packAvailable: boolean, status = 'active') => ({
  plan: PLAN,
  subscription: {
    status,
    trialEndsAt: status === 'trialing' ? '2026-09-07T00:00:00Z' : null,
    currentPeriodEnd: '2026-09-24T11:48:02Z',
  },
  usage: {
    users: usageItem(1, 20),
    integrations: usageItem(1, 10),
    messages: { ...usageItem(messagesUsed, 16000), planLimit: 16000, extra: 0 },
    aiCalls: {
      current: 321,
      limit: 0,
      percentage: 0,
      warning: false,
      critical: false,
      formatted: '321',
    },
    storage: usageItem(3, 102400),
  },
  limits: {
    maxUsers: 20,
    maxIntegrations: 10,
    maxMessagesPerMonth: 16000,
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

const aiBlock = (over: Record<string, unknown> = {}) => ({
  currency: 'USD',
  active: true,
  usedMicros: 5_000_000,
  budgetMicros: 5_000_000,
  paused: false,
  bulkPaused: false,
  reason: null,
  message: null,
  resetsAt: '2026-09-24T11:48:02Z',
  ...over,
});

type Providers = { platform?: { active: boolean }; enabled?: unknown[] } | 'fail';
const load = (
  ai: unknown,
  status = 'active',
  packAvailable = true,
  providers: Providers = { platform: { active: true } }
) => {
  get.mockImplementation((url: unknown) => {
    const path = String(url);
    if (path.includes('ai/providers')) {
      return providers === 'fail'
        ? Promise.reject(new Error('providers down'))
        : Promise.resolve({
            data: { success: true, data: { enabled: [], available: [], ...providers } },
          });
    }
    if (path.includes('usage/current')) return Promise.resolve({ data: { ai } });
    return Promise.resolve({
      data: {
        success: true,
        data: path.includes('dashboard')
          ? dashboard(1240, packAvailable, status)
          : {
              ...details,
              subscription: {
                ...details.subscription,
                status,
                trialEndsAt: status === 'trialing' ? '2026-09-07T00:00:00Z' : null,
              },
            },
      },
    });
  });
};

beforeEach(() => {
  get.mockReset();
  post.mockReset();
});
afterEach(cleanup);

describe('Subscription page: messages with AI included', () => {
  it('has no AI Calls tile and no AI-calls limit box; the Messages tile says AI included', async () => {
    load(aiBlock());
    render(<SubscriptionPage />);
    expect(await screen.findByText('Messages (AI included)')).toBeInTheDocument();
    expect(screen.queryByText('AI Calls')).not.toBeInTheDocument();
    expect(screen.queryByText(/AI Calls \/ Month/)).not.toBeInTheDocument();
    expect(screen.queryByText(/AI call limit/i)).not.toBeInTheDocument();
  });

  it('one line: allowance, AI included, used, and the reset day', async () => {
    load(aiBlock());
    render(<SubscriptionPage />);
    const line = await screen.findByTestId('messages-summary');
    expect(line).toHaveTextContent(
      /16,000 messages this period, AI included; 1,240 used; resets (Sep 24|24 Sep)/
    );
    expect(line).not.toHaveTextContent(/own key/);
  });

  it('own key (platform AI off) WITH a budget: the own-key sentence, no money', async () => {
    load(aiBlock(), 'active', true, { platform: { active: false }, enabled: [{ id: 1 }] });
    render(<SubscriptionPage />);
    await waitFor(() =>
      expect(screen.getByTestId('messages-summary')).toHaveTextContent(
        'AI runs on your own key; your plan covers 16,000 messages.'
      )
    );
    expect(document.body.textContent).not.toMatch(/≈ \$|\$\d/);
  });

  it('managed workspace whose spend read failed: no own-key wording', async () => {
    load(aiBlock({ usedMicros: null, budgetMicros: null }));
    render(<SubscriptionPage />);
    expect(await screen.findByTestId('messages-summary')).not.toHaveTextContent(/own key/);
  });

  it('provider call fails: neither own-key wording nor figures', async () => {
    load(aiBlock({ usedMicros: null, budgetMicros: null }), 'active', true, 'fail');
    render(<SubscriptionPage />);
    expect(await screen.findByTestId('messages-summary')).not.toHaveTextContent(/own key/);
  });

  it('paused (budget_used): a customer sentence without dollars, Buy 1,000 messages and Upgrade', async () => {
    load(aiBlock({ paused: true, reason: 'budget_used', message: 'Used up ($5.00 of $5.00).' }));
    render(<SubscriptionPage />);
    const banner = await screen.findByTestId('ai-paused-banner');
    expect(banner).toHaveTextContent(/AI messages are used up/);
    expect(screen.getByTestId('buy-message-pack-ai-banner')).toHaveTextContent(
      'Buy 1,000 messages'
    );
    expect(banner).toHaveTextContent('Upgrade');
    expect(banner).not.toHaveTextContent(/\$/);
  });

  it('paused (server_ceiling): text only, no way out offered', async () => {
    load(aiBlock({ paused: true, reason: 'server_ceiling', message: 'Server limit reached.' }));
    render(<SubscriptionPage />);
    const banner = await screen.findByTestId('ai-paused-banner');
    expect(banner).toHaveTextContent(/AI limit for the month is reached/);
    expect(screen.queryByTestId('buy-message-pack-ai-banner')).not.toBeInTheDocument();
    expect(banner).not.toHaveTextContent('Upgrade');
  });

  it('paused, not in plan: Upgrade / connect your own key, no pack button in the banner', async () => {
    load(
      aiBlock({
        paused: true,
        reason: 'not_in_plan',
        message: 'AI is not included in your plan. Upgrade, or connect your own AI key.',
        usedMicros: null,
        budgetMicros: null,
      })
    );
    render(<SubscriptionPage />);
    const banner = await screen.findByTestId('ai-paused-banner');
    expect(banner).toHaveTextContent('AI is not included in your plan');
    expect(banner).toHaveTextContent('Connect your own AI key');
    expect(screen.queryByTestId('buy-message-pack-ai-banner')).not.toBeInTheDocument();
  });

  it('not paused: no banner', async () => {
    load(aiBlock());
    render(<SubscriptionPage />);
    await screen.findByTestId('messages-summary');
    expect(screen.queryByTestId('ai-paused-banner')).not.toBeInTheDocument();
  });

  it('an older backend with no ai block still renders the page', async () => {
    load(undefined);
    render(<SubscriptionPage />);
    expect(await screen.findByTestId('messages-summary')).toBeInTheDocument();
    expect(screen.queryByTestId('ai-paused-banner')).not.toBeInTheDocument();
  });

  it('a trial states the one trial sentence', async () => {
    load(aiBlock(), 'trialing');
    render(<SubscriptionPage />);
    expect(
      await screen.findByText('14-day free trial on any paid plan, up to 1,000 messages, no card')
    ).toBeInTheDocument();
  });
});
