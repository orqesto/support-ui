/**
 * AI Spend shows ALL AI spend, split by the key that paid (owner, 2026-09-22: "we should count
 * all even if it's managed by default ai" → "all spend, everywhere", so taco can track tokens).
 * Each label must stay true in every state the backend can report — including an older backend
 * that counted managed mode only and could not see the rest.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ROUTER_FUTURE } from '@/test/routerFuture';
import type { ManagedAiTierStat, ManagedAiUsageResult } from '@/services/managedAiUsage.service';

const get = vi.fn();
vi.mock('@/services/managedAiUsage.service', () => ({
  managedAiUsageService: { get: (days: number) => get(days) as unknown },
}));

const { PlatformAiSpend } = await import('../PlatformAiSpend');

const tier = (totalTokens: number): ManagedAiTierStat => ({
  tier: 'default',
  totalTokens,
  promptTokens: totalTokens,
  completionTokens: 0,
  requests: totalTokens > 0 ? 1 : 0,
  costEstimate: null,
});

const usage = (
  totals: Partial<ManagedAiUsageResult['usage']['totals']>,
  orgs: ManagedAiUsageResult['usage']['orgs'] = []
): ManagedAiUsageResult => ({
  usage: {
    orgs,
    totals: {
      byTier: [tier(orgs.reduce((sum, row) => sum + row.totalTokens, 0))],
      managedOrgCount: 0,
      ...totals,
    },
  },
  meta: { from: '2026-08-23T00:00:00.000Z', to: '2026-09-22T00:00:00.000Z', days: 30 },
});

const org = (
  organizationId: number,
  name: string,
  via: 'managed_mode' | 'default_key' | 'own_key',
  platformKeyTokens: number,
  ownKeyTokens: number
) => ({
  organizationId,
  name,
  via,
  platformKeyTokens,
  ownKeyTokens,
  calls: null,
  totalTokens: platformKeyTokens + ownKeyTokens,
  byTier: [tier(platformKeyTokens + ownKeyTokens)],
});

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

afterEach(cleanup);

const splitTotals = (over: Record<string, number> = {}) => ({
  managedOrgCount: 1,
  defaultKeyOrgCount: 1,
  ownKeyOrgCount: 1,
  platformKeyTokens: 1300,
  ownKeyTokens: 900,
  ...over,
});

describe('AI Spend — all spend, split by key', () => {
  it('lists every kind of workspace and labels which key paid', async () => {
    get.mockResolvedValue(
      usage(splitTotals(), [
        org(1, 'Managed Co', 'managed_mode', 1000, 0),
        org(2, 'Default Key Co', 'default_key', 300, 200),
        org(3, 'Taco WS', 'own_key', 0, 700),
      ])
    );
    renderPage();
    expect(await screen.findByText('Workspaces')).toBeInTheDocument();
    expect(
      screen.getByText(/1 managed · 1 platform key via settings · 1 own key/)
    ).toBeInTheDocument();
    const rowOf = (name: string) => screen.getByText(name).closest('tr') as HTMLElement;
    expect(within(rowOf('Taco WS')).getByText('own key')).toBeInTheDocument();
    expect(
      within(rowOf('Default Key Co')).getByText('platform key via settings')
    ).toBeInTheDocument();
    expect(within(rowOf('Managed Co')).queryByText(/own key|via settings/)).toBeNull();
  });

  it('an own-key workspace has no platform cap — it says so instead of "unknown"', async () => {
    get.mockResolvedValue(
      usage(splitTotals({ managedOrgCount: 0, defaultKeyOrgCount: 0 }), [
        org(3, 'Taco WS', 'own_key', 0, 700),
      ])
    );
    renderPage();
    const taco = (await screen.findByText('Taco WS')).closest('tr') as HTMLElement;
    expect(within(taco).getByText('own key · no cap')).toBeInTheDocument();
    expect(within(taco).queryByText('unknown')).toBeNull();
  });

  it('an own-key-only install (taco) is NOT reported as empty', async () => {
    get.mockResolvedValue(
      usage(splitTotals({ managedOrgCount: 0, defaultKeyOrgCount: 0 }), [
        org(3, 'Taco WS', 'own_key', 0, 700),
      ])
    );
    renderPage();
    expect(await screen.findByText('Taco WS')).toBeInTheDocument();
    expect(screen.queryByText(/No AI spend in this window/)).toBeNull();
    expect(screen.queryByText(/No workspace is in managed mode/)).toBeNull();
  });

  it('shows the token split beside the total', async () => {
    get.mockResolvedValue(usage(splitTotals(), [org(1, 'Managed Co', 'managed_mode', 1000, 0)]));
    renderPage();
    expect(await screen.findByText(/on the platform key ·/)).toBeInTheDocument();
    expect(screen.getByText(/on own keys/)).toBeInTheDocument();
  });

  it('nothing anywhere: the new backend says no spend on any key', async () => {
    get.mockResolvedValue(
      usage(
        splitTotals({
          managedOrgCount: 0,
          defaultKeyOrgCount: 0,
          ownKeyOrgCount: 0,
          platformKeyTokens: 0,
          ownKeyTokens: 0,
        })
      )
    );
    renderPage();
    expect(await screen.findByText(/No AI spend in this window, on any key/)).toBeInTheDocument();
  });
});
