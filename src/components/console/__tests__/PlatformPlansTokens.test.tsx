/**
 * Plan cards show messages and, for admins, the AI money a plan carries (messages × money per
 * message); the line under the list says each workspace has its own allowance by default. A backend
 * without the budgets API shows neither. No AI-calls figure.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

let stateResult: { available: false } | { available: true; state: unknown };

vi.mock('@/services/budgets.service', () => ({
  budgetsService: { getState: () => Promise.resolve(stateResult) },
}));
vi.mock('@/hooks/usePlatformAdmin', () => {
  const idle = { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false, variables: undefined };
  return {
    usePlatformPlans: () => ({
      isLoading: false,
      isError: false,
      data: [
        {
          id: 1,
          name: 'starter',
          displayName: 'Starter',
          planType: 'base',
          price: 1000,
          currency: 'EUR',
          billingInterval: 'month',
          isActive: true,
          stripePriceId: 'price_1',
          limits: {
            maxUsers: 3,
            maxIntegrations: 2,
            maxMessagesPerMonth: 4000,
            maxAICallsPerMonth: 10000,
          },
        },
        {
          id: 2,
          name: 'free',
          displayName: 'Free',
          planType: 'base',
          price: 0,
          currency: 'EUR',
          billingInterval: 'month',
          isActive: true,
          stripePriceId: null,
          limits: { maxUsers: 1, maxIntegrations: 1, maxMessagesPerMonth: 500 },
        },
      ],
    }),
    usePlatformPlanStats: () => ({ data: {} }),
    useTogglePlatformPlan: () => idle,
    useUpdatePlatformPlan: () => idle,
    useCreatePlatformPlan: () => idle,
    useDeletePlatformPlan: () => idle,
    useCreatePlanStripePrice: () => idle,
  };
});

const { PlatformPlans } = await import('../PlatformPlans');

const renderPlans = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <PlatformPlans />
    </QueryClientProvider>
  );

const POOLING = /Each workspace in an organisation has its own AI allowance by default/;

beforeEach(() => {
  stateResult = { available: true, state: { settings: { microsPerMessage: 4000 } } };
});
afterEach(cleanup);

describe('PlatformPlans tokens', () => {
  it('shows messages x money per message (Starter 4,000 => about $16.00) and no AI-calls figure', async () => {
    renderPlans();
    expect(await screen.findByText(POOLING)).toBeInTheDocument();
    expect(screen.getByText('≈ $16.00')).toBeInTheDocument();
    expect(screen.queryByText(/AI calls/)).toBeNull();
    expect(screen.queryByText(/pool their/)).toBeNull();
    expect(screen.queryByText(/tokens \/ month/)).toBeNull();
  });

  it('shows no "AI included, about $" line on Free (no managed AI)', async () => {
    renderPlans();
    expect(await screen.findByTestId('plan-ai-money-1')).toBeInTheDocument();
    expect(screen.getByText('Free')).toBeInTheDocument();
    expect(screen.queryByTestId('plan-ai-money-2')).toBeNull();
  });

  it('shows nothing extra when the budgets API is unavailable', async () => {
    stateResult = { available: false };
    renderPlans();
    expect(await screen.findByText('Starter')).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByText(/tokens \/ month/)).toBeNull();
    expect(screen.queryByText(POOLING)).toBeNull();
    expect(screen.queryByText(/≈ \$/)).toBeNull();
    expect(screen.queryByText(/AI calls/)).toBeNull();
  });
});
