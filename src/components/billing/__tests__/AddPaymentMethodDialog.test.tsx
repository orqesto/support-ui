import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';

/**
 * Production runs on LIVE Stripe keys, so this dialog's copy is not decoration.
 *
 * When no trial remains, Stripe charges on completion. A dialog headed "add a
 * payment method" that then takes €500 without saying so is a chargeback, not a
 * support ticket — so the outcome has to be stated BEFORE the customer submits,
 * and the button has to name it.
 */

vi.mock('@/components/billing/CheckoutSessionForm', () => ({
  CheckoutSessionForm: ({ submitLabel }: { submitLabel: string }) => (
    <button type="button">{submitLabel}</button>
  ),
}));
vi.mock('@stripe/stripe-js', () => ({ loadStripe: () => Promise.resolve(null) }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

const createWizardCheckoutSession = vi.fn<(planName: string) => Promise<unknown>>();
vi.mock('@/services/subscription.service', () => ({
  subscriptionService: {
    createWizardCheckoutSession: (planName: string) => createWizardCheckoutSession(planName),
  },
}));

const { AddPaymentMethodDialog } = await import('../AddPaymentMethodDialog');

const session = (trialEndsAt: string | null) => ({
  clientSecret: 'cs_test',
  publishableKey: 'pk_test',
  uiMode: 'embedded_page' as const,
  trialPeriodDays: 14,
  trialEndsAt,
  plan: {
    id: 3,
    name: 'pro',
    displayName: 'Pro',
    price: 50000,
    currency: 'EUR',
    billingInterval: 'month',
  },
});

const renderDialog = () =>
  render(
    <AddPaymentMethodDialog open onOpenChange={() => {}} planName="pro" onAdded={() => {}} />
  );

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('when a trial is still running', () => {
  beforeEach(() => {
    createWizardCheckoutSession.mockResolvedValue(session('2026-10-01T00:00:00Z'));
  });

  it('says nothing is charged today and names the first billing date', async () => {
    renderDialog();
    await waitFor(() => expect(screen.getByText(/Nothing is charged today/)).toBeInTheDocument());
    expect(screen.getByText(/we bill from/)).toBeInTheDocument();
  });

  it('keeps the button honest about what it does', async () => {
    renderDialog();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Save payment method' })).toBeInTheDocument()
    );
  });
});

describe('against a backend that does not report the trial at all', () => {
  beforeEach(() => {
    const older = session(null) as Record<string, unknown>;
    delete older.trialEndsAt;
    createWizardCheckoutSession.mockResolvedValue(older);
  });

  it('does not invent a charge warning', async () => {
    // `undefined` means "unknown", not "no trial". Warning about a €500 charge
    // that is not happening is its own kind of lie.
    renderDialog();
    await waitFor(() => expect(screen.getByText(/Nothing is charged today/)).toBeInTheDocument());
    expect(screen.queryByText(/Your trial has ended/)).not.toBeInTheDocument();
  });

  it('omits the billing date rather than rendering an invalid one', async () => {
    renderDialog();
    await waitFor(() => expect(screen.getByText(/Nothing is charged today/)).toBeInTheDocument());
    expect(screen.queryByText(/Invalid Date/)).not.toBeInTheDocument();
    expect(screen.queryByText(/we bill from/)).not.toBeInTheDocument();
  });
});

describe('when the trial has run out', () => {
  beforeEach(() => {
    // Stripe charges on completion: no trial recorded, or under 48h left.
    createWizardCheckoutSession.mockResolvedValue(session(null));
  });

  it('warns that submitting charges, before anything is submitted', async () => {
    renderDialog();
    // Scoped to the alert: the button names the price too, so a bare /€500/
    // matches both and proves nothing about the warning.
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByRole('alert')).toHaveTextContent(/Your trial has ended/);
    expect(screen.getByRole('alert')).toHaveTextContent(/€500/);
  });

  it('names the charge on the button rather than saying "save"', async () => {
    renderDialog();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Pay €500 and save card/ })).toBeInTheDocument()
    );
    expect(screen.queryByRole('button', { name: 'Save payment method' })).not.toBeInTheDocument();
  });
});
