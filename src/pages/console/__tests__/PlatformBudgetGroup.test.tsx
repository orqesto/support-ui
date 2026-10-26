/**
 * Platform → AI Spend → one group, and the shared group body in the organisation console mode.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { chooseOption } from '@/test/chooseOption';
import { ROUTER_FUTURE } from '@/test/routerFuture';
import type {
  BudgetState,
  BudgetStateResult,
  ExtraView,
  GroupDetail,
  WorkspaceRow,
} from '@/services/budgets.service';

const MLN = 1_000_000;

/** Plain functions recording their calls: vitest 4 fails a test on a module-level vi.fn's caught rejection. */
let calls: Record<string, unknown[]> = {};
const record = (name: string, args: unknown) => {
  (calls[name] ??= []).push(args);
};
let stateResult: BudgetStateResult;
let detail: GroupDetail;
/** What the next read of the group returns after a write (the server's answer). */
let afterWrite: ((current: GroupDetail) => GroupDetail) | null = null;
/** Set ⇒ updateGroup is refused with this API error. */
let updateRefusal: Error | null = null;
/** Set ⇒ giveExtra answers only when this promise settles (a write in flight). */
let giveHold: Promise<{ grants: [] }> | null = null;

vi.mock('@/services/budgets.service', () => ({
  budgetsService: {
    getState: () => Promise.resolve(stateResult),
    getGroup: (key: string) => {
      record('getGroup', key);
      return Promise.resolve(detail);
    },
    listGroups: () => Promise.resolve({ items: [], total: 0 }),
    updateGroup: (key: string, body: unknown) => {
      record('updateGroup', [key, body]);
      if (updateRefusal) return Promise.reject(updateRefusal);
      if (afterWrite) detail = afterWrite(detail);
      return Promise.resolve(detail);
    },
    setWorkspaceLimits: (ids: number[], limit: number | null) => {
      record('setWorkspaceLimits', [ids, limit]);
      return Promise.resolve({ updated: ids.length });
    },
    giveExtra: (body: unknown) => {
      record('giveExtra', body);
      return giveHold ?? Promise.resolve({ grants: [] });
    },
    setGroupMode: (key: string, mode: string) => {
      record('setGroupMode', [key, mode]);
      return Promise.resolve(detail);
    },
    endExtra: (grantIds: number[]) => {
      record('endExtra', grantIds);
      return Promise.resolve({ ended: grantIds.length });
    },
  },
}));
vi.mock('sonner', () => ({
  toast: {
    success: () => {},
    warning: () => {},
    error: (message: string) => record('toast.error', message),
  },
}));

const { PlatformBudgetGroup } = await import('../PlatformBudgetGroup');
const { BudgetGroupView } = await import('@/components/budget/BudgetGroupView');

const state = (over: Partial<BudgetState> = {}): BudgetState => ({
  currency: 'USD',
  active: true,
  selfHosted: true,
  settings: {
    version: 2,
    bulkPctMin: 50,
    bulkPctMax: 90,
    defaultBulkPct: 60,
    microsPerMessage: 4000,
    serverCeiling: null,
    defaultStandaloneBudget: null,
    liveSpikeFactor: 3,
    workspaceBulkLimits: {},
  },
  server: null,
  requests: 0,
  requestList: [],
  ...over,
});

const extra = (id: number): ExtraView => ({
  id,
  grantIds: [id],
  amountMicros: 20 * MLN,
  usedMicros: 2 * MLN,
  endsAt: new Date(Date.now() + 2 * 86_400_000).toISOString(),
});

const row = (id: number, total: number, over: Partial<WorkspaceRow> = {}): WorkspaceRow => ({
  organizationId: id,
  name: `Shop ${id}`,
  spend: { total, bulk: total / 4, live: (total * 3) / 4 },
  tokens: { total: 1_000_000, bulk: 250_000 },
  budget: null,
  bulkLimit: null,
  extra: null,
  bulkRunning: false,
  bulkPaused: false,
  suggestedExtra: 15 * MLN,
  status: { tone: 'ok', text: 'Running' },
  liveSpike: null,
  ...over,
});

