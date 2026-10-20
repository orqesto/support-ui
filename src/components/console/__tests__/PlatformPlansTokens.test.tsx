/**
 * Plan cards show the AI calls a month with what that is in tokens (calls × tokensPerCall from the
 * budgets state) and the pooling line under the list; a backend without the budgets API shows neither.
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
          limits: { maxUsers: 3, maxIntegrations: 2, maxMessagesPerMonth: 500, maxAICallsPerMonth: 10000 },
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
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <PlatformPlans />
    </QueryClientProvider>
  );

const POOLING = /Organisations pool their workspaces' budgets/;

beforeEach(() => {
  stateResult = { available: true, state: { settings: { tokensPerCall: 1490 } } };
});
afterEach(cleanup);

describe('PlatformPlans tokens', () => {
  it('shows calls × tokensPerCall and the pooling line', async () => {
    renderPlans();
    expect(await screen.findByText(/≈ 14\.9M tokens \/ month/)).toBeInTheDocument();
    expect(screen.getByText(POOLING)).toBeInTheDocument();
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
