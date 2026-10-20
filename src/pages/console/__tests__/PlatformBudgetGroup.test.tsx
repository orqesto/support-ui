/**
 * Platform → AI Spend → one group, and the shared group body in the organisation console mode.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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
      return Promise.resolve({ grants: [] });
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
  active: true,
  selfHosted: true,
  settings: {
    version: 1,
    bulkPctMin: 50,
    bulkPctMax: 90,
    defaultBulkPct: 60,
    tokensPerCall: 1490,
    serverCeiling: null,
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
  tokens: 20 * MLN,
  used: 2 * MLN,
  endsAt: new Date(Date.now() + 2 * 86_400_000).toISOString(),
});

const row = (id: number, total: number, over: Partial<WorkspaceRow> = {}): WorkspaceRow => ({
  organizationId: id,
  name: `Shop ${id}`,
  spend: { total, bulk: total / 4, live: (total * 3) / 4 },
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
  canEdit: { budget: true, bulk: true, workspaceLimits: true, grant: true },
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

  it('select two rows ⇒ "2 selected"; Set limit sends both ids and the limit in tokens', async () => {
    renderGroup();
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Select Shop 1' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Shop 2' }));
    expect(screen.getByText('2 selected')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Set limit' }));
    await waitFor(() => expect(calls.setWorkspaceLimits).toEqual([[[1, 2], 30 * MLN]]));
  });

  it('Give extra with "Each gets what its import still needs" sends tokens: suggested', async () => {
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
          tokens: 'suggested',
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
    fireEvent.click(await screen.findByRole('button', { name: 'Give +15.0M extra · 3 days' }));
    await waitFor(() =>
      expect(calls.giveExtra).toEqual([
        { targets: [{ allianceId: 7, organizationId: 3 }], tokens: 15 * MLN, end: 3 },
      ])
    );
  });

  it('a typed budget is saved in tokens', async () => {
    renderGroup();
    fireEvent.change(await screen.findByLabelText('Monthly budget'), { target: { value: '120' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save budget' }));
    await waitFor(() => expect(calls.updateGroup).toEqual([['a:7', { budget: 120 * MLN }]]));
  });

  it('hosted, from plans: shows the plan budget and an Override', async () => {
    stateResult = { available: true, state: state({ selfHosted: false }) };
    detail = groupDetail({ budget: 14_900_000, budgetSource: 'plans' });
    renderGroup();
    expect(await screen.findByText('From plans: 14.9M')).toBeInTheDocument();
    expect(screen.queryByLabelText('Monthly budget')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Override' }));
    expect(screen.getByLabelText('Monthly budget')).toHaveValue(14.9);
  });

  it('organisation-wide extra goes to the organisation, not a workspace', async () => {
    renderGroup();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Give extra to the whole organisation' })
    );
    fireEvent.click(screen.getByRole('button', { name: /^Give \+.* · ends in 3 days$/ }));
    await waitFor(() =>
      expect(calls.giveExtra).toEqual([
        { targets: [{ allianceId: 7, organizationId: null }], tokens: 15 * MLN, end: 3 },
      ])
    );
  });
});

describe('BudgetGroupView, organisation mode', () => {
  it('canEdit.budget false hides the budget input; no grant controls without canEdit.grant', () => {
    const view = groupDetail({
      canEdit: { budget: false, bulk: true, workspaceLimits: true, grant: false },
    });
    render(
      <MemoryRouter future={ROUTER_FUTURE}>
        <BudgetGroupView detail={view} canEdit={view.canEdit} mode="organisation" />
      </MemoryRouter>
    );
    expect(screen.queryByLabelText('Monthly budget')).toBeNull();
    expect(screen.getByTestId('budget-readonly')).toHaveTextContent('100M');
    expect(
      screen.queryByRole('button', { name: 'Give extra to the whole organisation' })
    ).toBeNull();
    expect(screen.queryByRole('button', { name: /Give \+/ })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Advanced' })).toBeNull();
    // The bulk limit is still theirs to change.
    expect(screen.getByRole('switch', { name: /Limit it/ })).not.toBeDisabled();
  });
});