const groupDetail = (over: Partial<GroupDetail> = {}): GroupDetail => ({
  currency: 'USD',
  key: 'a:7',
  kind: 'alliance',
  id: 7,
  name: 'Northwind',
  budget: 100 * MLN,
  budgetSource: 'override',
  bulkLimitOn: true,
  bulkPct: 60,
  spend: { total: 60 * MLN, bulk: 20 * MLN, live: 40 * MLN, extra: 0 },
  workspaces: 3,
  status: { tone: 'ok', text: 'Running normally' },
  ownKey: false,
  requestCount: 0,
  active: true,
  removedSpend: { total: 0, bulk: 0 },
  tokens: { total: 4_000_000, bulk: 1_000_000 },
  groupExtra: null,
  rows: [
    row(1, 30 * MLN),
    row(2, 20 * MLN),
    row(3, 10 * MLN, {
      bulkRunning: true,
      bulkPaused: true,
      status: { tone: 'warn', text: 'Bulk work paused' },
    }),
  ],
  requests: [],
  month: '2026-10',
  resetsAt: '2026-11-01T00:00:00.000Z',
  bulkPctMin: 50,
  bulkPctMax: 90,
  canEdit: { budget: true, bulk: true, workspaceLimits: true, grant: true, mode: false },
  ...over,
});

const renderGroup = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter
        future={ROUTER_FUTURE}
        initialEntries={['/console/platform/ai-spend/groups/a%3A7']}
      >
        <Routes>
          <Route path="/console/platform/ai-spend/groups/:key" element={<PlatformBudgetGroup />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
};

beforeEach(() => {
  calls = {};
  afterWrite = null;
  updateRefusal = null;
  giveHold = null;
  stateResult = { available: true, state: state() };
  detail = groupDetail();
});
afterEach(cleanup);

