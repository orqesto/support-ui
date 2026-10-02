/**
 * The token-limit controls inside AI Spend (FE audit pass 8):
 * - switching the days range keeps a limits edit on screen (it used to unmount with the data);
 * - a workspace dialog cannot be left while its Save is on its way (pass 10), so a late answer
 *   never meets a dialog reopened from the pre-save figures;
 * - "today" is a UTC day: the page reads again just after 00:00 UTC.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

const openCell = (index: number) =>
  fireEvent.click(screen.getAllByTitle(/Today since 00:00 UTC/)[index]);

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

// The backend from before the limits (2d8552fb managedAIUsageController) sends no
// `totals.tokenBudgets` and no per-workspace `tokenBudget`: no limits column at all.
describe('AI Spend — a backend from before the token limits', () => {
  it('no "Today vs limits" column and no limit cells; the rows still render', async () => {
    getImpl = () => {
      const result = page();
      delete result.usage.totals.tokenBudgets;
      for (const org of result.usage.orgs) delete (org as { tokenBudget?: unknown }).tokenBudget;
      return Promise.resolve(result);
    };
    renderPage();
    expect(await screen.findByText('Bolt')).toBeTruthy();
    expect(screen.queryByText('Today vs limits')).toBeNull();
    expect(screen.queryAllByTitle(/Today since 00:00 UTC/)).toHaveLength(0);
  });

  it('CONTROL: the final backend shows the column and a cell per workspace', async () => {
    renderPage();
    expect(await screen.findByText('Today vs limits')).toBeTruthy();
    await waitFor(() => expect(screen.getAllByTitle(/Today since 00:00 UTC/)).toHaveLength(2));
  });
});

describe('AI Spend — token limit controls', () => {
  // BE R16 `settingsLookupFailed`: every workspace's limits are the fallback — the page wires the
  // flag to each row's cell, not only to the platform card.
  it('stored limits unreadable: every workspace cell says the fallback is shown', async () => {
    getImpl = () => {
      const result = page();
      result.usage.totals.tokenBudgets = {
        ...result.usage.totals.tokenBudgets!,
        settingsLookupFailed: true,
      };
      return Promise.resolve(result);
    };
    renderPage();
    await waitFor(() =>
      expect(screen.getAllByText('stored limits unreadable · fallback shown')).toHaveLength(2)
    );
    expect(screen.getByTestId('token-limits-unreadable')).toBeTruthy();
  });

  // A wiring that read the flag loosely would mark every cell.
  it('CONTROL: settings read fine (settingsLookupFailed false): every cell reads the limits, none says unreadable', async () => {
    renderPage();
    await waitFor(() => expect(screen.getAllByText(/^platform limits/)).toHaveLength(2));
    expect(screen.queryByText('stored limits unreadable · fallback shown')).toBeNull();
    expect(screen.queryByTestId('token-limits-unreadable')).toBeNull();
  });

  // FE audit pass 19, NIT: the dialog's workspace drops out of an answer (here the 7-day range):
  // the dialog goes, and does NOT come back by itself when the workspace is listed again.
  it('a dialog whose workspace drops out closes, and stays closed when it is listed again', async () => {
    renderPage();
    await waitFor(() => expect(screen.getAllByTitle(/Today since 00:00 UTC/)).toHaveLength(2));
    openCell(1);
    expect(await screen.findByText('Daily token limits · Bolt')).toBeTruthy();
    getImpl = (days) => {
      const result = page();
      if (days === 7) result.usage.orgs = result.usage.orgs.slice(0, 1);
      return Promise.resolve(result);
    };
    fireEvent.click(screen.getByRole('button', { name: '7 days' }));
    await waitFor(() => expect(screen.getAllByTitle(/Today since 00:00 UTC/)).toHaveLength(1));
    expect(screen.queryByText('Daily token limits · Bolt')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '30 days' }));
    await waitFor(() => expect(screen.getAllByTitle(/Today since 00:00 UTC/)).toHaveLength(2));
    expect(screen.queryByText('Daily token limits · Bolt')).toBeNull();
  });

  it('switching the range keeps a limits edit in progress on screen', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('KB processing (tokens per UTC day)'), {
      target: { value: '9000000' },
    });
    getImpl = () => new Promise(() => {});
    fireEvent.click(screen.getByRole('button', { name: '7 days' }));
    await waitFor(() => expect(gets).toContain(7));
    expect(screen.getByLabelText('KB processing (tokens per UTC day)')).toHaveProperty(
      'value',
      '9000000'
    );
    expect(screen.getByText('Loading the last 7 days…')).toBeTruthy();
  });

  it('a workspace dialog cannot be left while its Save is on its way — reopening never shows the pre-save override (pass 10, MED)', async () => {
    // The forecast never answers here: a slow forecast must not hold the dialog open either.
    renderPage();
    await screen.findAllByTitle(/Today since 00:00 UTC/);
    openCell(0);
    fireEvent.change(await screen.findByLabelText('KB processing (tokens per UTC day)'), {
      target: { value: '9000000' },
    });
    let finish: () => void = () => {};
    saveImpl = () => new Promise((resolve) => (finish = () => resolve(undefined)));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    // Neither Cancel nor Escape leaves it: the same workspace cannot be reopened from stale figures.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByText('Daily token limits · Acme')).toBeTruthy();
    const saved = page();
    saved.usage.orgs[0].tokenBudget = {
      ...budget,
      kb: { ...budget.kb, limit: 9_000_000, source: 'workspace' },
      override: { kbTokensPerDay: 9_000_000 },
    } as OrgTokenBudget;
    getImpl = () => Promise.resolve(saved);
    await act(async () => {
      finish();
      await Promise.resolve();
    });
    await waitFor(() => expect(screen.queryByText('Daily token limits · Acme')).toBeNull());
    openCell(0);
    expect(await screen.findByLabelText('KB processing (tokens per UTC day)')).toHaveProperty(
      'value',
      '9000000'
    );
  });

  it('CONTROL: with no Save on its way, Cancel and Escape both close the dialog', async () => {
    renderPage();
    await screen.findAllByTitle(/Today since 00:00 UTC/);
    openCell(0);
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByText('Daily token limits · Acme')).toBeNull());
    openCell(1);
    await screen.findByText('Daily token limits · Bolt');
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByText('Daily token limits · Bolt')).toBeNull());
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
    await screen.findByRole('button', { name: 'Edit' });
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
    await screen.findByRole('button', { name: 'Edit' });
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
