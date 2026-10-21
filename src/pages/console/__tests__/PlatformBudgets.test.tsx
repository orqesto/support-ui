/**
 * Platform → AI Spend, the monthly budgets part: an older backend, the switch-over (migration)
 * panel before Apply, and after it the group list, the requests card and the advanced settings.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ROUTER_FUTURE } from '@/test/routerFuture';
import type {
  BudgetMigration,
  BudgetState,
  BudgetStateResult,
  GroupListParams,
  GroupPage,
  GroupSummary,
  RequestRow,
} from '@/services/budgets.service';

const MLN = 1_000_000;

/** Plain functions recording their calls: vitest 4 fails a test on a module-level vi.fn's caught rejection. */
let calls: Record<string, unknown[]> = {};
const record = (name: string, args: unknown) => {
  (calls[name] ??= []).push(args);
};
let stateResult: BudgetStateResult;
let migration: BudgetMigration;
let groupPage: GroupPage;
/** Set ⇒ declineRequest answers only when this promise settles (a write in flight). */
let declineHold: Promise<void> | null = null;

vi.mock('@/services/budgets.service', () => ({
  budgetsService: {
    getState: () => Promise.resolve(stateResult),
    getMigration: () => Promise.resolve(migration),
    applyMigration: (overrides?: unknown) => {
      record('applyMigration', overrides);
      return Promise.resolve({ active: true });
    },
    listGroups: (params: GroupListParams) => {
      record('listGroups', params);
      return Promise.resolve(groupPage);
    },
    giveExtra: (body: unknown) => {
      record('giveExtra', body);
      return Promise.resolve({ grants: [] });
    },
    declineRequest: (id: number) => {
      record('declineRequest', id);
      return declineHold ?? Promise.resolve();
    },
    updateSettings: (body: unknown) => {
      record('updateSettings', body);
      return Promise.resolve(baseState().settings);
    },
  },
}));
vi.mock('sonner', () => ({ toast: { success: () => {}, warning: () => {}, error: () => {} } }));

const { PlatformBudgets } = await import('../PlatformBudgets');

const request = (over: Partial<RequestRow> = {}): RequestRow => ({
  id: 41,
  target: { allianceId: 7, organizationId: 12, name: 'Northwind Shop' },
  tokens: 40 * MLN,
  reason: 'Big import',
  requestedBy: 'ana@example.com',
  createdAt: '2026-10-19T10:00:00.000Z',
  ...over,
});

function baseState(over: Partial<BudgetState> = {}): BudgetState {
  return {
    active: true,
    selfHosted: false,
    settings: {
      version: 1,
      bulkPctMin: 50,
      bulkPctMax: 90,
      defaultBulkPct: 60,
      tokensPerCall: 1490,
      serverCeiling: null,
      defaultStandaloneBudget: null,
      liveSpikeFactor: 3,
      workspaceBulkLimits: {},
    },
    server: null,
    requests: 0,
    requestList: [],
    ...over,
  };
}

const summary = (key: string, name: string, over: Partial<GroupSummary> = {}): GroupSummary => ({
  key,
  kind: key.startsWith('a:') ? 'alliance' : 'workspace',
  id: Number(key.slice(2)),
  name,
  budget: 100 * MLN,
  budgetSource: 'override',
  bulkLimitOn: true,
  bulkPct: 60,
  spend: { total: 40 * MLN, bulk: 10 * MLN, live: 30 * MLN, extra: 0 },
  workspaces: 3,
  status: { tone: 'ok', text: 'Running normally' },
  ownKey: false,
  requestCount: 0,
  ...over,
});

const GroupStub = () => {
  const { key } = useParams();
  return <div>group page {key}</div>;
};

const renderPage = (entry = '/console/platform/ai-spend') => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter future={ROUTER_FUTURE} initialEntries={[entry]}>
        <Routes>
          <Route path="/console/platform/ai-spend" element={<PlatformBudgets />} />
          <Route path="/console/platform/ai-spend/groups/:key" element={<GroupStub />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
};

beforeEach(() => {
  declineHold = null;
  calls = {};
  stateResult = { available: true, state: baseState() };
  groupPage = {
    items: [
      summary('a:7', 'Northwind', {
        status: { tone: 'warn', text: 'Bulk processing paused' },
        requestCount: 1,
      }),
      summary('w:12', 'Contoso Mail'),
    ],
    total: 2,
  };
  migration = {
    alreadyActive: false,
    rows: [
      {
        group: { kind: 'alliance', allianceId: 7 },
        name: 'Northwind',
        budget: 120 * MLN,
        bulkPct: 60,
        bulkLimitOn: true,
        basis: 'alliance_pool',
        workspaceBulkLimits: [
          { organizationId: 12, name: 'Northwind Shop', from: 20 * MLN, meaningChanged: true },
        ],
        wouldStopWithin7Days: true,
      },
      {
        group: { kind: 'workspace', organizationId: 30 },
        name: 'Contoso Mail',
        budget: null,
        bulkPct: 60,
        bulkLimitOn: true,
        basis: 'none',
        workspaceBulkLimits: [],
        wouldStopWithin7Days: false,
      },
    ],
  };
});
afterEach(cleanup);

