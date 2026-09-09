/**
 * "Estimated cost —" stood against 45,092,916 tokens for as long as this page existed,
 * because the figure was gated on `PLATFORM_AI_*_COST_PER_1K` rates nobody ever set.
 * Built-in list prices fill that gap; these tests pin the parts that keep it honest —
 * the coverage statement, the dated prices, the rate behind the euro figure, and the
 * per-model table that finally makes "Unpriced" answerable.
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ManagedAiUsageResult } from '@/services/managedAiUsage.service';
import { PlatformAiSpend } from '../PlatformAiSpend';

const get = vi.fn();
vi.mock('@/services/managedAiUsage.service', () => ({
  managedAiUsageService: { get: (days: number) => get(days) as unknown },
}));

const payload = (): ManagedAiUsageResult => ({
  usage: {
    orgs: [
      {
        organizationId: 18,
        name: 'framehouse',
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
      byTier: [],
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
      <PlatformAiSpend />
    </QueryClientProvider>
  );
};

beforeEach(() => get.mockResolvedValue(payload()));
afterEach(cleanup);

describe('AI Spend cost', () => {
  it('shows a dollar figure instead of a dash', async () => {
    renderPage();
    expect(await screen.findByText('≈ $2.25')).toBeInTheDocument();
  });

  it('shows euro as secondary, with the rate and that it is a default', async () => {
    renderPage();
    // A bare euro total reads more precise than a converted estimate is.
    expect(await screen.findByText(/≈ €2\.07 · at 0\.92 USD\/EUR \(default\)/)).toBeInTheDocument();
  });

  it('states the coverage and dates the prices', async () => {
    renderPage();
    // The hole in the number is stated on the tile, not left for someone to discover.
    expect(
      await screen.findByText(/list prices as of 2026-09-09 · excludes 1,000,000 unpriced tokens/)
    ).toBeInTheDocument();
  });

  it('names the unpriced model rather than leaving "Unpriced" unanswerable', async () => {
    renderPage();
    expect(await screen.findByText('retired-model-v1')).toBeInTheDocument();
    expect(screen.getByText('no published rate')).toBeInTheDocument();
    expect(screen.getByText('gpt-5-mini')).toBeInTheDocument();
  });

  it('never prices the unpriced model at zero', async () => {
    renderPage();
    await screen.findByText('retired-model-v1');
    expect(screen.queryByText('≈ 0.00')).not.toBeInTheDocument();
  });
});

describe('the tier column that used to be called "Unpriced"', () => {
  it('does not claim a tier is unpriced when its models are priced', async () => {
    // `other` = "not a current tier model", which is a different thing from "no rate".
    // A since-changed tier model lands there and is priced fine from the list table.
    get.mockResolvedValue({
      ...payload(),
      usage: {
        ...payload().usage,
        totals: {
          ...payload().usage.totals,
          byTier: [
            {
              tier: 'other',
              totalTokens: 9_667_902,
              promptTokens: 9_000_000,
              completionTokens: 667_902,
              requests: 100,
              costEstimate: 1.75,
              unpricedTokens: 0,
            },
          ],
        },
      },
    });
    renderPage();
    expect(await screen.findByText('Other models')).toBeInTheDocument();
    expect(screen.queryByText('Unpriced')).not.toBeInTheDocument();
  });
});
