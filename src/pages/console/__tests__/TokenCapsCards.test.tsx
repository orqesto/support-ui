/**
 * Wave 2 (owner D2/D3/D11): the console edits the monthly limits, the alliance pools and the
 * thresholds. What must hold:
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
import { chooseOption } from '@/test/chooseOption';

type Edit = Record<string, unknown>;
let capsSent: Edit[] = [];
let poolsSent: Array<{ allianceId: number; edit: Edit }> = [];
let rulesSent: Edit[] = [];
let rulesRelease: unknown = null;
let warned: string[] = [];
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
    warning: (title: string) => warned.push(title),
    error: () => {},
  },
}));

const { MonthlyLimitsCard } = await import('../MonthlyLimitsCard');
const { TokenLimitRulesCard } = await import('../TokenLimitRulesCard');
const { AlliancePoolsCard } = await import('../AlliancePoolsCard');
const { WorkspaceMonthlyLimits } = await import('../WorkspaceMonthlyLimits');
const { usageLevel, parseKbLimitInput } = await import('../tokenLimits.helpers');
const { TokenLimitsCard } = await import('../TokenLimitsCard');

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
const field = (label: RegExp) => screen.getByLabelText(label);
const type = (label: RegExp, value: string) =>
  fireEvent.change(field(label), { target: { value } });

beforeEach(() => {
  capsSent = [];
  poolsSent = [];
  rulesSent = [];
  rulesRelease = null;
  warned = [];
  workspaceSent = [];
});
afterEach(cleanup);

describe('MonthlyLimitsCard', () => {
  it('shows the saved monthly limits and "no monthly limit" for an unset one', () => {
    wrap(
      <MonthlyLimitsCard
        caps={{ regularTokensPerMonth: 40_000_000, alliances: [] }}
        kbMin={1_000_000}
      />
    );
    expect(screen.getByText(/40,000,000/)).toBeTruthy();
    expect(screen.getByText(/No monthly limit/)).toBeTruthy();
  });

  it('a blank field sends null only where a value was saved; an untouched one is not sent', async () => {
    wrap(
      <MonthlyLimitsCard
        caps={{ kbTokensPerMonth: 90_000_000, regularTokensPerMonth: 40_000_000, alliances: [] }}
        kbMin={1_000_000}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    type(/KB processing/, '');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(capsSent).toEqual([{ kbTokensPerMonth: null }]));
  });

  it('0 switches a limit off and is sent as 0; a KB value under the minimum blocks Save', async () => {
    wrap(<MonthlyLimitsCard caps={{ alliances: [] }} kbMin={1_000_000} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    type(/KB processing/, '10');
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Save' }).disabled).toBe(true);
    type(/KB processing/, '');
    type(/Regular work/, '0');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(capsSent).toEqual([{ regularTokensPerMonth: 0 }]));
  });
});

describe('review I1: no promise the backend does not keep yet', () => {
  it('the monthly card does not promise an AI re-analysis (the catch-up ships later)', () => {
    wrap(<MonthlyLimitsCard caps={{ alliances: [] }} kbMin={1_000_000} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.queryByText(/analysed again with AI/)).toBeNull();
    expect(screen.getByText(/marked for an AI re-analysis/)).toBeTruthy();
  });
});

describe('TokenLimitRulesCard', () => {
  it('shows every rule and saves ONE changed rule only', async () => {
    wrap(<TokenLimitRulesCard rules={RULES} />);
    expect(screen.getByText(/60 minutes/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    type(/Re-check a monthly or alliance pause/, '30');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(rulesSent).toEqual([{ periodRecheckMinutes: 30 }]));
  });

  it('pass 2 m1: only the rules this version applies are shown (no untrue settings)', () => {
    wrap(<TokenLimitRulesCard rules={RULES} />);
    expect(screen.queryByText(/Near-limit warning/)).toBeNull();
    expect(screen.queryByText(/Burst margin/)).toBeNull();
    expect(screen.queryByText(/catch-up/i)).toBeNull();
    expect(screen.queryByText(/burst request/i)).toBeNull();
    expect(screen.getByText(/Lowest KB limit/)).toBeTruthy();
  });

  it('an out-of-range value blocks Save (re-check between 5 and 1,440 minutes)', () => {
    wrap(<TokenLimitRulesCard rules={RULES} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    type(/Re-check a monthly or alliance pause/, '2');
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Save' }).disabled).toBe(true);
    expect(screen.getByText(/between 5 and 1,440/)).toBeTruthy();
  });

  it('pass 2 m4: a release the save ran that failed is shown as a warning', async () => {
    rulesRelease = { error: 'Paused KB work could not be released now.' };
    wrap(<TokenLimitRulesCard rules={RULES} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    type(/Lowest KB limit/, '2000000');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(warned).toEqual(['Token limit rules saved']));
  });
});

describe('AlliancePoolsCard', () => {
  const pool = {
    id: 3,
    name: 'North Group',
    memberIds: [7, 8],
    limits: { regularTokensPerMonth: 70_000_000 },
    spentToday: { kb: 0, regular: 1_000 },
    spentThisMonth: { kb: 0, regular: 2_500_000 },
  };

  it('lists a pool with its members, limits and this month’s spend', () => {
    wrap(<AlliancePoolsCard caps={{ alliances: [pool] }} kbMin={1_000_000} />);
    expect(screen.getByText('North Group')).toBeTruthy();
    expect(screen.getByText(/2 workspaces/)).toBeTruthy();
    expect(screen.getByText(/2,500,000 of 70,000,000/)).toBeTruthy();
  });

  it('adds a pool for an alliance without one, sending only the filled limits', async () => {
    wrap(<AlliancePoolsCard caps={{ alliances: [pool] }} kbMin={1_000_000} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add pool' }));
    await chooseOption(screen.getByLabelText(/Alliance/), 'South Group');
    type(/KB processing per day/, '9000000');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(poolsSent).toEqual([{ allianceId: 4, edit: { kbTokensPerDay: 9_000_000 } }])
    );
  });

  it('editing a pool clears an emptied limit with null and leaves the rest alone', async () => {
    wrap(<AlliancePoolsCard caps={{ alliances: [pool] }} kbMin={1_000_000} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit North Group' }));
    type(/Regular work per month/, '');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(poolsSent).toEqual([{ allianceId: 3, edit: { regularTokensPerMonth: null } }])
    );
  });
});

describe('WorkspaceMonthlyLimits', () => {
  const monthly = {
    kb: null,
    regular: { limit: 10_000_000, source: 'workspace' as const, spentThisMonth: 4_000_000 },
  };

  it("shows each limit in force with this month's spend, and where it comes from", () => {
    wrap(
      <WorkspaceMonthlyLimits
        organizationId={7}
        monthly={monthly}
        override={{ regularTokensPerMonth: 10_000_000 }}
        kbMin={1_000_000}
      />
    );
    expect(screen.getByText(/4,000,000 of 10,000,000/)).toBeTruthy();
    expect(screen.getByText(/set for this workspace/)).toBeTruthy();
    expect(screen.getByText(/No monthly limit/)).toBeTruthy();
  });

  it('blank clears a saved override (null); an untouched field is not sent', async () => {
    wrap(
      <WorkspaceMonthlyLimits
        organizationId={7}
        monthly={monthly}
        override={{ regularTokensPerMonth: 10_000_000 }}
        kbMin={1_000_000}
      />
    );
    type(/Regular work this workspace/, '');
    fireEvent.click(screen.getByRole('button', { name: 'Save monthly limits' }));
    await waitFor(() =>
      expect(workspaceSent).toEqual([{ organizationId: 7, edit: { regularTokensPerMonth: null } }])
    );
  });
});

describe('review M2: the daily forms use the console KB minimum (rules), not the built-in one', () => {
  it('parseKbLimitInput holds a value to the given minimum and names it', () => {
    const refused = parseKbLimitInput('1500000', null, 2_000_000);
    expect(refused.ok).toBe(false);
    expect(!refused.ok && refused.error).toMatch(/2,000,000/);
    expect(parseKbLimitInput('1500000', null).ok).toBe(true); // CONTROL: built-in 1,000,000
  });

  it('the platform card blocks a KB value under the rule and says the rule', () => {
    const limit = (value: number) => ({ limit: value, source: 'platform' as const });
    wrap(
      <TokenLimitsCard
        budgets={{
          kb: limit(5_000_000),
          regular: limit(2_000_000),
          ownKeyEnforced: false,
          workspaceOverrides: {},
        }}
        kbMin={2_000_000}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    type(/KB processing/, '1500000');
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Save' }).disabled).toBe(true);
    expect(screen.getAllByText(/2,000,000/).length).toBeGreaterThan(0);
  });
});

describe('review M4: an unreadable pool list is unknown, not empty', () => {
  it('says the pools could not be read instead of "No alliance has a pool"', () => {
    wrap(<AlliancePoolsCard caps={{ alliances: [], lookupFailed: true }} kbMin={1_000_000} />);
    expect(screen.queryByText(/No alliance has a pool/)).toBeNull();
    expect(screen.getByText(/could not be read/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Add pool' })).toBeNull();
  });
});

describe('pass 2 m2: the workspace monthly section when the caps could not be read', () => {
  it('says unknown, not "No monthly limit", and cannot be saved', () => {
    wrap(
      <WorkspaceMonthlyLimits
        organizationId={7}
        monthly={{ kb: null, regular: null }}
        override={undefined}
        kbMin={1_000_000}
        unreadable
      />
    );
    expect(screen.queryByText(/No monthly limit/)).toBeNull();
    expect(screen.getAllByText(/unknown/).length).toBeGreaterThan(0);
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: 'Save monthly limits' }).disabled
    ).toBe(true);
  });
});

describe('usageLevel', () => {
  it("uses the rules' near-limit share when given, 80 % otherwise", () => {
    expect(usageLevel(70, 100, 0.7)).toBe('near');
    expect(usageLevel(70, 100)).toBe('ok');
  });
});
