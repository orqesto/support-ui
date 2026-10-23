/**
 * Platform plans editor: "AI on our key" is bound to the plan's features.managedAi (BE #1112).
 * It starts from the flag (or the name rule when the plan has none) and sends only a change, as
 * `features: { managedAi }` (the server merges features).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const updates: unknown[] = [];
vi.mock('@/services/budgets.service', () => ({
  budgetsService: { getState: () => Promise.resolve({ available: false }) },
}));
vi.mock('@/hooks/usePlatformAdmin', () => {
  const idle = { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false, variables: undefined };
  const base = {
    planType: 'base',
    currency: 'EUR',
    billingInterval: 'month',
    isActive: true,
    stripePriceId: null,
    limits: { maxUsers: 1, maxIntegrations: 1, maxMessagesPerMonth: 500 },
  };
  return {
    usePlatformPlans: () => ({
      isLoading: false,
      isError: false,
      data: [
        {
          ...base,
          id: 1,
          name: 'free',
          displayName: 'Free',
          price: 0,
          features: { managedAi: true },
        },
        { ...base, id: 2, name: 'pro', displayName: 'Pro', price: 0, features: {} },
      ],
    }),
    usePlatformPlanStats: () => ({ data: {} }),
    useTogglePlatformPlan: () => idle,
    useUpdatePlatformPlan: () => ({
      ...idle,
      mutateAsync: (args: unknown) => {
        updates.push(args);
        return Promise.resolve({});
      },
    }),
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
const editPlan = (displayName: string) => {
  const card = screen.getByText(displayName).closest('[class*="rounded"]') as HTMLElement;
  fireEvent.click(within(card).getByRole('button', { name: 'Edit' }));
};
const toggle = () => screen.getByRole('switch', { name: /AI on our key/ });

beforeEach(() => {
  updates.length = 0;
});
afterEach(cleanup);

describe('PlatformPlans: AI on our key', () => {
  it('starts from features.managedAi (Free with the flag on reads on)', () => {
    renderPlans();
    editPlan('Free');
    expect(toggle()).toBeChecked();
  });

  it('no flag: the name rule (Pro reads on); unchanged ⇒ no features sent', async () => {
    renderPlans();
    editPlan('Pro');
    expect(toggle()).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(updates).toHaveLength(1));
    expect((updates[0] as { input: object }).input).not.toHaveProperty('features');
  });

  it('switched off ⇒ PATCH carries features.managedAi false', async () => {
    renderPlans();
    editPlan('Free');
    fireEvent.click(toggle());
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(updates).toHaveLength(1));
    expect(updates[0]).toMatchObject({ id: 1, input: { features: { managedAi: false } } });
  });
});
