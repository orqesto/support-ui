/**
 * "Admin (Global)" may be offered only inside the system org — and only when the cached
 * `currentOrganization` IS the org this modal will write to.
 *
 * `organizationsStore.currentOrganization` is one global slot that outlives an in-place
 * org switch, so after switching away from the system org the modal still offered the
 * global-admin role under a client workspace's context. Audit u38 P1-0.
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { ThemeProvider } from '@/contexts/ThemeContext';

type AuthState = { user: null; selectedOrganizationId: number | null };
let authState: AuthState = { user: null, selectedOrganizationId: 1 };
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector: (state: AuthState) => unknown) => selector(authState),
}));
vi.mock('@/services/department.service', () => ({
  departmentService: { getAll: () => Promise.resolve([]) },
}));

const { CreateUserModal, offersGlobalAdminRole } = await import('../CreateUserModal');
const { useOrganizationsStore } = await import('@/stores/organizationsStore');

type Org = ReturnType<typeof useOrganizationsStore.getState>['currentOrganization'];
const systemOrg = { id: 1, name: 'Odly', slug: 'odly', isSystem: true } as unknown as Org;

describe('offersGlobalAdminRole', () => {
  it.each([
    ['the system org, selected', { id: 1, isSystem: true }, 1, true],
    ['the system org cached, but another org selected', { id: 1, isSystem: true }, 2, false],
    ['a client org, selected', { id: 2, isSystem: false }, 2, false],
    ['a client org cached while the system org is selected', { id: 2, isSystem: false }, 1, false],
    ['nothing cached', null, 1, false],
    ['no selection', { id: 1, isSystem: true }, null, false],
  ])('%s', (_label, cached, selected, expected) => {
    expect(offersGlobalAdminRole(cached, selected)).toBe(expected);
  });
});

const openGlobalRoleMenu = () => {
  fireEvent.keyDown(screen.getByLabelText('Global Role'), { key: 'ArrowDown', code: 'ArrowDown' });
};

beforeEach(() => {
  useOrganizationsStore.getState().setCurrentOrganization(systemOrg);
});
afterEach(cleanup);

describe('CreateUserModal — the global-admin option', () => {
  const renderModal = () =>
    render(
      <ThemeProvider>
        <CreateUserModal isOpen onClose={vi.fn()} onCreate={vi.fn()} />
      </ThemeProvider>
    );

  it('THE FIX: is NOT offered when the cached system org is not the selected one', () => {
    authState = { user: null, selectedOrganizationId: 2 };
    renderModal();
    openGlobalRoleMenu();
    expect(screen.getByRole('option', { name: 'User' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Admin (Global)' })).not.toBeInTheDocument();
  });

  it('CONTROL: is offered inside the system org itself', () => {
    authState = { user: null, selectedOrganizationId: 1 };
    renderModal();
    openGlobalRoleMenu();
    expect(screen.getByRole('option', { name: 'Admin (Global)' })).toBeInTheDocument();
  });
});