describe('an older backend (no budget API)', () => {
  it('says one line and calls nothing else', async () => {
    stateResult = { available: false };
    renderPage();
    expect(await screen.findByText('Budgets need the latest server update.')).toBeInTheDocument();
    expect(calls.listGroups).toBeUndefined();
  });
});

describe('before Apply: the migration panel', () => {
  beforeEach(() => {
    stateResult = { available: true, state: baseState({ active: false }) };
  });

  it('shows the dry run, says the current limits stay, and never lists groups', async () => {
    renderPage();
    expect(
      await screen.findByText(/Current limits stay in force until you switch/)
    ).toBeInTheDocument();
    expect(screen.getByText("The organisation's monthly pool")).toBeInTheDocument();
    expect(screen.getByText('⚠ now limits bulk work only')).toBeInTheDocument();
    expect(screen.getByText('Would stop within 7 days')).toBeInTheDocument();
    expect(
      screen.getByRole('spinbutton', { name: 'Monthly budget for Northwind, million tokens' })
    ).toHaveValue(120);
    expect(calls.listGroups).toBeUndefined();
  });

  it('the Advanced settings are there before Apply too (they feed the dry run)', async () => {
    renderPage();
    await screen.findByText(/Current limits stay in force until you switch/);
    fireEvent.click(screen.getByRole('button', { name: 'Show' }));
    fireEvent.change(screen.getByLabelText('Tokens per AI call'), { target: { value: '1600' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));
    await waitFor(() => expect(calls.updateSettings).toEqual([{ tokensPerCall: 1600 }]));
  });

  it('Apply asks first, then switches on with no overrides', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Apply' }));
    expect(calls.applyMigration).toBeUndefined();
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Switch to the new budgets?')).toBeInTheDocument();
    expect(
      within(dialog).getByText('Daily limits end; these numbers start now.')
    ).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(calls.applyMigration).toEqual([undefined]));
  });

  it('an edited budget is sent as that group’s override; emptied = no budget', async () => {
    renderPage();
    fireEvent.change(
      await screen.findByRole('spinbutton', {
        name: 'Monthly budget for Northwind, million tokens',
      }),
      { target: { value: '150' } }
    );
    fireEvent.change(
      screen.getByRole('spinbutton', { name: 'Monthly budget for Contoso Mail, million tokens' }),
      { target: { value: '30' } }
    );
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    fireEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Apply' })
    );
    await waitFor(() =>
      expect(calls.applyMigration).toEqual([
        { 'a:7': { budget: 150 * MLN }, 'w:30': { budget: 30 * MLN } },
      ])
    );
  });
});

describe('after Apply: the group list', () => {
  it('lists groups with their kind and status line from the API', async () => {
    renderPage();
    expect(await screen.findByRole('link', { name: 'Northwind' })).toBeInTheDocument();
    expect(screen.getByTestId('budget-group-status-a:7')).toHaveTextContent(
      'Bulk processing paused'
    );
    expect(screen.getAllByText('Organisation').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Workspace').length).toBeGreaterThan(0);
    expect(calls.listGroups?.[0]).toEqual({ sort: 'spend', page: 1, pageSize: 25 });
  });

  it('search filters via the q query param; a filter chip and the sort go along', async () => {
    renderPage();
    await screen.findByRole('link', { name: 'Northwind' });
    fireEvent.change(screen.getByPlaceholderText('Search organisations and workspaces'), {
      target: { value: 'north' },
    });
    await waitFor(() =>
      expect(calls.listGroups).toContainEqual({ q: 'north', sort: 'spend', page: 1, pageSize: 25 })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Paused' }));
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Sort by' })).getByRole('button', { name: 'Name' })
    );
    await waitFor(() =>
      expect(calls.listGroups).toContainEqual({
        q: 'north',
        sort: 'name',
        filter: 'paused',
        page: 1,
        pageSize: 25,
      })
    );
  });

  it('clicking a group opens its page', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('link', { name: 'Northwind' }));
    expect(await screen.findByText('group page a:7')).toBeInTheDocument();
  });
});

