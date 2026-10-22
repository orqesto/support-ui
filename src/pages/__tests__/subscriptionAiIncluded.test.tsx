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
// The viewer: an organisation admin by default; tests set an agent where money must stay hidden.
let testUser: { role: string; organizationRole: string } = {
  role: 'user',
  organizationRole: 'org_admin',
};
vi.mock('@/stores/authStore', () => ({
  useAuthStore: () => ({ user: testUser }),
}));
vi.mock('@/types/roles', () => ({
  hasPermission: () => true,
  isOrgAdminOrHigher: (role: string, orgRole?: string) => role === 'admin' || orgRole === 'org_admin',
  Permission: { MANAGE_SUBSCRIPTION: 'MANAGE_SUBSCRIPTION' },
}));

const { SubscriptionPage } = await import('@/pages/SubscriptionPage');

let planName = 'pro';
const PLAN = {
  id: 3,
  get name() {
    return planName;
  },
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
      limit: 96000,
      percentage: 1,
      warning: false,
      critical: false,
      formatted: '321 / 96000',
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
  planName = 'pro';
  testUser = { role: 'user', organizationRole: 'org_admin' };
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

  it('paused (budget_used), an organisation admin: the API sentence with the money', async () => {
    load(aiBlock({ paused: true, reason: 'budget_used', message: 'Used up ($5.00 of $5.00).' }));
    render(<SubscriptionPage />);
    expect(await screen.findByTestId('ai-paused-banner')).toHaveTextContent('Used up ($5.00 of $5.00).');
  });

  it('paused (budget_used), an agent: a customer sentence without dollars, Buy 1,000 messages and Upgrade', async () => {
    testUser = { role: 'user', organizationRole: 'support' };
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
    testUser = { role: 'user', organizationRole: 'support' };
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
    expect(screen.queryByTestId('starter-allowance-line')).not.toBeInTheDocument();
  });

  it('Free plan: no "AI included" anywhere, the own-key sentence instead', async () => {
    planName = 'free';
    load(aiBlock({ paused: true, reason: 'not_in_plan', usedMicros: null, budgetMicros: null }));
    render(<SubscriptionPage />);
    const line = await screen.findByTestId('messages-summary');
    expect(line).toHaveTextContent(
      '16,000 messages this period; 1,240 used; resets'
    );
    expect(line).toHaveTextContent('AI runs on your own key; your plan covers 16,000 messages.');
    expect(document.body.textContent).not.toMatch(/AI included/);
    expect(screen.getByText('Messages')).toBeInTheDocument();
  });

  it('not_in_plan on a paid plan: no "AI included" either', async () => {
    load(aiBlock({ paused: true, reason: 'not_in_plan', usedMicros: null, budgetMicros: null }));
    render(<SubscriptionPage />);
    await screen.findByTestId('messages-summary');
    expect(document.body.textContent).not.toMatch(/AI included/);
  });

  it('before Apply (ai.active false): the AI Calls tile and its monthly limit are shown as before', async () => {
    load(aiBlock({ active: false, usedMicros: null, budgetMicros: null }));
    render(<SubscriptionPage />);
    expect(await screen.findByText('AI Calls')).toBeInTheDocument();
    expect(screen.getByText('AI Calls / Month')).toBeInTheDocument();
    expect(screen.getAllByText('/ 96,000').length).toBeGreaterThan(0);
  });

  it('an older backend with no ai block keeps the AI Calls tile too', async () => {
    load(undefined);
    render(<SubscriptionPage />);
    expect(await screen.findByText('AI Calls')).toBeInTheDocument();
  });

  it('a trial states the one trial sentence', async () => {
    load(aiBlock(), 'trialing');
    render(<SubscriptionPage />);
    expect(
      await screen.findByText('14-day free trial on any paid plan, up to 1,000 messages, no card')
    ).toBeInTheDocument();
  });

  it('not_in_plan on a paid plan without an own key: says so, never "runs on your own key" (F3)', async () => {
    load(aiBlock({ paused: true, reason: 'not_in_plan', usedMicros: null, budgetMicros: null }));
    render(<SubscriptionPage />);
    const line = await screen.findByTestId('messages-summary');
    expect(line).toHaveTextContent(
      'AI is not included in your plan: upgrade, or connect your own AI key; your plan covers 16,000 messages.'
    );
    expect(line).not.toHaveTextContent(/runs on your own key/);
  });

  it('kept by ruling (parked): an own-key workspace has no AI Calls tile before Apply either', async () => {
    load(aiBlock({ active: false, usedMicros: null, budgetMicros: null }), 'active', true, {
      platform: { active: false },
      enabled: [{ id: 1 }],
    });
    render(<SubscriptionPage />);
    await screen.findByTestId('messages-summary');
    await waitFor(() => expect(screen.queryByText('AI Calls')).not.toBeInTheDocument());
    expect(screen.queryByText('AI Calls / Month')).not.toBeInTheDocument();
  });
});

