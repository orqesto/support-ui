/**
 * Owner 2026-10-07: deactivating a department moves its KB entries to the workspace's default
 * department (or to the merge target), and the console must SAY SO — before the confirm and in the
 * success toast. A backend that predates `kbEntries` must show nothing new. The service runs
 * through the REAL api-client; only the wire is fake.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ROUTER_FUTURE } from '@/test/routerFuture';
import { chooseOption } from '@/test/chooseOption';
import { apiClient } from '@/lib/api-client';
import { installTransport, ok, routeAbsent, type WireResponse } from '@/test/apiTransport';
import type {
  KbEntriesMove,
  WorkspaceDepartmentRow,
  WorkspaceDepartmentsView,
} from '@/services/platform.service';

const toasts: Array<[string, string]> = [];
vi.mock('sonner', () => ({
  toast: {
    success: (message: string) => toasts.push(['success', message]),
    error: (message: string) => toasts.push(['error', message]),
  },
}));
vi.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ isAdmin: true }) }));

const { WorkspaceDepartmentsPage } = await import('../WorkspaceDepartmentsPage');

const counts = (busy: boolean) => ({
  messageSources: busy ? 1 : 0,
  users: busy ? 1 : 0,
  openConversations: 0,
  totalConversations: busy ? 4 : 0,
});
const row = (
  id: number,
  name: string,
  extra: Partial<WorkspaceDepartmentRow> = {}
): WorkspaceDepartmentRow => ({
  id,
  name,
  slug: name.toLowerCase(),
  active: true,
  isDefault: false,
  counts: counts(false),
  ...extra,
});

const toSupport = (count: number): KbEntriesMove => ({
  count,
  toDepartmentId: 1,
  toDepartmentName: 'Support',
});

/** Billing (empty, deactivates directly) and Sales (non-empty, needs a merge target). */
let billingKb: KbEntriesMove | null | undefined;
let salesKb: KbEntriesMove | null | undefined;
let deactivateAnswer: () => WireResponse;
const view = (): WorkspaceDepartmentsView => {
  const withKb = (base: WorkspaceDepartmentRow, kb: KbEntriesMove | null | undefined) =>
    kb === undefined ? base : { ...base, kbEntries: kb };
  return {
    budget: { limit: 10, activeCount: 3 },
    departments: [
      row(1, 'Support', { isDefault: true, counts: counts(true) }),
      withKb(row(2, 'Sales', { counts: counts(true) }), salesKb),
      withKb(row(3, 'Billing'), billingKb),
    ],
  };
};

let wire: ReturnType<typeof installTransport>;
beforeEach(() => {
  toasts.length = 0;
  billingKb = undefined;
  salesKb = undefined;
  deactivateAnswer = () => ok({ ...view(), result: { departmentId: 3, merged: false } });
  wire = installTransport(apiClient, (request) => {
    if (request.method === 'GET' && request.path === '/api/admin/organizations/5/departments')
      return ok(view());
    if (request.method === 'POST' && request.path.endsWith('/deactivate'))
      return deactivateAnswer();
    return routeAbsent(request);
  });
});
afterEach(() => {
  cleanup();
  wire.restore();
});

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/console/workspace/5/departments']} future={ROUTER_FUTURE}>
      <Routes>
        <Route
          path="/console/workspace/:orgId/departments"
          element={<WorkspaceDepartmentsPage />}
        />
      </Routes>
    </MemoryRouter>
  );

/** Opens the Deactivate dialog of Sales (index 0) or Billing (index 1). */
const openDeactivate = async (which: 'Sales' | 'Billing') => {
  renderPage();
  await screen.findByText('Departments');
  const buttons = screen.getAllByRole('button', { name: 'Deactivate' });
  fireEvent.click(buttons[which === 'Sales' ? 0 : 1]);
  await screen.findByText(`Deactivate “${which}”`);
};

const confirmButton = () =>
  screen
    .getAllByRole('button')
    .find(
      (button) =>
        /^(Deactivate|Merge & deactivate)$/.test(button.textContent ?? '') &&
        button.closest('[role="dialog"]') !== null
    );