describe('the group page', () => {
  it('before Apply: says so and never asks for the group (it would answer 409)', async () => {
    stateResult = { available: true, state: state({ active: false }) };
    renderGroup();
    expect(await screen.findByText('Budgets are not switched on yet.')).toBeInTheDocument();
    expect(calls.getGroup).toBeUndefined();
  });

  it('reads the group by its key and shows the status line from the API', async () => {
    renderGroup();
    expect(await screen.findByTestId('budget-group-status')).toHaveTextContent('Running normally');
    expect(calls.getGroup).toEqual(['a:7']);
    expect(screen.getByRole('heading', { name: 'Northwind' })).toBeInTheDocument();
  });

  it('a platform admin changes an organisation’s mode; a pending change is shown and can be cancelled', async () => {
    detail = groupDetail({
      mode: { current: 'separate', next: { mode: 'shared', from: '2026-11-01T00:00:00.000Z' } },
      canEdit: { budget: true, bulk: true, workspaceLimits: true, grant: true, mode: true },
    });
    renderGroup();
    expect(await screen.findByTestId('budget-mode-next')).toHaveTextContent('Changes to shared');
    // Picking the mode in force again cancels the queued change.
    await chooseOption(screen.getByLabelText('How workspaces share AI'), /^Separate/);
    await waitFor(() => expect(calls.setGroupMode).toEqual([['a:7', 'separate']]));
  });

  it('a separate organisation: group-level budget, bulk line, extra and request are read-only', async () => {
    detail = groupDetail({
      mode: { current: 'separate', next: null },
      groupExtra: null,
      canEdit: { budget: true, bulk: true, workspaceLimits: true, grant: true, mode: true },
    });
    renderGroup();
    expect(await screen.findByTestId('budget-separate-note')).toHaveTextContent(
      'Each workspace has its own AI allowance'
    );
    expect(screen.getByTestId('budget-readonly')).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Budget per billing period, /)).toBeNull();
    expect(screen.getByRole('switch', { name: /Limit it/ })).toBeDisabled();
    expect(
      screen.queryByRole('button', { name: 'Give extra to the whole organisation' })
    ).toBeNull();
    // The rows keep their own controls.
    expect(screen.getByRole('checkbox', { name: 'Select Shop 1' })).toBeInTheDocument();
  });

  it('a shared organisation keeps the group-level controls', async () => {
    detail = groupDetail({
      mode: { current: 'shared', next: null },
      canEdit: { budget: true, bulk: true, workspaceLimits: true, grant: true, mode: true },
    });
    renderGroup();
    // Tokens first while the period has usage to price them (owner, 2026-10-26).
    expect(
      await screen.findByRole('textbox', { name: 'Budget per billing period, tokens' })
    ).toBeVisible();
    expect(screen.queryByTestId('budget-separate-note')).toBeNull();
    expect(screen.getByRole('switch', { name: /Limit it/ })).not.toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Give extra to the whole organisation' })
    ).toBeInTheDocument();
  });

  it('a separate organisation: each workspace row shows its own budget', async () => {
    detail = groupDetail({
      mode: { current: 'separate', next: null },
      rows: [row(1, 30 * MLN, { budget: 50 * MLN })],
    });
    renderGroup();
    expect(await screen.findByText(/^of its ≈ \$50\.00 \(.+ tokens\)$/)).toBeInTheDocument();
  });

  it('a separate organisation: a workspace name links to its own budget page; the panel shows no organisation marker', async () => {
    detail = groupDetail({
      mode: { current: 'separate', next: null },
      canEdit: { budget: true, bulk: true, workspaceLimits: true, grant: true, mode: true },
      rows: [row(1, 30 * MLN, { budget: 50 * MLN })],
    });
    renderGroup();
    const link = await screen.findByRole('link', { name: 'Shop 1' });
    expect(link).toHaveAttribute('href', '/console/platform/ai-spend/groups/w%3A1');
    expect(screen.getByTestId('budget-separate-note')).toHaveTextContent(
      "click the workspace's name in the list"
    );
    // Opening the row: the organisation's bulk % is not the workspace's own, so no tick is drawn.
    fireEvent.click(screen.getByRole('button', { name: /Shop 1/ }));
    await screen.findByRole('slider', { name: /Limit for Shop 1/ });
    expect(screen.queryByTitle('Organisation: bulk limit')).toBeNull();
  });

  it('a shared organisation keeps the organisation marker in the row panel and no name link', async () => {
    detail = groupDetail({
      mode: { current: 'shared', next: null },
      rows: [row(1, 30 * MLN)],
    });
    renderGroup();
    fireEvent.click(await screen.findByRole('button', { name: /Shop 1/ }));
    await screen.findByRole('slider', { name: /Limit for Shop 1/ });
    expect(screen.queryByRole('link', { name: 'Shop 1' })).toBeNull();
    expect(screen.getByTitle('Organisation: bulk limit')).toBeInTheDocument();
  });

  it('bulk limit off ⇒ the warn line from the API; the field keeps its place', async () => {
    afterWrite = (current) => ({
      ...current,
      bulkLimitOn: false,
      status: { tone: 'warn', text: 'No bulk limit — bulk work may use the whole budget' },
    });
    renderGroup();
    await screen.findByTestId('budget-group-status');
    const value = screen.getByText(/^At most 60%/);
    expect(value).toHaveClass('min-h-[1.75rem]');
    fireEvent.click(screen.getByRole('switch', { name: /Limit it/ }));
    await waitFor(() => expect(calls.updateGroup).toEqual([['a:7', { bulkLimitOn: false }]]));
    await waitFor(() =>
      expect(screen.getByTestId('budget-group-status')).toHaveTextContent(
        'No bulk limit — bulk work may use the whole budget'
      )
    );
    expect(screen.getByTestId('budget-group-status')).toHaveAttribute('data-tone', 'warn');
    // Same element, same reserved height: switching never moves the layout.
    expect(screen.getByText('No limit')).toHaveClass('min-h-[1.75rem]');
  });

  it('a refused bulk % save puts the line back at the saved value and says why', async () => {
    updateRefusal = Object.assign(new Error('refused'), {
      status: 400,
      data: { error: 'Bulk limit must be between 50 and 80 %' },
    });
    renderGroup();
    const slider = await screen.findByRole('slider', {
      name: 'Bulk processing may use at most, percent of the budget',
    });
    expect(slider).toHaveValue('60');
    fireEvent.change(slider, { target: { value: '85' } });
    expect(slider).toHaveValue('85');
    await waitFor(() => expect(calls.updateGroup).toEqual([['a:7', { bulkPct: 85 }]]), {
      timeout: 2000,
    });
    await waitFor(() =>
      expect(calls['toast.error']).toEqual(['Bulk limit must be between 50 and 80 %'])
    );
    await waitFor(() => expect(slider).toHaveValue('60'));
  });

  it('select two rows ⇒ "2 selected"; Set limit sends both ids and the limit in micros', async () => {
    renderGroup();
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Select Shop 1' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Shop 2' }));
    expect(screen.getByText('2 selected')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Set limit' }));
    await waitFor(() => expect(calls.setWorkspaceLimits).toEqual([[[1, 2], 5 * MLN]]));
  });

  it('Give extra with "Each gets what its import still needs" sends amountMicros: suggested', async () => {
    renderGroup();
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Select Shop 1' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Shop 2' }));
    expect(
      screen.getByRole('checkbox', { name: 'Each gets what its import still needs' })
    ).toBeChecked();
    fireEvent.click(
      within(screen.getByTestId('budget-bulk')).getByRole('button', { name: 'Give extra' })
    );
    await waitFor(() =>
      expect(calls.giveExtra).toEqual([
        {
          targets: [
            { allianceId: 7, organizationId: 1 },
            { allianceId: 7, organizationId: 2 },
          ],
          amountMicros: 'suggested',
          end: 3,
        },
      ])
    );
  });

  it('End extra (2) appears only when selected rows have extra, and ends their grants', async () => {
    detail = groupDetail({
      rows: [
        row(1, 30 * MLN, { extra: extra(81) }),
        row(2, 20 * MLN, { extra: extra(82) }),
        row(3, 10 * MLN),
      ],
    });
    renderGroup();
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Select Shop 3' }));
    expect(screen.queryByRole('button', { name: /End extra/ })).toBeNull();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Shop 3' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Shop 1' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Shop 2' }));
    fireEvent.click(screen.getByRole('button', { name: 'End extra (2)' }));
    await waitFor(() => expect(calls.endExtra).toEqual([[81, 82]]));
  });

  it('one click on a paused row gives its suggested extra for 3 days', async () => {
    renderGroup();
    fireEvent.click(
      await screen.findByRole('button', { name: /^Give ≈ \$15\.00 \(.+ tokens\) extra · 3 days$/ })
    );
    await waitFor(() =>
      expect(calls.giveExtra).toEqual([
        { targets: [{ allianceId: 7, organizationId: 3 }], amountMicros: 15 * MLN, end: 3 },
      ])
    );
  });

  it('one-click give: a second click while the first is on its way sends nothing', async () => {
    giveHold = new Promise(() => {});
    renderGroup();
    const give = await screen.findByRole('button', {
      name: /^Give ≈ \$15\.00 \(.+ tokens\) extra · 3 days$/,
    });
    fireEvent.click(give);
    await waitFor(() => expect(give).toBeDisabled());
    fireEvent.click(give);
    expect(calls.giveExtra).toHaveLength(1);
  });

  it('bulk bar: Give extra, Set limit, Remove limit and End extra wait for a write in flight', async () => {
    giveHold = new Promise(() => {});
    detail = groupDetail({ rows: [row(1, 30 * MLN, { extra: extra(81) }), row(2, 20 * MLN)] });
    renderGroup();
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Select Shop 1' }));
    const bar = within(screen.getByTestId('budget-bulk'));
    fireEvent.click(bar.getByRole('button', { name: 'Give extra' }));
    await waitFor(() => expect(bar.getByRole('button', { name: 'Give extra' })).toBeDisabled());
    fireEvent.click(bar.getByRole('button', { name: 'Give extra' }));
    expect(calls.giveExtra).toHaveLength(1);
    for (const name of ['Set limit', 'Remove limit', 'End extra (1)'])
      expect(bar.getByRole('button', { name })).toBeDisabled();
  });

  it('no budget: the own-limit slider is not capped at $1 and Set limit sends the value', async () => {
    detail = groupDetail({ budget: null, budgetSource: 'none' });
    renderGroup();
    fireEvent.click(await screen.findByText('Shop 1'));
    const slider = screen.getByRole('slider', { name: 'Limit for Shop 1, dollars' });
    expect(Number(slider.getAttribute('max'))).toBeGreaterThanOrEqual(10);
    fireEvent.click(screen.getByRole('switch', { name: 'At most per billing period' }));
    fireEvent.change(slider, { target: { value: '40' } });
    expect(screen.queryByText(/% of the budget/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Set limit' }));
    await waitFor(() => expect(calls.setWorkspaceLimits).toEqual([[[1], 40 * MLN]]));
  });

  it('no budget: the bulk bar slider is not capped at $1 either', async () => {
    detail = groupDetail({ budget: null, budgetSource: 'none' });
    renderGroup();
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Select Shop 1' }));
    const slider = screen.getByRole('slider', {
      name: 'Own bulk limit for each selected workspace, dollars',
    });
    expect(Number(slider.getAttribute('max'))).toBeGreaterThanOrEqual(10);
    fireEvent.change(slider, { target: { value: '45' } });
    fireEvent.click(screen.getByRole('button', { name: 'Set limit' }));
    await waitFor(() => expect(calls.setWorkspaceLimits).toEqual([[[1], 45 * MLN]]));
  });

  it('a typed budget is saved in micros', async () => {
    renderGroup();
    await chooseOption(await screen.findByLabelText('Budget unit'), 'US dollars');
    fireEvent.change(screen.getByLabelText('Budget per billing period'), {
      target: { value: '120' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save budget' }));
    await waitFor(() => expect(calls.updateGroup).toEqual([['a:7', { budget: 120 * MLN }]]));
  });

  it("a budget typed in tokens is saved in micros at this period's price, with the dollars under it", async () => {
    const shown = groupDetail();
    const rate = shown.spend.total / shown.tokens.total;
    renderGroup();
    const field = await screen.findByRole('textbox', { name: 'Budget per billing period, tokens' });
    fireEvent.change(field, { target: { value: '50M' } });
    expect(screen.getByTestId('budget-other-unit')).toHaveTextContent(
      /^≈ \$[\d,.]+ at this period's price per token$/
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save budget' }));
    await waitFor(() =>
      expect(calls.updateGroup).toEqual([['a:7', { budget: Math.round(50_000_000 * rate) }]])
    );
  });

  it('with no usage this period there is no price: dollars only, and it says why', async () => {
    detail = groupDetail({ tokens: { total: 0, bulk: 0 } });
    renderGroup();
    expect(await screen.findByLabelText('Budget per billing period')).toHaveAttribute(
      'type',
      'number'
    );
    expect(screen.queryByLabelText('Budget unit')).toBeNull();
    expect(
      screen.getByText('Tokens can be used once this period has AI usage to price them.')
    ).toBeInTheDocument();
  });

  it('a budget typed in tokens that is not a number is refused, not saved', async () => {
    renderGroup();
    fireEvent.change(
      await screen.findByRole('textbox', { name: 'Budget per billing period, tokens' }),
      {
        target: { value: 'lots' },
      }
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save budget' }));
    expect(await screen.findByText(/Type a number of tokens above 0/)).toBeInTheDocument();
    expect(calls.updateGroup ?? []).toEqual([]);
  });

  it('hosted, from plans: shows the plan budget and an Override', async () => {
    stateResult = { available: true, state: state({ selfHosted: false }) };
    detail = groupDetail({ budget: 14_900_000, budgetSource: 'plans' });
    renderGroup();
    expect(await screen.findByText(/^From plans: ≈ \$14\.90 \(.+ tokens\)$/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Budget per billing period')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Override' }));
    await chooseOption(screen.getByLabelText('Budget unit'), 'US dollars');
    expect(screen.getByLabelText('Budget per billing period')).toHaveValue(14.9);
  });

  it('self-hosted standalone on the default budget: says so, and Override opens the field', async () => {
    detail = groupDetail({
      key: 'w:5',
      kind: 'workspace',
      id: 5,
      budget: 40 * MLN,
      budgetSource: 'default',
    });
    renderGroup();
    expect(
      await screen.findByText(/^Default for standalone workspaces: ≈ \$40\.00 \(.+ tokens\)$/)
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Budget per billing period')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Override' }));
    await chooseOption(screen.getByLabelText('Budget unit'), 'US dollars');
    fireEvent.change(screen.getByLabelText('Budget per billing period'), {
      target: { value: '55' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save budget' }));
    await waitFor(() => expect(calls.updateGroup).toEqual([['a:7', { budget: 55 * MLN }]]));
  });

  it('organisation-wide extra goes to the organisation, not a workspace', async () => {
    renderGroup();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Give extra to the whole organisation' })
    );
    fireEvent.click(screen.getByRole('button', { name: /^Give ≈ .* · ends in 3 days$/ }));
    await waitFor(() =>
      expect(calls.giveExtra).toEqual([
        { targets: [{ allianceId: 7, organizationId: null }], amountMicros: 15 * MLN, end: 3 },
      ])
    );
  });
});

describe('BudgetGroupView, organisation mode', () => {
  it('canEdit.budget false hides the budget input; no grant controls without canEdit.grant', () => {
    const view = groupDetail({
      canEdit: { budget: false, bulk: true, workspaceLimits: true, grant: false, mode: false },
    });
    render(
      <MemoryRouter future={ROUTER_FUTURE}>
        <BudgetGroupView detail={view} canEdit={view.canEdit} mode="organisation" />
      </MemoryRouter>
    );
    expect(screen.queryByLabelText('Budget per billing period')).toBeNull();
    expect(screen.getByTestId('budget-readonly')).toHaveTextContent('≈ $100.00');
    expect(
      screen.queryByRole('button', { name: 'Give extra to the whole organisation' })
    ).toBeNull();
    expect(screen.queryByRole('button', { name: /Give \+/ })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Advanced' })).toBeNull();
    // The bulk limit is still theirs to change.
    expect(screen.getByRole('switch', { name: /Limit it/ })).not.toBeDisabled();
  });

  it('the platform admin in the organisation console gets no editable budget (its PUT has none)', () => {
    const view = groupDetail({
      canEdit: { budget: true, bulk: true, workspaceLimits: true, grant: true, mode: false },
    });
    render(
      <MemoryRouter future={ROUTER_FUTURE}>
        <BudgetGroupView detail={view} canEdit={view.canEdit} mode="organisation" />
      </MemoryRouter>
    );
    expect(screen.queryByLabelText('Budget per billing period')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save budget' })).toBeNull();
    expect(screen.getByTestId('budget-readonly')).toHaveTextContent('≈ $100.00');
  });
});

describe('an organisation switched to separate (F1)', () => {
  const separateMode = { current: 'separate' as const, next: null };
  const orgWideRequest = {
    id: 41,
    target: { allianceId: 7, organizationId: null, name: 'Northwind' },
    amountMicros: 10 * MLN,
    reason: null,
    requestedBy: 'admin@northwind.example',
    createdAt: '2026-10-20T10:00:00.000Z',
  };
  const workspaceRequest = {
    ...orgWideRequest,
    id: 42,
    target: { allianceId: 7, organizationId: 1, name: 'Shop 1' },
  };

  it('an organisation-wide request: Give is off with the reason, Decline stays; a workspace request keeps Give', async () => {
    detail = groupDetail({ mode: separateMode, requests: [orgWideRequest, workspaceRequest] });
    renderGroup();
    const orgWide = await screen.findByTestId('budget-request-41');
    expect(within(orgWide).getByRole('button', { name: 'Give' })).toBeDisabled();
    expect(within(orgWide).getByRole('button', { name: 'Decline' })).toBeEnabled();
    expect(within(orgWide).getByTestId('budget-request-41-blocked')).toHaveTextContent(
      /gives each workspace its own budget/
    );
    const perWorkspace = screen.getByTestId('budget-request-42');
    expect(within(perWorkspace).getByRole('button', { name: 'Give' })).toBeEnabled();
    // The group page knew the mode: no second read of the group for the request.
    expect(calls.getGroup).toEqual(['a:7']);
  });

  it('shared: the organisation-wide request keeps Give', async () => {
    detail = groupDetail({
      mode: { current: 'shared', next: null },
      requests: [orgWideRequest],
    });
    renderGroup();
    const orgWide = await screen.findByTestId('budget-request-41');
    expect(within(orgWide).getByRole('button', { name: 'Give' })).toBeEnabled();
    expect(within(orgWide).queryByTestId('budget-request-41-blocked')).toBeNull();
  });

  it('an organisation extra still active after the switch is shown read-only and can be ended', async () => {
    detail = groupDetail({ mode: separateMode, groupExtra: extra(9) });
    renderGroup();
    const line = await screen.findByTestId('budget-separate-group-extra');
    expect(line).toHaveTextContent(/given before the switch/);
    expect(line).toHaveTextContent('$20.00');
    fireEvent.click(within(line).getByRole('button', { name: 'End extra' }));
    await waitFor(() => expect(calls.endExtra).toEqual([[9]]));
  });

  it('no organisation extra: no line', async () => {
    detail = groupDetail({ mode: separateMode });
    renderGroup();
    await screen.findByTestId('budget-separate-note');
    expect(screen.queryByTestId('budget-separate-group-extra')).toBeNull();
  });
});