describe('Subscription page: Free AI starter allowance', () => {
  const starter = (over: Record<string, unknown> = {}, aiOver: Record<string, unknown> = {}) =>
    aiBlock({
      usedMicros: null,
      budgetMicros: null,
      microsPerMessage: 4_000,
      starterAllowance: {
        totalMicros: 400_000,
        usedMicros: 148_000,
        remainingMicros: 252_000,
        exhausted: false,
        ...over,
      },
      ...aiOver,
    });

  beforeEach(() => {
    planName = 'free';
  });

  it('an agent reads messages left, no money; the summary names the starter allowance', async () => {
    testUser = { role: 'user', organizationRole: 'support' };
    load(starter());
    render(<SubscriptionPage />);
    const line = await screen.findByTestId('starter-allowance-line');
    expect(line).toHaveTextContent('AI starter allowance: about 63 of 100 messages left.');
    expect(line).not.toHaveTextContent(/\$/);
    expect(screen.getByTestId('messages-summary')).toHaveTextContent(
      'AI runs on a starter allowance on us until you add your own AI key'
    );
    expect(screen.queryByTestId('ai-paused-banner')).not.toBeInTheDocument();
  });

  it('an admin also reads the money', async () => {
    load(starter());
    render(<SubscriptionPage />);
    expect(await screen.findByTestId('starter-allowance-line')).toHaveTextContent(
      'about 63 of 100 messages left (≈ $0.25 of $0.40 left).'
    );
  });

  it('no microsPerMessage in the response (the real backend): 100 messages from the allowance', async () => {
    load(starter({}, { microsPerMessage: undefined }));
    render(<SubscriptionPage />);
    expect(await screen.findByTestId('starter-allowance-line')).toHaveTextContent(
      'AI starter allowance: about 63 of 100 messages left'
    );
  });

  it('own-key Free (the backend sends the block too): no line, no banner, own-key sentence', async () => {
    load(
      starter({ usedMicros: 400_000, remainingMicros: 0, exhausted: true }),
      'active',
      true,
      { platform: { active: false }, enabled: [{ id: 1 }] }
    );
    render(<SubscriptionPage />);
    await waitFor(() =>
      expect(screen.getByTestId('messages-summary')).toHaveTextContent('AI runs on your own key')
    );
    expect(screen.queryByTestId('starter-allowance-line')).not.toBeInTheDocument();
    expect(screen.queryByTestId('ai-paused-banner')).not.toBeInTheDocument();
  });

  it('not on Free: starterAllowance null, nothing new', async () => {
    planName = 'pro';
    load(aiBlock({ starterAllowance: null }));
    render(<SubscriptionPage />);
    await screen.findByTestId('messages-summary');
    expect(screen.queryByTestId('starter-allowance-line')).not.toBeInTheDocument();
  });

  it('used up: the banner with Add your AI key and Upgrade (admin)', async () => {
    load(
      starter(
        { usedMicros: 400_000, remainingMicros: 0, exhausted: true },
        {
          paused: true,
          reason: 'free_allowance_used',
          message: 'Your free AI allowance is used. Add your own AI key to keep AI running.',
        }
      )
    );
    render(<SubscriptionPage />);
    const banner = await screen.findByTestId('ai-paused-banner');
    expect(banner).toHaveTextContent('Your free AI allowance is used. Add your own AI key');
    expect(screen.getByText('Add your AI key')).toHaveAttribute(
      'href',
      '/settings#integrations/ai-providers'
    );
    expect(screen.getByTestId('starter-allowance-line')).toHaveTextContent('used up');
  });

  it('a malformed allowance from the backend: nothing new, the page renders', async () => {
    load(starter({ totalMicros: 'lots' }));
    render(<SubscriptionPage />);
    expect(await screen.findByTestId('messages-summary')).toHaveTextContent(
      'AI runs on your own key'
    );
    expect(screen.queryByTestId('starter-allowance-line')).not.toBeInTheDocument();
  });
});
