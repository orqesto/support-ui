/**
 * Organisation console → AI budget: the budget is never editable, the bulk limit and workspace
 * limits follow canEdit, extra is requested (never given) for the whole organisation or one
 * workspace, and before Apply there is one line.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { chooseOption } from '@/test/chooseOption';
import { ROUTER_FUTURE } from '@/test/routerFuture';
import type { BudgetsInactive, GroupDetail, WorkspaceRow } from '@/services/budgets.service';

const MLN = 1_000_000;

let calls: Record<string, unknown[]> = {};
const record = (name: string, args: unknown) => {
  (calls[name] ??= []).push(args);
};
let result: GroupDetail | BudgetsInactive | Error;
let requestRefusal: Error | null = null;

vi.mock('@/services/budgets.service', () => ({
  budgetsService: {
    getAllianceBudget: (id: number) => {
      record('getAllianceBudget', id);
      return result instanceof Error ? Promise.reject(result) : Promise.resolve(result);
    },
    updateAllianceBudget: (id: number, body: unknown) => {
      record('updateAllianceBudget', [id, body]);
      return Promise.resolve(result);
    },
    setAllianceWorkspaceLimits: (id: number, ids: number[], limit: number | null) => {
      record('setAllianceWorkspaceLimits', [id, ids, limit]);
      return Promise.resolve({ updated: ids.length });
    },
    requestAllianceExtra: (id: number, body: unknown) => {
      record('requestAllianceExtra', [id, body]);
      return requestRefusal ? Promise.reject(requestRefusal) : Promise.resolve({ id: 1 });
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

const { ConsoleAiBudget } = await import('../ConsoleAiBudget');

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

const detail = (over: Partial<GroupDetail> = {}): GroupDetail => ({
  key: 'a:7',
  kind: 'alliance',
  id: 7,
  name: 'Northwind',
  budget: 100 * MLN,
  budgetSource: 'override',
  bulkLimitOn: true,
  bulkPct: 60,
  spend: { total: 60 * MLN, bulk: 20 * MLN, live: 40 * MLN, extra: 0 },
  workspaces: 2,
  status: { tone: 'ok', text: 'Running normally' },
  ownKey: false,
  requestCount: 0,
  active: true,
  removedSpend: { total: 0, bulk: 0 },
  groupExtra: null,
  rows: [row(1, 30 * MLN), row(2, 20 * MLN)],
  requests: [],
  month: '2026-10',
  resetsAt: '2026-11-01T00:00:00.000Z',
  bulkPctMin: 50,
  bulkPctMax: 90,
  canEdit: { budget: false, bulk: true, workspaceLimits: true, grant: false },
  ...over,
});

const renderPage = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter future={ROUTER_FUTURE} initialEntries={['/console/alliance/7/ai-budget']}>
        <Routes>
          <Route path="/console/alliance/:allianceId/ai-budget" element={<ConsoleAiBudget />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
};

beforeEach(() => {
  calls = {};
  requestRefusal = null;
  result = detail();
});
afterEach(cleanup);

describe('ConsoleAiBudget', () => {
  it('self-hosted (canEdit.bulk true): the bulk limit is editable, the budget is not', async () => {
    renderPage();
    expect(await screen.findByTestId('budget-readonly')).toHaveTextContent('100M');
    expect(screen.queryByLabelText('Monthly budget')).toBeNull();
    const toggle = screen.getByRole('switch', { name: /Limit it/ });
    expect(toggle).not.toBeDisabled();
    fireEvent.click(toggle);
    await waitFor(() => expect(calls.updateAllianceBudget).toEqual([[7, { bulkLimitOn: false }]]));
  });

  it('hosted (canEdit.bulk false): the bulk limit is read-only', async () => {
    result = detail({
      canEdit: { budget: false, bulk: false, workspaceLimits: false, grant: false },
    });
    renderPage();
    await screen.findByTestId('budget-readonly');
    expect(screen.getByRole('switch', { name: /Limit it/ })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /Give/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Set limit' })).toBeNull();
  });

  it('never offers Give extra, even if the API said grant', async () => {
    result = detail({
      canEdit: { budget: false, bulk: true, workspaceLimits: true, grant: true },
    });
    renderPage();
    await screen.findByTestId('budget-readonly');
    expect(screen.queryByRole('button', { name: /Give/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /End now/ })).toBeNull();
  });

  it('Request extra for the whole organisation posts to the alliance route', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Request extra' }));
    fireEvent.change(screen.getByLabelText('Reason (optional)'), {
      target: { value: 'Big import' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send request' }));
    await waitFor(() =>
      expect(calls.requestAllianceExtra).toEqual([
        [7, { tokens: 5 * MLN, reason: 'Big import', organizationId: undefined }],
      ])
    );
  });

  it('Request extra for a chosen workspace carries its id and its suggested amount', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Request extra' }));
    await chooseOption(screen.getByLabelText('For'), 'Shop 2');
    fireEvent.click(screen.getByRole('button', { name: 'Send request' }));
    await waitFor(() =>
      expect(calls.requestAllianceExtra).toEqual([
        [7, { tokens: 15 * MLN, reason: undefined, organizationId: 2 }],
      ])
    );
  });

  it('a refused request is a toast', async () => {
    requestRefusal = Object.assign(new Error('refused'), {
      status: 400,
      data: { error: 'Already requested' },
    });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Request extra' }));
    fireEvent.click(screen.getByRole('button', { name: 'Send request' }));
    await waitFor(() => expect(calls['toast.error']).toEqual(['Already requested']));
  });

  it('before Apply: one line', async () => {
    result = { active: false };
    renderPage();
    expect(await screen.findByText('Budgets are not switched on yet.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Request extra' })).toBeNull();
  });

  it('a 404 from an older server: the same line, no crash', async () => {
    result = Object.assign(new Error('Not found'), { status: 404 });
    renderPage();
    expect(await screen.findByText('Budgets are not switched on yet.')).toBeInTheDocument();
  });
});
