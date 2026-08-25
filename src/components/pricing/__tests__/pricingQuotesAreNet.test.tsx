/**
 * The plan cards quote a number the customer will NOT be charged unless we say it is net.
 *
 * Measured, not theorised: a real test-mode checkout for Pro showed **€605.00 per month** against
 * the €500 these cards advertise — Stripe is merchant of record and adds VAT from the customer's
 * own location. The payment dialog one click away already said "excl. VAT", so the app was
 * contradicting itself on a payment surface.
 *
 * Both cards also hand-rolled their own `€` + `toFixed()`, which is exactly the drift `money.ts`
 * was written to stop (its docstring names "€500 vs €500.00"). These tests pin the label and the
 * shared formatter together, and the zero-price control keeps "excl. VAT" off a free plan, where
 * it would be noise.
 */
import { describe, expect, it } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { BasePlanCard, EnterprisePlanCard, type Plan } from '@/components/pricing/PricingPlanCard';
import { VAT_NOTE, formatMoney } from '@/lib/money';

const plan = (overrides: Partial<Plan> = {}): Plan => ({
  id: 1,
  name: 'pro',
  displayName: 'Pro',
  planType: 'base',
  price: 50000,
  currency: 'EUR',
  billingInterval: 'month',
  features: {},
  limits: { maxUsers: 20, maxMessagesPerMonth: 16000, maxIntegrations: 10 },
  ...overrides,
});

const noop = () => undefined;

describe('plan cards quote a net price', () => {
  it('shows the price through the shared formatter, marked excl. VAT', () => {
    render(<BasePlanCard plan={plan()} currentPlanName={null} upgrading={null} onSelect={noop} />);

    expect(screen.getByText(formatMoney(50000, 'EUR'))).toBeInTheDocument();
    expect(screen.getByText(VAT_NOTE)).toBeInTheDocument();
    cleanup();
  });

  it('marks the enterprise card too — it is the most expensive number on the page', () => {
    render(
      <EnterprisePlanCard
        plan={plan({ id: 2, name: 'enterprise-cloud', displayName: 'Enterprise Cloud', price: 100000 })}
        currentPlanName={null}
        upgrading={null}
        onSelect={noop}
      />
    );

    expect(screen.getByText(formatMoney(100000, 'EUR'))).toBeInTheDocument();
    expect(screen.getByText(VAT_NOTE)).toBeInTheDocument();
    cleanup();
  });

  // CONTROL: nothing is added to nothing. Without this, a card that printed the note
  // unconditionally would pass both tests above while putting "excl. VAT" under €0.
  it('says nothing about VAT on a free plan', () => {
    render(
      <BasePlanCard
        plan={plan({ id: 3, name: 'free', displayName: 'Free', price: 0 })}
        currentPlanName={null}
        upgrading={null}
        onSelect={noop}
      />
    );

    expect(screen.queryByText(VAT_NOTE)).not.toBeInTheDocument();
    cleanup();
  });
});
