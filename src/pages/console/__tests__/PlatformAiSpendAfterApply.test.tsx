/**
 * AI Spend after the AI budgets are applied (staging findings, release punch list F5/F6): the
 * AI-calls column is a count, never "AI calls / month (plan)", and the By-model note says what
 * budgets do with an unpriced model (count it at the highest known rate) instead of "listed rather
 * than priced at a guess". Before Apply the plan column keeps its old title.
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ManagedAiUsageResult } from '@/services/managedAiUsage.service';

let budgetsActive = true;
vi.mock('@/services/budgets.service', () => ({
  budgetsService: {
    getState: () =>
      Promise.resolve({
        available: true,
        state: {
          currency: 'USD',
          active: budgetsActive,
          selfHosted: false,
          settings: {
            version: 2,
            bulkPctMin: 50,
            bulkPctMax: 90,
            defaultBulkPct: 60,
            microsPerMessage: 4000,
            serverCeiling: null,
            defaultStandaloneBudget: null,
            liveSpikeFactor: 3,
            workspaceBulkLimits: {},
          },
          server: null,
          requests: 0,
          requestList: [],
        },
      }),
    listGroups: () => Promise.resolve({ items: [], total: 0 }),
    getMigration: () => Promise.resolve({ rows: [], groups: [] }),
  },
}));

const { PlatformAiSpend } = await import('../PlatformAiSpend');

const get = vi.fn();
vi.mock('@/services/managedAiUsage.service', () => ({
  managedAiUsageService: { get: (days: number) => get(days) as unknown },
}));

const payload = (): ManagedAiUsageResult => ({
  usage: {
    orgs: [
      {
        organizationId: 18,
        name: 'Northwind',
        calls: null,
        totalTokens: 3_000_000,
        costUsd: 2.25,
        unpricedTokens: 1_000_000,
        byTier: [
          {
            tier: 'default',
            totalTokens: 2_000_000,
            promptTokens: 1_000_000,
            completionTokens: 1_000_000,
            requests: 10,
            costEstimate: 2.25,
            unpricedTokens: 0,
          },
          {
            tier: 'other',
            totalTokens: 1_000_000,
            promptTokens: 900_000,
            completionTokens: 100_000,
            requests: 5,
            costEstimate: null,
            unpricedTokens: 1_000_000,
          },
        ],
        byModel: [
          {
            model: 'gpt-5-mini',
            tier: 'default',
            totalTokens: 2_000_000,
            promptTokens: 1_000_000,
            completionTokens: 1_000_000,
            requests: 10,
            costUsd: 2.25,
            rateSource: 'list',
          },
          {
            model: 'retired-model-v1',
            tier: 'other',
            totalTokens: 1_000_000,
            promptTokens: 900_000,
            completionTokens: 100_000,
            requests: 5,
            costUsd: null,
            rateSource: null,
          },
        ],
      },
    ],
    totals: {
      byTier: [
        {
          tier: 'default',
          totalTokens: 3_000_000,
          promptTokens: 1_900_000,
          completionTokens: 1_100_000,
          requests: 15,
          costEstimate: 2.25,
          unpricedTokens: 1_000_000,
        },
      ],
      managedOrgCount: 1,
      cost: {
        usd: 2.25,
        eur: 2.07,
        usdToEur: 0.92,
        usdToEurIsDefault: true,
        pricesAsOf: '2026-09-09',
        pricedTokens: 2_000_000,
        unpricedTokens: 1_000_000,
      },
    },
  },
  meta: { from: new Date('2026-08-10').toISOString(), to: new Date().toISOString(), days: 30 },
});

const renderPage = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <PlatformAiSpend />
      </MemoryRouter>
    </QueryClientProvider>
  );
};

beforeEach(() => {
  budgetsActive = true;
  get.mockResolvedValue(payload());
});
afterEach(cleanup);

describe('AI Spend after Apply', () => {
  it('the AI-calls column is a count, not the plan limit', async () => {
    renderPage();
    expect(
      await screen.findByRole('columnheader', { name: /AI calls \(count\)/ })
    ).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: /AI calls \/ month \(plan\)/ })).toBeNull();
  });

  it('the By-model note says budgets count an unpriced model at the highest known rate', async () => {
    renderPage();
    expect(
      await screen.findByText(/the AI budgets count it at\s+the highest known rate/)
    ).toBeInTheDocument();
    expect(screen.queryByText(/rather than priced at a guess/)).not.toBeInTheDocument();
  });

  it('before Apply the plan column keeps its title (the cap still refuses work)', async () => {
    budgetsActive = false;
    renderPage();
    expect(
      await screen.findByRole('columnheader', { name: /AI calls \/ month \(plan\)/ })
    ).toBeInTheDocument();
  });
});
