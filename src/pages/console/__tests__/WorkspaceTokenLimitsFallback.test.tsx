/**
 * One workspace's KB forecast when the saved limit settings could not be read (BE R17
 * `settingsLookupFailed`): the days are counted against the layer the limit fell back to, named
 * from its source, and said with why — beside an unsettled enforcement too (FE audit passes
 * 18–20). Split from WorkspaceTokenLimits.test.tsx (file size).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { OrgTokenBudget, TokenForecast } from '@/services/managedAiUsage.service';

let forecast: () => Promise<TokenForecast> = () => Promise.reject(new Error('none'));
vi.mock('@/services/managedAiUsage.service', () => ({
  managedAiUsageService: {
    updateWorkspaceLimits: () => Promise.resolve({ release: null, regularRelease: null }),
    getForecast: () => forecast(),
  },
}));
vi.mock('sonner', () => ({
  toast: { success: () => undefined, warning: () => undefined, error: () => undefined },
}));

const { WorkspaceTokenLimitsDialog } = await import('../WorkspaceTokenLimits');

const budget: OrgTokenBudget = {
  kb: { limit: 5_000_000, source: 'workspace', spentToday: 1_200_000 },
  regular: { limit: 2_000_000, source: 'default', spentToday: 1_700_000 },
  override: { kbTokensPerDay: 5_000_000 },
  enforced: true,
};
const budgets = {
  kb: { limit: 5_000_000, source: 'default' as const },
  regular: { limit: 2_000_000, source: 'default' as const },
  ownKeyEnforced: false,
  workspaceOverrides: {},
};
const makeForecast = (over: Partial<TokenForecast['kb']> = {}): TokenForecast => ({
  organizationId: 7,
  kb: {
    sources: [
      { sourceId: 1, name: 'inbox', threadsInScope: 900, threadsToMine: 900, noCutoff: false },
    ],
    threadsToMine: 900,
    tokensPerThread: { value: 10_000, threadsMeasured: 50, windowDays: 30 },
    estimatedTokens: 9_000_000,
    daysAtLimit: 3,
    limit: { limit: 5_000_000, source: 'default' },
    spentToday: 0,
    // forecastKb always sends these (one read of the workspace's enforcement and settings).
    enforced: true,
    enforcementLookupFailed: false,
    settingsLookupFailed: false,
    ...over,
  },
  regular: {
    windowDays: 28,
    observedDays: 28,
    messagesPerDay: { in: 40, out: 20 },
    tokensPerMessage: { low: 500, typical: 900, high: 2_000, weeksMeasured: 4 },
    expectedTokensPerDay: { low: 30_000, typical: 54_000, high: 120_000 },
    actual: { last7DaysAverage: 50_000, peakDay: null },
    limit: { limit: 0, source: 'platform' },
    spentToday: 0,
    enforced: true,
    enforcementLookupFailed: false,
    settingsLookupFailed: false,
  },
});

const renderDialog = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <WorkspaceTokenLimitsDialog
        organizationId={7}
        name="acme"
        budget={budget}
        budgets={budgets}
        onClose={() => {}}
      />
    </QueryClientProvider>
  );
};

beforeEach(() => {
  forecast = () => Promise.resolve(makeForecast());
});
afterEach(cleanup);

describe('console forecast — saved limit unreadable (BE R17 settingsLookupFailed)', () => {
  const regularText = async () =>
    (await screen.findByText(/outgoing messages a day/)).closest('div')?.textContent ?? '';
  // The layer is named from the figure's `source`: with the env limit set the BE falls back to it,
  // not the built-in default (tokenBudget effectiveTokenLimit; FE audit pass 18, LOW).
  // ONE enforcement verdict for both halves, as tokenForecastService reads it once per workspace:
  // a managed (or platform-key) workspace's {enforced: true, lookupFailed: false} — the shape
  // reportTokenBudgetEnforcement gives it whatever the settings read did.
  const verdict = { enforced: true, enforcementLookupFailed: false } as const;
  const failed = (source: 'default' | 'env' | 'platform' = 'default'): TokenForecast => {
    const base = makeForecast({ daysAtLimit: 3, settingsLookupFailed: true });
    return {
      ...base,
      kb: { ...base.kb, ...verdict, limit: { limit: 5_000_000, source } },
      regular: {
        ...base.regular,
        ...verdict,
        limit: { limit: 2_000_000, source },
        settingsLookupFailed: true,
      },
    };
  };

  it('the regular limit is the built-in default, and the KB days are counted against it', async () => {
    forecast = () => Promise.resolve(failed());
    renderDialog();
    expect(await regularText()).toMatch(
      /against a limit of 2,000,000 \(the built-in default — the saved limit could not be read\)\./
    );
    expect(
      await screen.findByText(
        /counted against the built-in default — the saved KB limit could not be read/
      )
    ).toBeTruthy();
  });

  it('the env limit set: both name the server environment setting, never "the default"', async () => {
    forecast = () => Promise.resolve(failed('env'));
    renderDialog();
    const text = await regularText();
    expect(text).toMatch(
      /against a limit of 2,000,000 \(the server environment setting — the saved limit could not be read\)\./
    );
    expect(
      await screen.findByText(
        /counted against the server environment setting — the saved KB limit could not be read/
      )
    ).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/default/);
  });

  // FE audit pass 19, NIT: the clause qualifies the DAYS — said right after them, not after the
  // pause sentence — and "could not be read" is not said twice beside the enforcement-unknown one.
  const kbLineOf = async (
    kb: Partial<TokenForecast['kb']> = {},
    regular: Partial<TokenForecast['regular']> = {}
  ) => {
    forecast = () =>
      Promise.resolve({
        ...failed(),
        kb: { ...failed().kb, ...kb },
        regular: { ...failed().regular, ...regular },
      });
    renderDialog();
    return (await screen.findByText(/per conversation \(measured on/)).textContent ?? '';
  };
  it('the "counted against" clause follows the days', async () => {
    expect(await kbLineOf()).toMatch(
      /\) — about 3 days at the KB limit \(counted against the built-in default — the saved KB limit could not be read\), pausing each day at the limit until the reset at 00:00 UTC \(\d\d:\d\d your time\)\.$/
    );
  });

  // The shape an own-key workspace really gets from the BE when the settings read fails: both
  // halves `enforced: false` with `enforcementLookupFailed: true` (managedSpendGate
  // reportTokenBudgetEnforcement on settingsLookupFailed — pass 20, NIT).
  const unsettled = { enforced: false, enforcementLookupFailed: true } as const;
  it('beside an unsettled enforcement: the clause once with why, "could not be read" once', async () => {
    const line = await kbLineOf(unsettled, unsettled);
    expect(line).toMatch(
      /\) — about 3 days of the KB limit \(counted against the built-in default — the saved KB limit could not be read\); whether the limit stops work is unknown\.$/
    );
    expect(line.match(/could not be read/g)).toHaveLength(1);
  });

  it('fits in a day: named against the fallback, never "today’s KB limit"', async () => {
    expect(await kbLineOf({ daysAtLimit: 1 })).toMatch(
      /\) — it fits in one day at the built-in default; the saved KB limit could not be read\.$/
    );
  });

  // FE audit pass 20, LOW: with BOTH flags the fits line said "it fits in one day at the built-in
  // default." with no word that the saved limit could not be read (parity with SourceKbStrip).
  it('fits in a day beside an unsettled enforcement: still says the saved limit could not be read', async () => {
    expect(await kbLineOf({ daysAtLimit: 1, ...unsettled }, unsettled)).toMatch(
      /\) — it fits in one day at the built-in default; the saved KB limit could not be read\.$/
    );
  });

  // A measured-only verdict beside the fallback figure (enforced false, read settled): the clause
  // still follows the days (pass 20, NIT — the branch was untested). NOT reachable from the final
  // backend: with the settings unreadable an own-key workspace gets the unsettled verdict above
  // (reportTokenBudgetEnforcement), a managed or platform-key one `enforced: true`. Kept so the
  // words stay true if a backend ever sends it.
  const measured = { enforced: false, enforcementLookupFailed: false } as const;
  it('measured only (unreachable today): the "counted against" clause follows the days there too', async () => {
    expect(await kbLineOf(measured, measured)).toMatch(
      /\) — about 3 days of the KB limit \(counted against the built-in default — the saved KB limit could not be read\); limits are only measured for this workspace, so nothing pauses\.$/
    );
  });

  // Pass 21, NIT: a fallback of 0 is "no limit", so the backend sends no days — and the line said
  // nothing about the saved KB limit; "no limit" then read as this workspace's.
  it('a fallback of 0 (no limit): says so, and that the saved KB limit could not be read', async () => {
    expect(await kbLineOf({ limit: { limit: 0, source: 'env' }, daysAtLimit: null })).toMatch(
      /\) — no KB limit under the server environment setting; the saved KB limit could not be read\.$/
    );
  });

  it('CONTROL: a saved limit of 0 that WAS read says nothing about a fallback', async () => {
    forecast = () =>
      Promise.resolve(
        makeForecast({ limit: { limit: 0, source: 'workspace' }, daysAtLimit: null, ...verdict })
      );
    renderDialog();
    const line = (await screen.findByText(/per conversation \(measured on/)).textContent ?? '';
    expect(line).not.toMatch(/could not be read|no KB limit under/);
  });

  // FE audit pass 19, NIT: a source this FE does not know (or none) is still a fallback — named
  // without a guessed layer, never left unqualified as if it were the saved limit.
  it('an unknown or absent source: "a fallback limit", never a named layer', async () => {
    for (const source of [undefined, 'cluster']) {
      const line = await kbLineOf({ limit: { limit: 5_000_000, source: source as 'default' } });
      expect(line).toContain('(counted against a fallback limit — the saved KB limit could not');
      expect(line).not.toMatch(/built-in default|server environment/);
      cleanup();
    }
  });

  it('CONTROL: a stored platform figure beside the flag is not qualified', async () => {
    forecast = () => Promise.resolve(failed('platform'));
    renderDialog();
    const text = await regularText();
    expect(text).toMatch(/against a limit of 2,000,000\./);
    expect(document.body.textContent).not.toContain('could not be read');
  });

  it('CONTROL: an enforcement-only failure no longer qualifies the limit (R17 says it is the saved one)', async () => {
    const base = makeForecast({ daysAtLimit: 3, enforced: true, settingsLookupFailed: false });
    forecast = () =>
      Promise.resolve({
        ...base,
        regular: {
          ...base.regular,
          limit: { limit: 2_000_000, source: 'default' },
          enforcementLookupFailed: true,
          settingsLookupFailed: false,
        },
      });
    renderDialog();
    const text = await regularText();
    expect(text).toMatch(/against a limit of [\d,]+\./);
    expect(text).not.toContain('fallback');
    expect(screen.queryByText(/saved KB limit could not be read/)).toBeNull();
  });
});
