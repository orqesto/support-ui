/**
 * On production, NO organization could cancel in the app. Two defects, both
 * user-visible, both fixed here:
 *
 * 1. A card reading "Manage Plan — Upgrade, downgrade, or CANCEL your
 *    subscription" navigated to /pricing, which has no cancel action at all.
 * 2. The "Billing & Invoices … cancel subscription" card opened the Stripe
 *    portal, which 400s without a `billingCustomerId`. Every production org has
 *    a manually-assigned plan and no Stripe customer, so it always failed.
 *
 * These tests are written against the shape the backend now reports
 * (`canCancel` / `hasBillingPortal`) rather than anything re-derived here.
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

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
  toast: { success: vi.fn(), failure: vi.fn(), error: vi.fn() },
}));
vi.mock('@/components/layout/Layout', () => ({
  Layout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  // useMessagePackReturn reads `?status=` for the pack checkout return; no flag here.
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

/**
 * Built with the same Intl options the page uses. Asserting a hardcoded
 * "1 October 2026" would pass or fail on the runner's locale, not on whether
 * the date is stated — and the point is that a real date IS stated.
 */
const asDisplayDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });

const PERIOD_END = '2026-10-01T00:00:00Z';

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

const usageItem = (current: number, limit: number) => ({
  current,
  limit,
  percentage: Math.round((current / limit) * 100),
  warning: false,
  critical: false,
  formatted: `${current} / ${limit}`,
});

const DASHBOARD = {
  plan: PLAN,
  subscription: { status: 'active', trialEndsAt: null, currentPeriodEnd: '2026-10-01T00:00:00Z' },
  usage: {
    users: usageItem(3, 20),
    integrations: usageItem(2, 10),
    messages: usageItem(400, 16000),
    aiCalls: usageItem(1200, 96000),
    storage: usageItem(2048, 102400),
  },
  limits: {
    maxUsers: 20,
    maxIntegrations: 10,
    maxMessagesPerMonth: 16000,
    maxAICallsPerMonth: 96000,
    maxStorageMb: 102400,
  },
};

/** The production shape: active, manually assigned, no Stripe customer. */
const manualSubscription = (over: Record<string, unknown> = {}) => ({
  plan: PLAN,
  subscription: {
    status: 'active',
    currentPeriodStart: '2026-09-01T00:00:00Z',
    currentPeriodEnd: '2026-10-01T00:00:00Z',
    trialEndsAt: null,
    cancelAt: null,
    canCancel: true,
    cancellationRoute: 'local',
    hasBillingPortal: false,
    ...over,
  },
});

const mockLoad = (details: unknown) => {
  get.mockImplementation((url: unknown) =>
    Promise.resolve({
      data: { success: true, data: String(url).includes('dashboard') ? DASHBOARD : details },
    })
  );
};

