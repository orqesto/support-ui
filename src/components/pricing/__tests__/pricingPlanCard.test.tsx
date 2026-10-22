/**
 * In-app plan cards: Free names its starter allowance (owner decision 2026-10-22), an unlimited
 * history import reads "Unlimited", never "999,999 days" (T12), and managed AI goes by plan NAME
 * (kept by design: the backend's decideManagedEntitlement uses the same rule).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { BasePlanCard, planHasManagedAi, type Plan } from '../PricingPlanCard';

afterEach(cleanup);

const plan = (name: string, maxHistoryDays: number): Plan => ({
  id: 1,
  name,
  displayName: name,
  planType: 'base',
  price: name === 'free' ? 0 : 5000,
  currency: 'EUR',
  billingInterval: 'month',
  features: {},
  limits: { maxUsers: 3, maxMessagesPerMonth: 500, maxIntegrations: 1, maxHistoryDays },
});

const show = (value: Plan) =>
  render(<BasePlanCard plan={value} currentPlanName={null} upgrading={null} onSelect={() => {}} />);

describe('plan cards', () => {
  it('Free: own AI key with a starter allowance of AI on us; no "AI included"', () => {
    show(plan('free', 30));
    expect(
      screen.getByText('Your own AI key, with a starter allowance of AI on us')
    ).toBeInTheDocument();
    expect(screen.queryByText('AI included')).not.toBeInTheDocument();
  });

  it('a paid plan does not carry the Free line', () => {
    show(plan('pro', 365));
    expect(screen.getByText('AI included')).toBeInTheDocument();
    expect(screen.queryByText(/starter allowance/)).not.toBeInTheDocument();
  });

  it('unlimited history import: "Unlimited history import", never 999,999 days', () => {
    show(plan('enterprise', 999999));
    expect(screen.getByText('Unlimited history import')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/999,999|999999/);
  });

  it('a real number of days is still shown', () => {
    show(plan('pro', 365));
    expect(screen.getByText('365 days')).toBeInTheDocument();
  });

  it('kept by design: managed AI by plan name, as the backend decides it', () => {
    expect(planHasManagedAi({ name: 'free' })).toBe(false);
    expect(planHasManagedAi({ name: 'admin' })).toBe(false);
    expect(planHasManagedAi({ name: 'pro' })).toBe(true);
    expect(planHasManagedAi({ name: 'starter' })).toBe(true);
  });
});