describe('Deactivate department — KB entries said before the confirm', () => {
  it('no target (empty department): the entries move to the default department, by name', async () => {
    billingKb = toSupport(3);
    await openDeactivate('Billing');
    expect(screen.getByText('3 knowledge-base entries will move to Support.')).toBeTruthy();
  });

  it('a merge: the picked target is named, not the default', async () => {
    salesKb = toSupport(1);
    await openDeactivate('Sales');
    expect(
      screen.getByText('1 knowledge-base entry will move to the department you choose.')
    ).toBeTruthy();
    await chooseOption(screen.getByLabelText('Move everything to'), /^Billing/);
    expect(screen.getByText('1 knowledge-base entry will move to Billing.')).toBeTruthy();
    expect(screen.queryByText(/will move to Support/)).toBeNull();
  });

  it('no default department and no target: warns that deactivation will be refused', async () => {
    billingKb = { count: 2, toDepartmentId: null, toDepartmentName: null };
    await openDeactivate('Billing');
    expect(screen.getByText(/so deactivating it will be refused/)).toBeTruthy();
    expect(screen.getByText(/This department has 2 knowledge-base entries/)).toBeTruthy();
  });

  it('no entries (kbEntries null): nothing about the knowledge base', async () => {
    billingKb = null;
    await openDeactivate('Billing');
    expect(screen.queryByText(/knowledge-base/)).toBeNull();
  });

  it('an older backend (no kbEntries at all): nothing new in the dialog or the toast', async () => {
    await openDeactivate('Billing');
    expect(screen.queryByText(/knowledge-base/)).toBeNull();
    fireEvent.click(confirmButton()!);
    await waitFor(() => expect(toasts).toEqual([['success', 'Deactivated “Billing”']]));
  });
});

describe('Deactivate department — KB entries said after the action', () => {
  it('the toast says how many entries moved and where', async () => {
    billingKb = toSupport(3);
    deactivateAnswer = () =>
      ok({ ...view(), result: { departmentId: 3, merged: false, kbEntries: toSupport(3) } });
    await openDeactivate('Billing');
    fireEvent.click(confirmButton()!);
    await waitFor(() =>
      expect(toasts).toEqual([
        ['success', 'Deactivated “Billing” · 3 knowledge-base entries moved to Support'],
      ])
    );
  });

  it('a merge toast names the target the entries went to', async () => {
    salesKb = toSupport(1);
    deactivateAnswer = () =>
      ok({
        ...view(),
        result: {
          departmentId: 2,
          merged: true,
          mergedInto: 3,
          counts: {
            conversations: 4,
            tickets: 0,
            messageSources: 1,
            messageSourceLinks: 1,
            userMemberships: 1,
            ticketingIntegrations: 0,
          },
          kbEntries: { count: 1, toDepartmentId: 3, toDepartmentName: 'Billing' },
        },
      });
    await openDeactivate('Sales');
    await chooseOption(screen.getByLabelText('Move everything to'), /^Billing/);
    fireEvent.click(confirmButton()!);
    await waitFor(() =>
      expect(toasts).toEqual([
        [
          'success',
          'Merged “Sales” — moved 1 source(s), 1 member(s), 4 conversation(s)' +
            ' · 1 knowledge-base entry moved to Billing',
        ],
      ])
    );
  });

  it('the 409 (no default department) is shown in the backend’s words', async () => {
    billingKb = { count: 2, toDepartmentId: null, toDepartmentName: null };
    const refusal =
      'This department still has 2 knowledge base entries, and the workspace has no active ' +
      'default department to move them to. Set an active default department (or move the ' +
      'entries to another department) first, then deactivate.';
    deactivateAnswer = () => ({ status: 409, data: { success: false, error: refusal } });
    await openDeactivate('Billing');
    fireEvent.click(confirmButton()!);
    await waitFor(() => expect(toasts).toEqual([['error', refusal]]));
  });
});