beforeEach(() => {
  mockLoad(manualSubscription());
  post.mockResolvedValue({
    data: {
      success: true,
      data: { cancelAt: '2026-10-01T00:00:00Z', route: 'local', accessEndsAt: '2026-10-01T00:00:00Z' },
    },
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('cancelling without any Stripe subscription', () => {
  it('offers a cancel action to an org whose plan was assigned by hand', async () => {
    render(<SubscriptionPage />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Cancel subscription' })).toBeInTheDocument()
    );
  });

  it('hides the Stripe portal card when there is no Stripe customer', async () => {
    // This card used to be shown to every org and 400 for all of them.
    render(<SubscriptionPage />);
    await waitFor(() =>
      expect(screen.getByText('Move to a different plan')).toBeInTheDocument()
    );
    expect(screen.queryByText('Billing & Invoices')).not.toBeInTheDocument();
  });

  it('no longer promises a cancel on the page that has none', async () => {
    render(<SubscriptionPage />);
    await waitFor(() =>
      expect(screen.getByText('Move to a different plan')).toBeInTheDocument()
    );
    expect(screen.queryByText(/Upgrade, downgrade, or cancel/)).not.toBeInTheDocument();
  });

  it('states the real last day before doing anything', async () => {
    render(<SubscriptionPage />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Cancel subscription' })).toBeInTheDocument()
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancel subscription' }));

    await waitFor(() =>
      expect(
        screen.getByText(
          new RegExp(`keeps every feature until ${asDisplayDate(PERIOD_END)}`)
        )
      ).toBeInTheDocument()
    );
    // Nothing is sent until the customer confirms.
    expect(post).not.toHaveBeenCalled();
  });
});

describe('a cancellation that is already scheduled', () => {
  it('says when access ends and offers to undo it', async () => {
    mockLoad(manualSubscription({ cancelAt: '2026-10-01T00:00:00Z', canCancel: false }));
    render(<SubscriptionPage />);

    await waitFor(() =>
      expect(
        screen.getByText(
          new RegExp(`your subscription ends on ${asDisplayDate(PERIOD_END)}`)
        )
      ).toBeInTheDocument()
    );
    expect(screen.getByRole('button', { name: 'Keep my subscription' })).toBeInTheDocument();
    // Cancelling twice would move `cancelledAt` forward and misdate the record.
    expect(screen.queryByRole('button', { name: 'Cancel subscription' })).not.toBeInTheDocument();
  });
});

describe('adding a card after finishing onboarding without one', () => {
  /**
   * The wizard's skip path promises "you can add a card any time from Billing".
   * That was false: no Stripe customer means the portal 400s, and /pricing
   * disables the button for the plan the workspace is already on, so there was
   * no route to paying for your current plan — only to switching plans.
   */
  it('offers the action to a workspace with no card on file', async () => {
    mockLoad(manualSubscription({ canAddPaymentMethod: true, hasBillingPortal: false }));
    render(<SubscriptionPage />);

    await waitFor(() =>
      expect(screen.getByText('Add a Payment Method')).toBeInTheDocument()
    );
  });

  it('does not offer it once a card is on file — that is the portal\'s job', async () => {
    mockLoad(manualSubscription({ canAddPaymentMethod: false, hasBillingPortal: true }));
    render(<SubscriptionPage />);

    await waitFor(() => expect(screen.getByText('Billing & Invoices')).toBeInTheDocument());
    expect(screen.queryByText('Add a Payment Method')).not.toBeInTheDocument();
  });

  it('leaves a workspace with neither route stranded on nothing, not a dead button', async () => {
    // Older backend: no fields at all. Better to show the previous behaviour
    // than to render an action whose endpoint refuses every caller.
    mockLoad({
      plan: PLAN,
      subscription: {
        status: 'active',
        currentPeriodStart: '2026-09-01T00:00:00Z',
        currentPeriodEnd: PERIOD_END,
        trialEndsAt: null,
        cancelAt: null,
      },
    });
    render(<SubscriptionPage />);

    await waitFor(() => expect(screen.getByText('Billing & Invoices')).toBeInTheDocument());
    expect(screen.queryByText('Add a Payment Method')).not.toBeInTheDocument();
  });
});

describe('a workspace still on the free plan', () => {
  /**
   * This is where "finish without a card" actually lands. The wizard never
   * applies the plan a visitor arrived with — `?plan=pro` is stored as intent
   * only — so every managed signup stays on `free`. Offering a card form here
   * would check out against a plan with no price, which the backend refuses.
   */
  it('is pointed at choosing a plan, not at adding a card', async () => {
    mockLoad(
      manualSubscription({
        needsPlanToPay: true,
        canAddPaymentMethod: false,
        hasBillingPortal: false,
      })
    );
    render(<SubscriptionPage />);

    await waitFor(() => expect(screen.getByText('Choose a Plan')).toBeInTheDocument());
    expect(screen.queryByText('Add a Payment Method')).not.toBeInTheDocument();
  });

  it('never offers both routes at once', async () => {
    // They are mutually exclusive by construction; showing both would ask the
    // customer to choose between two things that mean the same to them.
    mockLoad(
      manualSubscription({
        needsPlanToPay: false,
        canAddPaymentMethod: true,
        hasBillingPortal: false,
      })
    );
    render(<SubscriptionPage />);

    await waitFor(() => expect(screen.getByText('Add a Payment Method')).toBeInTheDocument());
    expect(screen.queryByText('Choose a Plan')).not.toBeInTheDocument();
  });
});

describe('a Stripe-backed subscription', () => {
  it('keeps the billing portal available alongside the cancel action', async () => {
    mockLoad(manualSubscription({ cancellationRoute: 'stripe', hasBillingPortal: true }));
    render(<SubscriptionPage />);

    await waitFor(() => expect(screen.getByText('Billing & Invoices')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Cancel subscription' })).toBeInTheDocument();
  });
});

describe('an older backend that does not report cancellation state', () => {
  it('degrades to the previous behaviour instead of white-screening', async () => {
    // This page can deploy ahead of the API that sends these fields.
    mockLoad({
      plan: PLAN,
      subscription: {
        status: 'active',
        currentPeriodStart: '2026-09-01T00:00:00Z',
        currentPeriodEnd: '2026-10-01T00:00:00Z',
        trialEndsAt: null,
        cancelAt: null,
      },
    });
    render(<SubscriptionPage />);

    await waitFor(() => expect(screen.getByText('Billing & Invoices')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Cancel subscription' })).not.toBeInTheDocument();
  });
});
