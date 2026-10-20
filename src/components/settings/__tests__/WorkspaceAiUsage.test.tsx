/**
 * Workspace settings → AI usage: a member reads, an admin requests extra, a hosted own-key
 * standalone admin also edits the budget; before Apply there is one line.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { BudgetsInactive, WorkspaceUsage } from '@/services/budgets.service';

const MLN = 1_000_000;

let calls: Record<string, unknown[]> = {};
const record = (name: string, args: unknown) => {
  (calls[name] ??= []).push(args);
};
let result: WorkspaceUsage | BudgetsInactive | Error;
let requestRefusal: Error | null = null;

vi.mock('@/services/budgets.service', () => ({
  budgetsService: {
    getMyAiUsage: () => {
      record('getMyAiUsage', null);
      return result instanceof Error ? Promise.reject(result) : Promise.resolve(result);
    },
    updateMyBudget: (body: unknown) => {
      record('updateMyBudget', body);
      return Promise.resolve(result);
    },
    requestMyExtra: (body: unknown) => {
      record('requestMyExtra', body);
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

const { WorkspaceAiUsage } = await import('../WorkspaceAiUsage');

const usage = (over: Partial<WorkspaceUsage> = {}): WorkspaceUsage => ({
  active: true,
  group: { key: 'a:7', kind: 'alliance', name: 'Northwind' },
  budget: 100 * MLN,
  budgetSource: 'override',
  bulkLimitOn: true,
  bulkPct: 60,
  bulkPctMin: 50,
  bulkPctMax: 90,
  spend: { total: 60 * MLN, bulk: 20 * MLN, live: 40 * MLN },
  bulkLimit: 60 * MLN,
  extra: {
    id: 1,
    grantIds: [1],
    tokens: 10 * MLN,
    used: 2 * MLN,
    endsAt: new Date(Date.now() + 2 * 86_400_000).toISOString(),
  },
  status: { tone: 'ok', text: 'Running normally' },
  bulkPaused: false,
  groupStatus: { tone: 'ok', text: 'Organisation running normally' },
  myBulkLimit: 25 * MLN,
  myBulkSpend: 8 * MLN,
  ownKey: false,
  canEdit: { budget: false, bulk: false, request: false },
  month: '2026-10',
  resetsAt: '2026-11-01T00:00:00.000Z',
  ...over,
});

const renderIt = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <WorkspaceAiUsage />
    </QueryClientProvider>
  );
};

beforeEach(() => {
  calls = {};
  requestRefusal = null;
  result = usage();
});
afterEach(cleanup);

describe('WorkspaceAiUsage', () => {
  it('a member reads the numbers and gets no controls', async () => {
    renderIt();
    expect(await screen.findByText('Organisation Northwind')).toBeInTheDocument();
    expect(screen.getByTestId('budget-readonly')).toHaveTextContent('100M');
    expect(screen.getByTestId('my-bulk-limit')).toHaveTextContent('At most 25.0M');
    expect(screen.getByTestId('my-bulk-spend')).toHaveTextContent('8.0M');
    expect(screen.getByText('+10.0M')).toBeInTheDocument();
    expect(screen.getByTestId('my-status')).toHaveTextContent('Running normally');
    expect(screen.getByTestId('group-status')).toHaveTextContent('Organisation running');
    expect(screen.queryByLabelText('Monthly budget')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Send request' })).toBeNull();
    expect(screen.getByRole('switch', { name: /Limit it/ })).toBeDisabled();
  });

  it('a standalone workspace is named as such', async () => {
    result = usage({ group: { key: 'w:3', kind: 'workspace', name: 'Shop' } });
    renderIt();
    expect(await screen.findByText('Not in an organisation')).toBeInTheDocument();
  });

  it('shows the paused hint', async () => {
    result = usage({ bulkPaused: true });
    renderIt();
    expect(await screen.findByTestId('bulk-paused-hint')).toBeInTheDocument();
  });

  it('an admin sends a request with the reason', async () => {
    result = usage({ canEdit: { budget: false, bulk: false, request: true } });
    renderIt();
    fireEvent.change(await screen.findByLabelText('Reason (optional)'), {
      target: { value: 'Re-mine' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send request' }));
    await waitFor(() =>
      expect(calls.requestMyExtra).toEqual([{ tokens: 10 * MLN, reason: 'Re-mine' }])
    );
    expect(screen.queryByLabelText('For')).toBeNull();
  });

  it('a refused request is a toast', async () => {
    result = usage({ canEdit: { budget: false, bulk: false, request: true } });
    requestRefusal = Object.assign(new Error('refused'), {
      status: 400,
      data: { error: 'Already requested' },
    });
    renderIt();
    fireEvent.click(await screen.findByRole('button', { name: 'Send request' }));
    await waitFor(() => expect(calls['toast.error']).toEqual(['Already requested']));
  });

  it('an own-key standalone admin edits the budget and the bulk limit', async () => {
    result = usage({
      group: { key: 'w:3', kind: 'workspace', name: 'Shop' },
      ownKey: true,
      canEdit: { budget: true, bulk: true, request: true },
    });
    renderIt();
    const input = await screen.findByLabelText('Monthly budget');
    fireEvent.change(input, { target: { value: '150' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save budget' }));
    await waitFor(() => expect(calls.updateMyBudget).toEqual([{ budget: 150 * MLN }]));
    fireEvent.click(screen.getByRole('switch', { name: /Limit it/ }));
    await waitFor(() => expect(calls.updateMyBudget).toContainEqual({ bulkLimitOn: false }));
  });

  it('before Apply: one line', async () => {
    result = { active: false };
    renderIt();
    expect(await screen.findByText('Budgets are not switched on yet.')).toBeInTheDocument();
  });

  it('a 404: the same line, no crash', async () => {
    result = Object.assign(new Error('Not found'), { status: 404 });
    renderIt();
    expect(await screen.findByText('Budgets are not switched on yet.')).toBeInTheDocument();
  });
});
