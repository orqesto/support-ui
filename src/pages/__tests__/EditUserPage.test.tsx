/**
 * Edit User as a page rather than a dialog.
 *
 * The cases that matter are the ones a straight lift-and-shift gets wrong: leaving the
 * page must not silently discard a screenful of edits, and inside the per-workspace
 * console shell the route must stay under /console/workspace/:orgId — leaving it drops
 * the org context WorkspaceShell established, so the form would act on the caller's home
 * workspace instead of the one being administered.
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type * as ReactRouterDom from 'react-router-dom';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { EditUserPage } from '@/pages/EditUserPage';

const navigateSpy = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof ReactRouterDom>('react-router-dom');
  return { ...actual, useNavigate: () => navigateSpy };
});

const baseUser = {
  id: 7,
  email: 'ada@example.com',
  firstName: 'Ada',
  lastName: 'Lovelace',
  position: null,
  role: 'user' as const,
  organizationRole: 'support' as const,
  organizationId: 3,
  departmentIds: [1],
  permissionOverrides: {},
  scimManaged: false,
};

let fetchedUser: typeof baseUser = baseUser;
const updateSpy = vi.fn();

vi.mock('@/services/user.service', () => ({
  userService: {
    getById: () => Promise.resolve(fetchedUser),
    getAll: () => Promise.resolve({ data: [], pagination: {} }),
    update: (...args: unknown[]) => {
      updateSpy(...args);
      return Promise.resolve();
    },
    getSkillValues: () => Promise.resolve({}),
    getCanEditSkills: () => Promise.resolve(false),
    setSkillValues: () => Promise.resolve(),
    setCanEditSkills: () => Promise.resolve(),
  },
}));

vi.mock('@/services/department.service', () => ({
  departmentService: { getAll: () => Promise.resolve([]) },
}));
vi.mock('@/services/organization.service', () => ({
  organizationService: {
    getAll: () => Promise.resolve({ data: [] }),
    getRoutingKeys: () => Promise.resolve([]),
    removeMember: () => Promise.resolve(),
    addMember: () => Promise.resolve(),
  },
}));
vi.mock('@/services/scim.service', () => ({ listScimGroupMappings: () => Promise.resolve([]) }));

vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector: (state: { user: { id: number } }) => unknown) =>
    selector({ user: { id: 1 } }),
}));

vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ isAdmin: false, canManageUsers: true }),
}));

vi.mock('@/components/layout/Layout', () => ({
  Layout: ({ children }: { children: React.ReactNode }) => <div data-testid="layout">{children}</div>,
}));

const renderAt = (path: string, routePath: string, embedded = false) =>
  render(
    // ReactSelect reads the theme, so every render needs the provider.
    <ThemeProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path={routePath} element={<EditUserPage embedded={embedded} />} />
        </Routes>
      </MemoryRouter>
    </ThemeProvider>
  );

beforeEach(() => {
  fetchedUser = { ...baseUser };
  navigateSpy.mockReset();
  updateSpy.mockReset();
});
afterEach(cleanup);

describe('EditUserPage', () => {
  it('loads the member and seeds the form', async () => {
    renderAt('/users/7/edit', '/users/:id/edit');
    expect(await screen.findByDisplayValue('Ada')).toBeInTheDocument();
    expect(screen.getByText('ada@example.com')).toBeInTheDocument();
  });

  it('saves and returns to the member list', async () => {
    renderAt('/users/7/edit', '/users/:id/edit');
    await screen.findByDisplayValue('Ada');

    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => expect(updateSpy).toHaveBeenCalled());
    const [userId, payload] = updateSpy.mock.calls[0] as [number, Record<string, unknown>];
    expect(userId).toBe(7);
    expect(payload.firstName).toBe('Ada');
    await waitFor(() => expect(navigateSpy).toHaveBeenCalledWith('/users'));
  });

  // CONTROL: a clean form must leave immediately. If this also prompted, the guard would
  // be noise and users would learn to click through it.
  it('leaves without prompting when nothing changed', async () => {
    renderAt('/users/7/edit', '/users/:id/edit');
    await screen.findByDisplayValue('Ada');

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByText('Discard changes?')).not.toBeInTheDocument();
    expect(navigateSpy).toHaveBeenCalledWith('/users');
  });

  it('confirms before discarding unsaved edits', async () => {
    renderAt('/users/7/edit', '/users/:id/edit');
    const firstNameInput = await screen.findByDisplayValue('Ada');

    fireEvent.change(firstNameInput, { target: { value: 'Adalovelace' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(await screen.findByText('Discard changes?')).toBeInTheDocument();
    expect(navigateSpy).not.toHaveBeenCalled();
  });

  // CONTROL for the console shell: the back target must stay under the workspace route.
  // Navigating to /users would drop the org context and silently retarget the edit.
  it('returns into the workspace shell when embedded', async () => {
    renderAt('/console/workspace/42/users/7/edit', '/console/workspace/:orgId/users/:id/edit', true);
    await screen.findByDisplayValue('Ada');

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(navigateSpy).toHaveBeenCalledWith('/console/workspace/42');
  });

  it('does not render the app chrome when embedded', async () => {
    renderAt('/console/workspace/42/users/7/edit', '/console/workspace/:orgId/users/:id/edit', true);
    await screen.findByDisplayValue('Ada');

    expect(screen.queryByTestId('layout')).not.toBeInTheDocument();
  });

  it('reports a member that cannot be loaded instead of rendering an empty form', async () => {
    renderAt('/users/abc/edit', '/users/:id/edit');
    expect(await screen.findByText('That user id is not valid.')).toBeInTheDocument();
  });

  // IdP-owned fields (D2-01): a SCIM-managed member's role is set in the identity
  // provider, and an in-app save must not fight the derivation.
  it('locks the workspace role for a SCIM-managed member', async () => {
    fetchedUser = { ...baseUser, scimManaged: true };
    renderAt('/users/7/edit', '/users/:id/edit');
    await screen.findByDisplayValue('Ada');

    expect(await screen.findByText(/Managed by IdP \(SCIM\)/)).toBeInTheDocument();
  });

  it('CONTROL: a non-SCIM member keeps an editable role', async () => {
    renderAt('/users/7/edit', '/users/:id/edit');
    await screen.findByDisplayValue('Ada');

    expect(screen.queryByText(/Managed by IdP \(SCIM\)/)).not.toBeInTheDocument();
  });
});
