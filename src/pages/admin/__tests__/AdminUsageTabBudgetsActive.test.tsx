/**
 * Release punch list F2: the platform usage table decides "budgets applied" from the PLATFORM
 * budget state, not the workspace-scoped /api/usage/current (a global admin without a workspace
 * gets a 400 there and kept the old AI-call warnings after Apply).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const urls: string[] = [];
vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: (url: string) => {
      urls.push(url);
      if (url.startsWith('/api/usage/current')) {
        return Promise.reject(Object.assign(new Error('No workspace'), { status: 400 }));
      }
      if (url.startsWith('/api/subscriptions/plans')) {
        return Promise.resolve({ data: { success: true, data: { plans: [] } } });
      }
      return Promise.resolve({ data: { data: [] } });
    },
    post: () => Promise.resolve({ data: {} }),
  },
}));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

let state: unknown;
vi.mock('@/services/budgets.service', () => ({
  budgetsService: { getState: () => Promise.resolve(state) },
}));

const { AdminUsageTab } = await import('../AdminUsageTab');

const renderTab = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <AdminUsageTab />
      </MemoryRouter>
    </QueryClientProvider>
  );

beforeEach(() => {
  urls.length = 0;
});
afterEach(cleanup);

describe('AdminUsageTab: budgets applied', () => {
  it('reads the platform budget state: active ⇒ "AI calls (count)", and never asks /api/usage/current', async () => {
    state = { available: true, state: { active: true } };
    renderTab();
    expect(await screen.findByText('AI calls (count)')).toBeInTheDocument();
    expect(urls.some((url) => url.startsWith('/api/usage/current'))).toBe(false);
  });

  it('before Apply, or an older backend without the budget API: the old AI Calls column', async () => {
    state = { available: false };
    renderTab();
    expect(await screen.findByText('AI Calls')).toBeInTheDocument();
  });
});
