/**
 * Token caps wave 2b in the console (plan Task 11): the shares on the rules card, strict rule input,
 * the AI catch-up backlog, the save warnings (spec §3), the mid-month alliance note (spec §4), the
 * near-limit share from the rules, and the rules save's own retry advice. What must hold:
 * - an older backend (no `tokenCaps` / `tokenLimitRules`) shows none of it (FE/BE skew);
 * - a blank monthly field means "no monthly limit" and is sent as null only when one was saved;
 *   0 switches a limit off; only changed fields are sent;
 * - the rules card sends only the rule that changed, percent fields as shares, and an out-of-range
 *   value blocks Save;
 * - a pool is added for an alliance without one and edited in place.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

type Edit = Record<string, unknown>;
let capsSent: Edit[] = [];
let poolsSent: Array<{ allianceId: number; edit: Edit }> = [];
let rulesSent: Edit[] = [];
let rulesRelease: unknown = null;
let warned: string[] = [];
let warnedText: string[] = [];
let workspaceSent: Array<{ organizationId: number; edit: Edit }> = [];
const emptyOutcome = { release: null, regularRelease: null };
vi.mock('@/services/managedAiUsage.service', () => ({
  managedAiUsageService: {
    updateTokenCaps: (edit: Edit) => {
      capsSent.push(edit);
      return Promise.resolve(emptyOutcome);
    },
    updateWorkspaceCaps: (organizationId: number, edit: Edit) => {
      workspaceSent.push({ organizationId, edit });
      return Promise.resolve(emptyOutcome);
    },
    updateAlliancePool: (allianceId: number, edit: Edit) => {
      poolsSent.push({ allianceId, edit });
      return Promise.resolve(emptyOutcome);
    },
    updateTokenLimitRules: (edit: Edit) => {
      rulesSent.push(edit);
      return Promise.resolve({ rules: {}, release: rulesRelease });
    },
  },
}));
vi.mock('@/hooks/useAllianceAdmin', () => ({
  useMyAlliances: () => ({
    data: [
      { id: 3, name: 'North Group', slug: 'north', orgCount: 2 },
      { id: 4, name: 'South Group', slug: 'south', orgCount: 1 },
    ],
  }),
}));
vi.mock('sonner', () => ({
  toast: {
    success: () => {},
    warning: (title: string, options?: { description?: string }) => {
      warned.push(title);
      warnedText.push(options?.description ?? '');
    },
    error: () => {},
  },
}));

const { MonthlyLimitsCard } = await import('../MonthlyLimitsCard');
const { TokenLimitRulesCard } = await import('../TokenLimitRulesCard');
const { AlliancePoolsCard } = await import('../AlliancePoolsCard');
const { WorkspaceMonthlyLimits } = await import('../WorkspaceMonthlyLimits');
const { WorkspaceLimitCell } = await import('../WorkspaceTokenLimits');
const { describeCatchup, describeCap } = await import('../tokenLimits.helpers');

const RULES = {
  nearLimitShare: 0.8,
  burstMarginShare: 0.2,
  periodRecheckMinutes: 60,
  catchupBudgetShare: 0.5,
  burstRequestExpiryDays: 7,
  kbMinTokensPerDay: 1_000_000,
};
const wrap = (node: React.ReactNode) =>
  render(<QueryClientProvider client={new QueryClient()}>{node}</QueryClientProvider>);
const type = (label: RegExp, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const text = () => document.body.textContent ?? '';

beforeEach(() => {
  capsSent = [];
  poolsSent = [];
  rulesSent = [];
  rulesRelease = null;
  warned = [];
  warnedText = [];
  workspaceSent = [];
});
afterEach(cleanup);

describe('rules card: the shares the catch-up and the console now use', () => {
  it('shows the near-limit share and the catch-up share as percent', () => {
    wrap(<TokenLimitRulesCard rules={RULES} />);
    expect(text()).toMatch(/Near-limit warning at\s*80 %/);
    expect(text()).toMatch(/AI catch-up runs while spend is under\s*50 %/);
    // Still hidden: the burst rules (wave 3).
    expect(screen.queryByText(/Burst/)).toBeNull();
  });

  it('a share is typed as a percent and sent as a share; only the changed rule is sent', async () => {
    wrap(<TokenLimitRulesCard rules={RULES} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    type(/AI catch-up runs while spend is under/, '40');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(rulesSent).toEqual([{ catchupBudgetShare: 0.4 }]));
  });

  it('a share out of range blocks Save (near-limit 1–99 %, catch-up 1–100 %)', () => {
    wrap(<TokenLimitRulesCard rules={RULES} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    type(/Near-limit warning at/, '100');
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Save' }).disabled).toBe(true);
    type(/Near-limit warning at/, '99');
    type(/AI catch-up runs while spend is under/, '0');
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Save' }).disabled).toBe(true);
  });

  it('digits only: 1e6, 0x10 and 1,0,0,0 are refused; CONTROL 2,000,000 is accepted', async () => {
    wrap(<TokenLimitRulesCard rules={RULES} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    for (const bad of ['1e6', '0x10', '1,0,0,0', '2.5']) {
      type(/Lowest KB limit/, bad);
      expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Save' }).disabled).toBe(true);
    }
    type(/Lowest KB limit/, '2,000,000');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(rulesSent).toEqual([{ kbMinTokensPerDay: 2_000_000 }]));
  });

  it('a failed release after a rules save gives the RULES retry advice, not the KB-field one', async () => {
    rulesRelease = { error: 'Paused KB work could not be released now.' };
    wrap(<TokenLimitRulesCard rules={RULES} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    type(/Lowest KB limit/, '2000000');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(warned).toEqual(['Token limit rules saved']));
    expect(warnedText[0]).toContain('a higher minimum does');
    expect(warnedText[0]).not.toContain('KB field');
  });
});

describe('the catch-up is promised now that it ships', () => {
  it('the monthly card says regular mail is analysed again with AI after a raise or the reset', () => {
    wrap(<MonthlyLimitsCard caps={{ alliances: [] }} kbMin={1_000_000} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(text()).toContain('analysed again with AI after a raise or the reset');
  });
});

describe('the AI catch-up backlog', () => {
  const monthly = {
    kb: null,
    regular: { limit: 10_000_000, source: 'workspace' as const, spentThisMonth: 4_000_000 },
  };
  const section = (backlog: number | null | undefined) =>
    wrap(
      <WorkspaceMonthlyLimits
        organizationId={7}
        monthly={monthly}
        override={undefined}
        kbMin={1_000_000}
        backlog={backlog}
      />
    );

  it('waiting threads are said with what happens to them', () => {
    section(412);
    expect(text()).toContain(
      '412 threads sorted without AI wait for the AI catch-up: they are analysed again with AI after a raise or the reset.'
    );
  });

  it('could not be counted ⇒ said so; none or an older backend ⇒ nothing', () => {
    section(null);
    expect(text()).toContain('could not be counted');
    cleanup();
    section(0);
    expect(text()).not.toMatch(/catch-up/);
    cleanup();
    section(undefined);
    expect(text()).not.toMatch(/catch-up/);
  });

  it('the forecast adds the cost when tokens per message are measured', () => {
    expect(describeCatchup({ messages: 412, estimatedTokens: 370_800 })).toBe(
      '412 threads wait for the AI catch-up (≈ 370,800 tokens), re-analysed after a raise or the reset.'
    );
    expect(describeCatchup({ messages: 3, estimatedTokens: null })).toBe(
      '3 threads wait for the AI catch-up, re-analysed after a raise or the reset.'
    );
    expect(describeCatchup({ messages: 0, estimatedTokens: 0 })).toBeNull();
    expect(describeCatchup(undefined)).toBeNull();
  });
});

describe('save warnings (spec §3): said, never blocking', () => {
  const monthly = { kb: null, regular: null };
  const section = () =>
    wrap(
      <WorkspaceMonthlyLimits
        organizationId={7}
        monthly={monthly}
        override={undefined}
        kbMin={1_000_000}
        dailyLimits={{ kb: 5_000_000, regular: 2_000_000 }}
        poolMonthly={{ regularTokensPerMonth: 30_000_000 }}
      />
    );

  it('a monthly limit below the daily one is warned about and still saves', async () => {
    section();
    type(/Regular work this workspace/, '1000000');
    expect(text()).toContain('lower than the daily limit (2,000,000)');
    fireEvent.click(screen.getByRole('button', { name: 'Save monthly limits' }));
    await waitFor(() =>
      expect(workspaceSent).toEqual([
        { organizationId: 7, edit: { regularTokensPerMonth: 1_000_000 } },
      ])
    );
  });

  it('a workspace limit above its alliance pool is warned about', () => {
    section();
    type(/Regular work this workspace/, '40000000');
    expect(text()).toContain("higher than its alliance pool's monthly limit (30,000,000)");
  });

  it('CONTROL: a limit between the two warns nothing; 0 (off) warns nothing', () => {
    section();
    type(/Regular work this workspace/, '20000000');
    expect(text()).not.toMatch(/lower than|higher than/);
    type(/Regular work this workspace/, '0');
    expect(text()).not.toMatch(/lower than|higher than/);
  });

  it('the platform card warns a monthly limit below the platform daily limit too', () => {
    wrap(
      <MonthlyLimitsCard
        caps={{ alliances: [] }}
        kbMin={1_000_000}
        dailyLimits={{ kb: 5_000_000, regular: 2_000_000 }}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    type(/Regular work/, '1000000');
    expect(text()).toContain('lower than the daily limit (2,000,000)');
  });
});

describe('spec §4: a workspace moving alliance mid-month', () => {
  it("the pools card says it takes this month's spend with it", () => {
    wrap(<AlliancePoolsCard caps={{ alliances: [] }} kbMin={1_000_000} />);
    expect(text()).toContain('takes its spend this month with it');
  });
});

describe('the near-limit share comes from the rules', () => {
  const budget = {
    kb: { limit: 5_000_000, spentToday: 0, source: 'platform' as const },
    regular: { limit: 100, spentToday: 60, source: 'platform' as const },
    enforced: true,
    override: null,
  };

  it('at 60 % with a 50 % rule the cell says near, with the rule', () => {
    wrap(<WorkspaceLimitCell budget={budget as never} nearShare={0.5} onOpen={() => {}} />);
    expect(text()).toContain('≥ 50%');
  });

  it('CONTROL: without the rule (older backend) the built-in 80 % applies — 60 % is not near', () => {
    wrap(<WorkspaceLimitCell budget={budget as never} onOpen={() => {}} />);
    expect(text()).not.toMatch(/≥/);
  });
});

describe('describeCap uses one number format', () => {
  it('both numbers in en-US, whatever the browser locale', () => {
    const spy = vi.spyOn(Number.prototype, 'toLocaleString');
    describeCap(500_000, 'none', { kbMin: 1_000_000 });
    expect(spy.mock.calls.every((call) => call[0] === 'en-US')).toBe(true);
    spy.mockRestore();
    expect(describeCap(500_000, 'none', { kbMin: 1_000_000 })).toBe(
      'Saved as 500,000; the limit in force is 1,000,000 (the minimum)'
    );
  });
});
