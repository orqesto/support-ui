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
import { render, screen, cleanup, waitFor, within } from '@testing-library/react';
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
      tokenCeilingPerOrgPerDay: 2_000_000,
      tokenCeilingIsDefault: true,
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

  /**
   * The cap column runs on a calendar month and resets on the 1st; every column beside it
   * answers the 7/30/90 selector. Staging 2026-09-02 showed 21,095,737 tokens next to
   * `0 / 96,000 calls` — both right, and together they read as "nothing is being spent"
   * three days after the burn this page exists to surface.
   */
  describe('the cap column names its own window', () => {
    const withMonth = (month?: string): ManagedAiUsageResult => {
      const base = result();
      base.usage.orgs[0].calls = { used: 0, limit: 96000, remaining: 96000, ...(month ? { month } : {}) };
      return base;
    };

    it('labels the cap column header with the month it counts', async () => {
      get.mockResolvedValue(withMonth('2026-09'));
      renderPage();

      // Scoped to the header: the footnote below names the month too, so a bare
      // text query matches twice and proves nothing about where the label landed.
      const header = await screen.findByRole('columnheader', { name: /Monthly cap/ });
      expect(within(header).getByText(/September 2026/)).toBeInTheDocument();
    });

    it('says the windows disagree when the range starts before the cap reset', async () => {
      // meta.from is 2026-08-02; the cap counts September only.
      get.mockResolvedValue(withMonth('2026-09'));
      renderPage();

      expect(
        await screen.findByText(/resets on the 1st and does not follow the range above/)
      ).toBeInTheDocument();
    });

    it('stays silent when the range sits inside the cap month', async () => {
      const inMonth = withMonth('2026-08');
      inMonth.meta = { from: '2026-08-10T00:00:00.000Z', to: '2026-08-20T00:00:00.000Z', days: 10 };
      get.mockResolvedValue(inMonth);
      renderPage();

      expect(await screen.findByText('framehouse')).toBeInTheDocument();
      expect(screen.queryByText(/does not follow the range above/)).not.toBeInTheDocument();
    });

    it('renders exactly as before against an API that does not send the month', async () => {
      // The backend half ships first, but this bundle can reach a prod that lacks it.
      get.mockResolvedValue(withMonth(undefined));
      renderPage();

      expect(await screen.findByText('0 / 96,000 calls')).toBeInTheDocument();
      expect(screen.queryByText(/undefined/)).not.toBeInTheDocument();
      expect(screen.queryByText(/does not follow the range above/)).not.toBeInTheDocument();
    });
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
    // Scoped to the cost card: '—' is the honest answer in more than one tile now.
    const costCard = screen.getByText('Estimated cost').closest('div');
    expect(within(costCard as HTMLElement).getByText('—')).toBeInTheDocument();
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
  it('says whether the token ceiling is a decision or a default', async () => {
    get.mockResolvedValue(result());
    renderPage();
    expect(await screen.findByText('2,000,000')).toBeInTheDocument();
    expect(screen.getByText(/platform default, not configured/)).toBeInTheDocument();
  });

  it('an explicit zero is the budget switched OFF, not an unset one', async () => {
    get.mockResolvedValue(
      result({
        totals: {
          byTier: [tier('default', 5_000, 3)],
          managedOrgCount: 1,
          tokenCeilingPerOrgPerDay: 0,
          tokenCeilingIsDefault: false,
        },
      })
    );
    renderPage();
    expect(await screen.findByText('none')).toBeInTheDocument();
    expect(screen.getByText(/budget is switched off/)).toBeInTheDocument();
  });

  it('an older backend that reports no ceiling says so, rather than showing zero', async () => {
    get.mockResolvedValue(
      result({ totals: { byTier: [tier('default', 5_000, 3)], managedOrgCount: 1 } })
    );
    renderPage();
    expect(await screen.findByText(/does not report one/)).toBeInTheDocument();
  });
});
