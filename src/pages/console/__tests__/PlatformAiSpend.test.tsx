/**
 * The platform key pays for every managed workspace's AI, and until this page nothing in the
 * app said how much or for whom — the org-scoped token endpoint resolves its org from the
 * SESSION, so from the platform console it answers for the operator's own workspace and
 * reports a confident zero for everyone else.
 *
 * The states that matter are the ones that could quietly lie: an unpriced tier must never
 * render as 0.00 (that reads as free, not unknown), and "nobody is managed" must not look
 * like "nobody spent".
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type {
  ManagedAiTier,
  ManagedAiTierStat,
  ManagedAiUsageResult,
} from '@/services/managedAiUsage.service';
import { PlatformAiSpend } from '../PlatformAiSpend';

const get = vi.fn();
vi.mock('@/services/managedAiUsage.service', () => ({
  managedAiUsageService: { get: (days: number) => get(days) as unknown },
}));

const tier = (
  name: ManagedAiTier,
  totalTokens: number,
  costEstimate: number | null
): ManagedAiTierStat => ({
  tier: name,
  totalTokens,
  promptTokens: totalTokens,
  completionTokens: 0,
  requests: totalTokens > 0 ? 2 : 0,
  costEstimate,
});

const result = (over: Partial<ManagedAiUsageResult['usage']> = {}): ManagedAiUsageResult => ({
  usage: {
    orgs: [
      {
        organizationId: 18,
        name: 'framehouse',
        calls: { used: 7935, limit: 96000, remaining: 88065 },
        totalTokens: 20_800_000,
        byTier: [
          tier('default', 20_000_000, 12.5),
          tier('strong', 800_000, 4),
          tier('other', 0, null),
        ],
      },
      {
        organizationId: 21,
        name: 'adapta',
        calls: null,
        totalTokens: 1_000,
        byTier: [tier('default', 1_000, 0.01), tier('strong', 0, null), tier('other', 0, null)],
      },
    ],
    totals: {
      byTier: [
        tier('default', 20_001_000, 12.51),
        tier('strong', 800_000, 4),
        tier('other', 0, null),
      ],
      managedOrgCount: 2,
    },
    ...over,
  },
  meta: { from: '2026-08-02T00:00:00.000Z', to: '2026-09-01T00:00:00.000Z', days: 30 },
});

const renderPage = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <PlatformAiSpend />
    </QueryClientProvider>
  );

beforeEach(() => {
  get.mockReset();
});
afterEach(cleanup);

describe('Platform → AI Spend', () => {
  it('names every managed workspace and what it spent, busiest first', async () => {
    get.mockResolvedValue(result());
    renderPage();

    expect(await screen.findByText('framehouse')).toBeInTheDocument();
    expect(screen.getByText('adapta')).toBeInTheDocument();
    expect(screen.getByText('20,800,000')).toBeInTheDocument();
    // The whole point of the page: whose spend it is, not just that spend happened.
    expect(screen.getByText('#18')).toBeInTheDocument();
  });

  it('shows the monthly call cap where it is known, and says so where it is not', async () => {
    get.mockResolvedValue(result());
    renderPage();

    expect(await screen.findByText('7,935 / 96,000 calls')).toBeInTheDocument();
    // adapta's limits could not be read — "unknown", never a comforting 0/0.
    expect(screen.getByText('unknown')).toBeInTheDocument();
  });

  it('never prices an unpriced tier at zero', async () => {
    get.mockResolvedValue(
      result({
        totals: {
          byTier: [tier('default', 5_000, null), tier('other', 1_000, null)],
          managedOrgCount: 1,
        },
      })
    );
    renderPage();

    await waitFor(() => expect(screen.getByText('Estimated cost')).toBeInTheDocument());
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.getByText(/no PLATFORM_AI_\*_COST_PER_1K rate configured/)).toBeInTheDocument();
    expect(screen.queryByText('0.00')).not.toBeInTheDocument();
  });

  it('says what is excluded when only some tokens carry a rate', async () => {
    get.mockResolvedValue(
      result({
        totals: {
          byTier: [tier('default', 5_000, 3), tier('other', 1_000, null)],
          managedOrgCount: 1,
        },
      })
    );
    renderPage();

    expect(await screen.findByText('3.00')).toBeInTheDocument();
    expect(screen.getByText(/excludes 1,000 unpriced tokens/)).toBeInTheDocument();
  });

  it('distinguishes "nobody is managed" from "nobody spent"', async () => {
    get.mockResolvedValue(result({ orgs: [], totals: { byTier: [], managedOrgCount: 0 } }));
    const { unmount } = renderPage();
    expect(await screen.findByText(/No workspace is in managed mode/)).toBeInTheDocument();
    unmount();

    get.mockResolvedValue(
      result({ orgs: [], totals: { byTier: [tier('default', 0, null)], managedOrgCount: 3 } })
    );
    renderPage();
    expect(await screen.findByText(/3 managed workspaces, and no AI spend/)).toBeInTheDocument();
  });

  it('surfaces what the backend said when the read fails', async () => {
    get.mockRejectedValue({ status: 403, data: { error: 'Global admin required' } });
    renderPage();

    expect(await screen.findByText('Global admin required')).toBeInTheDocument();
  });
});
