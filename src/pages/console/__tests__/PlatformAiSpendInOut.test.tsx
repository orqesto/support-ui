/**
 * Input (prompt) and output (completion) tokens are priced apart, so the spend page shows them
 * apart. A backend row without the split is unknown — a dash, never 0.
 */
import { vi, describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ManagedAiUsageResult } from '@/services/managedAiUsage.service';
// The old limits UI shows only while the monthly budgets are not switched on: a backend without
// the budget API here.
vi.mock('@/services/budgets.service', () => ({
  budgetsService: { getState: () => Promise.resolve({ available: false }) },
}));

import { PlatformAiSpend } from '../PlatformAiSpend';

const get = vi.fn();
vi.mock('@/services/managedAiUsage.service', () => ({
  managedAiUsageService: { get: (days: number) => get(days) as unknown },
}));

const payload = (): ManagedAiUsageResult => ({
  usage: {
    orgs: [
      {
        organizationId: 7,
        name: 'Example Workspace',
        calls: null,
        totalTokens: 3_000_000,
        costUsd: null,
        byTier: [
          {
            tier: 'default',
            totalTokens: 2_000_000,
            promptTokens: 1_500_000,
            completionTokens: 500_000,
            requests: 10,
            costEstimate: null,
          },
          {
            tier: 'strong',
            totalTokens: 1_000_000,
            promptTokens: 700_000,
            completionTokens: 300_000,
            requests: 5,
            costEstimate: null,
          },
        ],
        byModel: [
          {
            model: 'model-alpha',
            tier: 'default',
            totalTokens: 2_000_000,
            promptTokens: 1_500_000,
            completionTokens: 500_000,
            requests: 10,
            costUsd: null,
            rateSource: null,
          },
          {
            model: 'model-beta',
            tier: 'strong',
            totalTokens: 1_000_000,
            promptTokens: 700_000,
            completionTokens: 300_000,
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
          promptTokens: 2_200_000,
          completionTokens: 800_000,
          requests: 15,
          costEstimate: null,
        },
      ],
      managedOrgCount: 1,
    },
  },
  meta: { from: new Date('2026-08-10').toISOString(), to: new Date().toISOString(), days: 30 },
});

/** The same usage from a backend that does not report the prompt/completion split. */
const payloadWithoutSplit = (): ManagedAiUsageResult => {
  const result = payload();
  const strip = (row: object) => {
    delete (row as { promptTokens?: number }).promptTokens;
    delete (row as { completionTokens?: number }).completionTokens;
  };
  result.usage.orgs[0].byTier.forEach(strip);
  (result.usage.orgs[0].byModel ?? []).forEach(strip);
  return result;
};

const renderPage = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <PlatformAiSpend />
    </QueryClientProvider>
  );
};

/** The cell under the "In / Out" header of the table holding `rowText`. */
const inOutCell = async (rowText: string) => {
  const row = (await screen.findByText(rowText)).closest('tr') as HTMLElement;
  const table = row.closest('table') as HTMLElement;
  const headers = within(table).getAllByRole('columnheader');
  const column = headers.findIndex((header) => header.textContent === 'In / Out');
  expect(column).toBeGreaterThan(-1);
  return within(row).getAllByRole('cell')[column].textContent;
};

afterEach(cleanup);

describe('AI Spend — input / output tokens', () => {
  it('shows a workspace’s prompt / completion summed over its tiers', async () => {
    get.mockResolvedValue(payload());
    renderPage();
    expect(await inOutCell('Example Workspace')).toBe(
      `${(2_200_000).toLocaleString()} / ${(800_000).toLocaleString()}`
    );
  });

  it('shows each model’s prompt / completion', async () => {
    get.mockResolvedValue(payload());
    renderPage();
    expect(await inOutCell('model-alpha')).toBe(
      `${(1_500_000).toLocaleString()} / ${(500_000).toLocaleString()}`
    );
  });

  it('renders a dash, not 0, when the backend omits the split', async () => {
    get.mockResolvedValue(payloadWithoutSplit());
    renderPage();
    expect(await inOutCell('Example Workspace')).toBe('—');
    expect(await inOutCell('model-alpha')).toBe('—');
  });
});