describe('requests card', () => {
  beforeEach(() => {
    stateResult = {
      available: true,
      state: baseState({ requests: 1, requestList: [request()] }),
    };
  });

  it('Give opens the extra box with the requested amount and answers the request', async () => {
    renderPage();
    expect(await screen.findByText('Requests for extra · 1 open')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Give' }));
    fireEvent.click(screen.getByRole('button', { name: 'Give +40.0M · ends in 3 days' }));
    await waitFor(() =>
      expect(calls.giveExtra).toEqual([
        {
          targets: [{ allianceId: 7, organizationId: 12 }],
          tokens: 40 * MLN,
          end: 3,
          requestId: 41,
        },
      ])
    );
  });

  it('a request above the usual slider top (500M) is given exactly', async () => {
    stateResult = {
      available: true,
      state: baseState({ requests: 1, requestList: [request({ tokens: 500 * MLN })] }),
    };
    renderPage();
    expect(await screen.findByText('Northwind Shop asks for +500M')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Give' }));
    fireEvent.click(screen.getByRole('button', { name: 'Give +500M · ends in 3 days' }));
    await waitFor(() =>
      expect(calls.giveExtra).toEqual([
        {
          targets: [{ allianceId: 7, organizationId: 12 }],
          tokens: 500 * MLN,
          end: 3,
          requestId: 41,
        },
      ])
    );
  });

  it('Decline asks first', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Decline' }));
    expect(calls.declineRequest).toBeUndefined();
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Decline' }));
    await waitFor(() => expect(calls.declineRequest).toEqual([41]));
  });

  it('while a decline is on its way, Give and Decline are disabled (no second write)', async () => {
    declineHold = new Promise<void>(() => {});
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Decline' }));
    fireEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Decline' })
    );
    await waitFor(() => expect(screen.getByRole('button', { name: 'Decline' })).toBeDisabled());
    expect(screen.getByRole('button', { name: 'Give' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Decline' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(calls.declineRequest).toEqual([41]);
  });
});

describe('advanced settings', () => {
  it('the Advanced link (#budget-advanced) opens the card and scrolls to it once it mounts', async () => {
    const scrolled: Element[] = [];
    const original = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollIntoView');
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      value: function scrollIntoView(this: Element) {
        scrolled.push(this);
      },
    });
    try {
      renderPage('/console/platform/ai-spend#budget-advanced');
      expect(await screen.findByLabelText('Tokens per AI call')).toBeInTheDocument();
      expect(scrolled.map((element) => element.id)).toEqual(['budget-advanced']);
    } finally {
      if (original) Object.defineProperty(Element.prototype, 'scrollIntoView', original);
      else Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
    }
  });

  it('collapsed; sends only the changed setting', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Show' }));
    expect(screen.getByLabelText('Tokens per AI call')).toHaveValue(1490);
    // Hosted: no server ceiling.
    expect(screen.queryByLabelText(/Server ceiling/)).toBeNull();
    fireEvent.change(screen.getByLabelText('Bulk limit, highest %'), { target: { value: '80' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));
    await waitFor(() => expect(calls.updateSettings).toEqual([{ bulkPctMax: 80 }]));
  });

  it('self-hosted: the server ceiling bar and setting, no tokens per call', async () => {
    stateResult = {
      available: true,
      state: baseState({ selfHosted: true, server: { ceiling: 500 * MLN, spend: 200 * MLN } }),
    };
    renderPage();
    expect(await screen.findByText('200M of 500M this month, extra included')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show' }));
    expect(screen.queryByLabelText('Tokens per AI call')).toBeNull();
    fireEvent.change(screen.getByLabelText(/Server ceiling/), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText(/Server ceiling/), { target: { value: '600' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));
    await waitFor(() => expect(calls.updateSettings).toEqual([{ serverCeiling: 600 * MLN }]));
  });

  it('self-hosted: the default standalone budget is sent only when changed', async () => {
    stateResult = { available: true, state: baseState({ selfHosted: true }) };
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Show' }));
    const field = screen.getByLabelText(/Default budget for new standalone workspaces/);
    expect(field).toHaveValue(null);
    fireEvent.change(field, { target: { value: '40' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));
    await waitFor(() =>
      expect(calls.updateSettings).toEqual([{ defaultStandaloneBudget: 40 * MLN }])
    );
  });

  it('hosted: no default standalone budget field', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Show' }));
    expect(screen.getByLabelText('Tokens per AI call')).toBeInTheDocument();
    expect(screen.queryByLabelText(/Default budget for new standalone workspaces/)).toBeNull();
  });
});
