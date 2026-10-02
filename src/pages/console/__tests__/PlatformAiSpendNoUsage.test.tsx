/**
 * R8 contract (BE audit pass 8, B8-4): a workspace listed only for its token-limit override has no
 * usage in the range — `via: 'no_usage'`, `calls: null`, in none of the key counts. It used to be
 * listed as 'own_key' and its cap column read "own key · no cap"; read as a missing cap it would
 * say "unknown".
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ROUTER_FUTURE } from '@/test/routerFuture';
import type { ManagedAiUsageResult, OrgTokenBudget } from '@/services/managedAiUsage.service';

let result: ManagedAiUsageResult;
vi.mock('@/services/managedAiUsage.service', () => ({
  managedAiUsageService: {
    get: () => Promise.resolve(result),
    getForecast: () => new Promise(() => {}),
    updateWorkspaceLimits: () => Promise.resolve(undefined),
    updatePlatformLimits: () => Promise.resolve(undefined),
  },
}));
vi.mock('sonner', () => ({ toast: { success: () => {}, warning: () => {}, error: () => {} } }));

const { PlatformAiSpend } = await import('../PlatformAiSpend');

const budget: OrgTokenBudget = {
  kb: { limit: 1_000_000, source: 'workspace', spentToday: 0 },
  regular: { limit: 2_000_000, source: 'default', spentToday: 0 },
  override: { kbTokensPerDay: 1_000_000 },
  enforced: false,
};
const emptyTier = (tier: 'default' | 'strong' | 'vision' | 'other') => ({
  tier,
  totalTokens: 0,
  promptTokens: 0,
  completionTokens: 0,
  requests: 0,
  costEstimate: null,
});
/** The backend's row for a workspace listed only for its override (managedAIUsageController). */
const noUsageRow = {
  organizationId: 44,
  name: 'Quiet',
  via: 'no_usage' as const,
  platformKeyTokens: 0,
  ownKeyTokens: 0,
  calls: null,
  tokenBudget: budget,
  totalTokens: 0,
  unpricedTokens: 0,
  costUsd: null,
  byTier: [emptyTier('default'), emptyTier('strong'), emptyTier('vision'), emptyTier('other')],
  byModel: [],
};
const ownKeyRow = { ...noUsageRow, organizationId: 45, name: 'Owner', via: 'own_key' as const };
// Something spent in the range: with nothing spent at all the page shows no table.
const spent = { ...emptyTier('default'), totalTokens: 500, promptTokens: 500, requests: 2 };
const managedRow = {
  ...noUsageRow,
  organizationId: 46,
  name: 'Busy',
  via: 'managed_mode' as const,
  platformKeyTokens: 500,
  totalTokens: 500,
  calls: { used: 2, limit: 1_000, remaining: 998, month: '2026-10' },
  byTier: [spent],
};
const page = (rows: Array<typeof noUsageRow | typeof ownKeyRow>): ManagedAiUsageResult =>
  ({
    usage: {
      orgs: [managedRow, ...rows],
      totals: {
        byTier: [spent],
        managedOrgCount: 1,
        defaultKeyOrgCount: 0,
        ownKeyOrgCount: rows.filter((row) => row.via === 'own_key').length,
        tokenBudgets: {
          kb: { limit: 5_000_000, source: 'default' },
          regular: { limit: 2_000_000, source: 'default' },
          ownKeyEnforced: false,
          workspaceOverrides: { '44': { kbTokensPerDay: 1_000_000 } },
        },
      },
    },
    meta: { from: '2026-09-01T00:00:00.000Z', to: '2026-10-01T00:00:00.000Z', days: 30 },
  }) as ManagedAiUsageResult;

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

const rowOf = async (name: string) =>
  (await screen.findByText(name)).closest('tr') as HTMLTableRowElement;

afterEach(() => cleanup());

describe('AI Spend — a workspace listed only for its limits (via no_usage)', () => {
  it('says "no usage", never "own key" or an unknown cap, and is counted apart', async () => {
    result = page([noUsageRow]);
    renderPage();
    const row = within(await rowOf('Quiet'));
    expect(row.getByText('no usage')).toBeTruthy();
    expect(row.getByText('not read · no usage')).toBeTruthy();
    // (The limits cell may still say "own key, measured only": that is its enforcement reading.)
    expect(row.queryByText('own key')).toBeNull();
    expect(row.queryByText('own key · no cap')).toBeNull();
    expect(row.queryByText('unknown')).toBeNull();
    expect(screen.getByText(/· 1 listed for a limit, no usage/)).toBeTruthy();
  });

  it('CONTROL: an own-key workspace keeps its own words, and nothing is counted as no usage', async () => {
    result = page([ownKeyRow]);
    renderPage();
    const row = within(await rowOf('Owner'));
    expect(row.getByText('own key')).toBeTruthy();
    expect(row.getByText('own key · no cap')).toBeTruthy();
    expect(screen.queryByText(/listed for a limit, no usage/)).toBeNull();
  });
});
