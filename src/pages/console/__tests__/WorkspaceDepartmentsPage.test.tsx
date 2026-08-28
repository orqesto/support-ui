import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ROUTER_FUTURE } from '@/test/routerFuture';
import type { WorkspaceDepartmentsView } from '@/services/platform.service';

// Over budget (3 active of 2) so the budget badge + over-budget banner both render.
const VIEW: WorkspaceDepartmentsView = {
  budget: { limit: 2, activeCount: 3 },
  departments: [
    {
      id: 1,
      name: 'Support',
      slug: 'support',
      active: true,
      isDefault: true,
      counts: { messageSources: 1, users: 2, openConversations: 1, totalConversations: 5 },
    },
    {
      id: 2,
      name: 'Sales',
      slug: 'sales',
      active: true,
      isDefault: false,
      counts: { messageSources: 2, users: 1, openConversations: 0, totalConversations: 3 },
    },
    {
      id: 3,
      name: 'Billing',
      slug: 'billing',
      active: true,
      isDefault: false,
      counts: { messageSources: 0, users: 0, openConversations: 0, totalConversations: 0 },
    },
    {
      id: 4,
      name: 'Info',
      slug: 'info',
      active: false,
      isDefault: false,
      counts: { messageSources: 0, users: 0, openConversations: 0, totalConversations: 0 },
    },
  ],
};

const listWorkspaceDepartments = vi.fn((..._args: unknown[]) => Promise.resolve(VIEW));
const activateWorkspaceDepartment = vi.fn((..._args: unknown[]) => Promise.resolve(VIEW));
const deactivateWorkspaceDepartment = vi.fn((..._args: unknown[]) =>
  Promise.resolve({ ...VIEW, result: { departmentId: 2, merged: false } })
);

vi.mock('@/services/platform.service', () => ({
  platformService: {
    listWorkspaceDepartments: (...args: unknown[]) => listWorkspaceDepartments(...args),
    activateWorkspaceDepartment: (...args: unknown[]) => activateWorkspaceDepartment(...args),
    deactivateWorkspaceDepartment: (...args: unknown[]) => deactivateWorkspaceDepartment(...args),
  },
}));

const isAdmin = { value: true };
vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ isAdmin: isAdmin.value }),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { WorkspaceDepartmentsPage } = await import('../WorkspaceDepartmentsPage');

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

afterEach(cleanup);
beforeEach(() => {
  isAdmin.value = true;
  listWorkspaceDepartments.mockClear();
  activateWorkspaceDepartment.mockClear();
  deactivateWorkspaceDepartment.mockClear();
});

describe('WorkspaceDepartmentsPage', () => {
  it('lists departments with the budget, over-budget banner, and per-row actions', async () => {
    renderPage();
    // Loads for the org in the route param.
    expect(await screen.findByText('Departments')).toBeInTheDocument();
    expect(listWorkspaceDepartments).toHaveBeenCalledWith(5);

    // Budget badge + over-budget banner (3 active of 2).
    expect(screen.getByText('3 of 2 active')).toBeInTheDocument();
    expect(screen.getByText(/more active departments than its plan allows/i)).toBeInTheDocument();

    // The default department is locked on; an inactive one offers Activate.
    expect(screen.getByText('Support')).toBeInTheDocument();
    expect(screen.getByText('Always active')).toBeInTheDocument();
    expect(screen.getByText('Inactive')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Activate' })).toBeInTheDocument();
    // Two active non-default departments (Sales, Billing) each get a Deactivate button.
    expect(screen.getAllByRole('button', { name: 'Deactivate' })).toHaveLength(2);
  });

  it('activates an inactive department via the endpoint (org, dept, no override)', async () => {
    renderPage();
    await screen.findByText('Departments');
    fireEvent.click(screen.getByRole('button', { name: /^activate$/i }));
    await waitFor(() => expect(activateWorkspaceDepartment).toHaveBeenCalledWith(5, 4, false));
  });

  it('opening deactivate on a non-empty department requires picking a merge target', async () => {
    renderPage();
    await screen.findByText('Departments');
    // Sales is non-empty → its Deactivate opens the merge dialog with a target picker.
    const deactivateButtons = screen.getAllByRole('button', { name: 'Deactivate' });
    fireEvent.click(deactivateButtons[0]); // Sales (first active non-default)

    // The merge dialog opens with a required target picker.
    expect(await screen.findByText('Move everything to')).toBeInTheDocument();
    // Target options exclude Sales itself and the inactive Info; Billing is offered.
    expect(screen.getByRole('option', { name: /Billing/ })).toBeInTheDocument();
    // Confirm is disabled until a target is chosen (nothing dispatched yet).
    const confirm = screen.getByRole('button', { name: /Merge & deactivate/i });
    expect(confirm).toBeDisabled();
    expect(deactivateWorkspaceDepartment).not.toHaveBeenCalled();
  });

  it('hides the tool from non-global-admins', async () => {
    isAdmin.value = false;
    renderPage();
    expect(
      await screen.findByText(/available to platform administrators only/i)
    ).toBeInTheDocument();
    expect(listWorkspaceDepartments).not.toHaveBeenCalled();
  });
});
