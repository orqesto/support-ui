/**
 * Plan cards show the pooling line under the list when the budgets API exists; a backend without it
 * shows no pooling line. (The old "calls × tokens per call" figure is gone: AI is money now.)
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
            maxMessagesPerMonth: 500,
            maxAICallsPerMonth: 10000,
          },
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

const POOLING = /Organisations pool their workspaces' budgets/;

beforeEach(() => {
  stateResult = { available: true, state: { settings: { microsPerMessage: 4000 } } };
});
afterEach(cleanup);

describe('PlatformPlans tokens', () => {
  it('shows the pooling line and no token figure', async () => {
    renderPlans();
    expect(await screen.findByText(POOLING)).toBeInTheDocument();
    expect(screen.queryByText(/tokens \/ month/)).toBeNull();
  });

  it('shows nothing extra when the budgets API is unavailable', async () => {
    stateResult = { available: false };
    renderPlans();
    expect(await screen.findByText('Starter')).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByText(/tokens \/ month/)).toBeNull();
    expect(screen.queryByText(POOLING)).toBeNull();
    expect(screen.getByText(/AI calls\/month/)).toBeInTheDocument();
  });
});
