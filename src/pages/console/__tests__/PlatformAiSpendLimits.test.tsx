/**
 * AI Spend after the monthly budgets replaced the daily token limits:
 * - the old limit cards, the limits column and the demo are gone; the budgets section sits under
 *   the spend charts and survives a backend without the budget API;
 * - "today" is a UTC day: the page still reads again just after 00:00 UTC.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ROUTER_FUTURE } from '@/test/routerFuture';
import type { ManagedAiUsageResult, OrgTokenBudget } from '@/services/managedAiUsage.service';

/** Plain functions: vitest 4 fails a test on a module-level vi.fn's caught rejection. */
let gets: number[] = [];
let getImpl: (days: number) => Promise<ManagedAiUsageResult> = () => Promise.resolve(page());
let saveImpl: () => Promise<unknown> = () => Promise.resolve(null);
let forecastImpl: () => Promise<unknown> = () => new Promise(() => {});
vi.mock('@/services/managedAiUsage.service', () => ({
  managedAiUsageService: {
    get: (days: number) => {
      gets.push(days);
      return getImpl(days);
    },
    getForecast: () => forecastImpl(),
    updateWorkspaceLimits: () => saveImpl().then((release) => ({ release, regularRelease: null })),
    updatePlatformLimits: () => Promise.resolve(undefined),
  },
}));
vi.mock('sonner', () => ({ toast: { success: () => {}, warning: () => {}, error: () => {} } }));
vi.mock('@/services/budgets.service', () => ({
  budgetsService: { getState: () => Promise.resolve({ available: false }) },
}));

const { PlatformAiSpend } = await import('../PlatformAiSpend');

const budget: OrgTokenBudget = {
  kb: { limit: 5_000_000, source: 'default', spentToday: 1_000 },
  regular: { limit: 2_000_000, source: 'default', spentToday: 1_000 },
  override: null,
  enforced: true,
  enforcementLookupFailed: false,
};
const tier = {
  tier: 'default' as const,
  totalTokens: 10,
  promptTokens: 10,
  completionTokens: 0,
  requests: 1,
  costEstimate: null,
};
const row = (organizationId: number, name: string) => ({
  organizationId,
  name,
  via: 'managed_mode' as const,
  platformKeyTokens: 10,
  ownKeyTokens: 0,
  calls: null,
  totalTokens: 10,
  byTier: [tier],
  tokenBudget: budget,
});
function page(): ManagedAiUsageResult {
  return {
    usage: {
      orgs: [row(1, 'Acme'), row(2, 'Bolt')],
      totals: {
        byTier: [tier],
        managedOrgCount: 2,
        tokenBudgets: {
          kb: { limit: 5_000_000, source: 'platform' },
          regular: { limit: 2_000_000, source: 'default' },
          ownKeyEnforced: false,
          workspaceOverrides: {},
          settingsLookupFailed: false,
        },
      },
    },
    meta: { from: '2026-08-23T00:00:00.000Z', to: '2026-09-22T00:00:00.000Z', days: 30 },
  } as ManagedAiUsageResult;
}

const renderPage = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter future={ROUTER_FUTURE}>
        <PlatformAiSpend />
      </MemoryRouter>
    </QueryClientProvider>
  );

beforeEach(() => {
  gets = [];
  getImpl = () => Promise.resolve(page());
  saveImpl = () => Promise.resolve(null);
  forecastImpl = () => new Promise(() => {});
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('AI Spend — monthly budgets in place of the daily limits', () => {
  it('no limit cards, no limits column, no demo; the budgets section says it needs the update', async () => {
    renderPage();
    expect(await screen.findByText('Bolt')).toBeTruthy();
    expect(await screen.findByText('Budgets need the latest server update.')).toBeInTheDocument();
    expect(screen.queryByText('Token limits · today / month')).toBeNull();
    expect(screen.queryByText('Daily token ceiling')).toBeNull();
    expect(screen.queryByText('Budget model (demo)')).toBeNull();
    expect(screen.queryAllByTitle(/Today since 00:00 UTC/)).toHaveLength(0);
  });

  it('reads again just after 00:00 UTC, so yesterday is not shown as today', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-09-30T23:59:30.000Z'));
    const readAt: number[] = [];
    getImpl = () => {
      readAt.push(Date.now());
      return Promise.resolve(page());
    };
    renderPage();
    await screen.findByText('Bolt');
    expect(gets).toHaveLength(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(40_000);
    });
    expect(gets).toHaveLength(2);
    // The second read is the NEW UTC day's (pass 9, NIT): not merely a second read.
    expect(readAt[1]).toBeGreaterThanOrEqual(Date.parse('2026-10-01T00:00:00.000Z'));
  });

  it('reads after 00:00 UTC in a hidden tab too — the figures are right when it is shown (pass 9)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-09-30T23:59:30.000Z'));
    renderPage();
    await screen.findByText('Bolt');
    focusManager.setFocused(false);
    try {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(40_000);
      });
      expect(gets).toHaveLength(2);
    } finally {
      focusManager.setFocused(undefined);
    }
  });
});
