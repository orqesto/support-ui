import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import type { SubscriptionPlan } from '@/services/subscription.service';

/**
 * The last step of onboarding is the only one that can take money, and the plan
 * cards are what a customer decides on. Rendering it end to end (rather than
 * only unit-testing the helpers) is what proves the three tiers actually reach
 * the screen with the right numbers, and that the sales-assisted tier is shown
 * WITHOUT being made to look purchasable.
 *
 * Stripe's embedded checkout is stubbed: it is a cross-origin iframe with no
 * behaviour we own, and mounting it needs a live publishable key.
 */

vi.mock('@stripe/react-stripe-js', () => ({
  EmbeddedCheckoutProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  EmbeddedCheckout: () => <div data-testid="stripe-checkout" />,
}));

vi.mock('@stripe/stripe-js', () => ({
  loadStripe: () => Promise.resolve(null),
}));

const getPlans = vi.fn<() => Promise<SubscriptionPlan[]>>();
const createWizardCheckoutSession = vi.fn<(planName: string) => Promise<unknown>>();

vi.mock('@/services/subscription.service', () => ({
  subscriptionService: {
    getPlans: () => getPlans(),
    createWizardCheckoutSession: (planName: string) => createWizardCheckoutSession(planName),
  },
}));

const { PaymentStep } = await import('../steps/PaymentStep');

const plan = (over: Partial<SubscriptionPlan>): SubscriptionPlan => ({
  id: 1,
  name: 'starter',
  displayName: 'Starter',
  planType: 'base',
  price: 15000,
  currency: 'EUR',
  billingInterval: 'month',
  ...over,
});

// Ordered by price, exactly as GET /api/subscriptions/plans returns them.
const CATALOG: SubscriptionPlan[] = [
  plan({
    name: 'free',
    displayName: 'Free',
    price: 0,
    limits: { maxUsers: 2 },
    features: {},
  }),
  plan({
    name: 'starter',
    displayName: 'Starter',
    price: 15000,
    limits: { maxUsers: 5, maxMessagesPerMonth: 4000, maxIntegrations: 3, maxStorageMb: 10240 },
    features: { aiAutoReply: false, sso: false },
  }),
  plan({
    name: 'pro',
    displayName: 'Pro',
    price: 50000,
    limits: { maxUsers: 20, maxMessagesPerMonth: 16000, maxIntegrations: 10, maxStorageMb: 102400 },
    features: { aiAutoReply: true, advancedAnalytics: true, sso: false },
  }),
  plan({
    name: 'enterprise-cloud',
    displayName: 'Enterprise Cloud',
    price: 100000,
    limits: {
      maxUsers: 50,
      maxMessagesPerMonth: 40000,
      maxIntegrations: 25,
      maxStorageMb: 1048576,
    },
    features: { aiAutoReply: true, advancedAnalytics: true, sso: true, scim: true, auditLogs: true },
  }),
  plan({
    name: 'self-hosted',
    displayName: 'Self-Hosted',
    price: 300000,
    limits: { maxUsers: 999999 },
    features: { sso: true, scim: true, auditLogs: true },
  }),
];

beforeEach(() => {
  getPlans.mockResolvedValue(CATALOG);
  createWizardCheckoutSession.mockResolvedValue({
    clientSecret: 'cs_test_secret',
    publishableKey: 'pk_test_123',
    trialPeriodDays: 14,
    plan: { displayName: 'Pro', price: 50000, currency: 'EUR', billingInterval: 'month' },
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('PaymentStep plan cards', () => {
  it('offers all three self-serve tiers', async () => {
    render(<PaymentStep initialPlan="pro" planWasPreselected={false} />);

    await waitFor(() => expect(screen.getByText('Starter')).toBeInTheDocument());
    expect(screen.getByText('Pro')).toBeInTheDocument();
    expect(screen.getByText('Enterprise Cloud')).toBeInTheDocument();
  });

  it('does not offer Free — it is selectable at signup but never checkoutable', async () => {
    render(<PaymentStep initialPlan="pro" planWasPreselected={false} />);

    await waitFor(() => expect(screen.getByText('Starter')).toBeInTheDocument());
    expect(screen.queryByText('Free')).not.toBeInTheDocument();
  });

  it('shows the caps that make the tiers comparable', async () => {
    render(<PaymentStep initialPlan="pro" planWasPreselected={false} />);

    await waitFor(() => expect(screen.getByText('5 agents')).toBeInTheDocument());
    expect(screen.getByText('20 agents')).toBeInTheDocument();
    expect(screen.getByText('50 agents')).toBeInTheDocument();
    expect(screen.getByText('40,000 messages/mo')).toBeInTheDocument();
    // The most expensive tier's storage is a real 1 TB, not the unlimited sentinel.
    expect(screen.getByText('1 TB')).toBeInTheDocument();
  });

  it('says what the step up actually buys', async () => {
    render(<PaymentStep initialPlan="pro" planWasPreselected={false} />);

    await waitFor(() =>
      expect(screen.getByText(/Adds AI auto-reply, advanced analytics/)).toBeInTheDocument()
    );
    expect(screen.getByText(/Adds SSO, SCIM provisioning, audit logs/)).toBeInTheDocument();
  });

  it('shows Self-Hosted as a conversation, not a purchase', async () => {
    render(<PaymentStep initialPlan="pro" planWasPreselected={false} />);

    await waitFor(() =>
      expect(screen.getByText(/Self-Hosted · €3,000\/month/)).toBeInTheDocument()
    );

    // It must not be one of the selectable cards: those are buttons that would
    // start a Checkout session the backend has no price to fulfil.
    const link = screen.getByRole('link', { name: /Talk to us/ });
    expect(link).toHaveAttribute('href', expect.stringContaining('#contact'));
    expect(screen.queryByRole('button', { name: /Self-Hosted/ })).not.toBeInTheDocument();
  });

  it('opens a checkout session for the tier that was picked', async () => {
    render(<PaymentStep initialPlan="enterprise-cloud" planWasPreselected />);

    await waitFor(() => expect(createWizardCheckoutSession).toHaveBeenCalledWith('enterprise-cloud'));
  });
});
