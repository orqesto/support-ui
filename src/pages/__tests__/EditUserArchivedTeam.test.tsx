/**
 * A member still on a switched-off (archived) team.
 *
 * The team checklist offers live teams only, but the member's `departmentIds` still names the
 * archived one. PUT /api/users/:id refuses any team set that names an archived team (400
 * "Archived team(s) cannot be assigned: …"), and REPLACES the manual layer with what is sent.
 * The page used to post the hidden id with every team change, so Save failed with nothing on
 * the page. Now: the archived team is named on the page, a changed set leaves it out (which the
 * notice says takes the member off it), an untouched set is not sent (the membership stays),
 * and a refused save shows the server's sentence by the Save button. Invented data.
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

const DEPT_SUPPORT = 2;
const DEPT_SALES = 3;
const DEPT_OLD = 9;

const baseUser = {
  id: 7,
  email: 'ada@example.com',
  firstName: 'Ada',
  lastName: 'Lovelace',
  position: null,
  role: 'user' as const,
  organizationRole: 'support' as const,
  organizationId: 3,
  departmentIds: [DEPT_SUPPORT, DEPT_OLD],
  provisionedDepartmentIds: [] as number[],
  permissionOverrides: {},
  scimManaged: false,
};
let fetchedUser = { ...baseUser };

const updateSpy = vi.fn<(...args: unknown[]) => Promise<unknown>>();
vi.mock('@/services/user.service', () => ({
  userService: {
    getById: () => Promise.resolve(fetchedUser),
    getAll: () => Promise.resolve({ data: [], pagination: {} }),
    update: (...args: unknown[]) => updateSpy(...args),
    getSkillValues: () => Promise.resolve({}),
    getCanEditSkills: () => Promise.resolve(false),
    setSkillValues: () => Promise.resolve(),
    setCanEditSkills: () => Promise.resolve(),
  },
}));

// Honours `includeInactive` as the server does: the archived team only when asked for.
vi.mock('@/services/department.service', () => ({
  departmentService: {
    getAll: (includeInactive = false, onTeamsMode?: (value: boolean) => void) => {
      onTeamsMode?.(true);
      const live = [
        { id: DEPT_SUPPORT, name: 'Support Desk', slug: 'support', active: true, hasMessageSource: true },
        { id: DEPT_SALES, name: 'Sales Desk', slug: 'sales', active: true, hasMessageSource: true },
      ];
      const archived = [{ id: DEPT_OLD, name: 'Old Desk', slug: 'old', active: false }];
      return Promise.resolve(includeInactive ? [...live, ...archived] : live);
    },
  },
}));
vi.mock('@/services/organization.service', () => ({
  organizationService: {
    getAll: () => Promise.resolve({ data: [] }),
    getRoutingKeys: () => Promise.resolve([]),
    removeMember: () => Promise.resolve(),
    addMember: () => Promise.resolve(),
  },
}));
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector: (state: { user: { id: number } }) => unknown) =>
    selector({ user: { id: 1 } }),
}));
vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ isAdmin: false, canManageUsers: true, hasPermission: () => false }),
}));
vi.mock('@/components/layout/Layout', () => ({
  Layout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const renderPage = () =>
  render(
    <ThemeProvider>
      <MemoryRouter initialEntries={['/users/7/edit']}>
        <Routes>
          <Route path="/users/:id/edit" element={<EditUserPage />} />
        </Routes>
      </MemoryRouter>
    </ThemeProvider>
  );

const checkboxFor = (name: string): HTMLInputElement => {
  const label = screen.getByText(name).closest('label');
  const input = label?.querySelector('input[type="checkbox"]');
  if (!input) throw new Error(`no checkbox for "${name}"`);
  return input as HTMLInputElement;
};

/** The seed has landed: the member's live team is ticked. */
const seeded = async () => {
  await screen.findByText('Support Desk');
  await waitFor(() => expect(checkboxFor('Support Desk').checked).toBe(true));
};

const save = async () => {
  fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
  await waitFor(() => expect(updateSpy).toHaveBeenCalled());
  return updateSpy.mock.calls[0][1] as Record<string, unknown>;
};

beforeEach(() => {
  fetchedUser = { ...baseUser };
  navigateSpy.mockReset();
  updateSpy.mockReset();
  updateSpy.mockResolvedValue({});
});
afterEach(cleanup);

describe('Edit member › still on a switched-off team', () => {
  it('names the switched-off team and says a team change takes the member off it', async () => {
    renderPage();
    await seeded();
    const notice = await screen.findByRole('status', { name: 'Switched-off teams' });
    expect(notice).toHaveTextContent('Old Desk');
    expect(notice).toHaveTextContent(/changing this member.s teams takes them off it/);
  });

  it('a team change never posts the switched-off team (the server refuses it)', async () => {
    renderPage();
    await seeded();
    fireEvent.click(checkboxFor('Sales Desk'));
    await waitFor(() => expect(checkboxFor('Sales Desk').checked).toBe(true));
    const payload = await save();
    expect(payload.departmentIds).toEqual([DEPT_SUPPORT, DEPT_SALES]);
  });

  it('CONTROL — an untouched team field sends no departmentIds, so the membership is kept', async () => {
    renderPage();
    await seeded();
    fireEvent.change(screen.getByDisplayValue('Ada'), { target: { value: 'Adah' } });
    const payload = await save();
    expect(payload.firstName).toBe('Adah');
    expect(payload.departmentIds).toBeUndefined();
  });

  it('"Take off switched-off team" posts the live teams alone', async () => {
    renderPage();
    await seeded();
    fireEvent.click(await screen.findByRole('button', { name: 'Take off switched-off team' }));
    await waitFor(() =>
      expect(screen.queryByRole('status', { name: 'Switched-off teams' })).not.toBeInTheDocument()
    );
    const payload = await save();
    expect(payload.departmentIds).toEqual([DEPT_SUPPORT]);
  });

  it('the last live team cannot be unticked (the archived one does not count as a team)', async () => {
    renderPage();
    await seeded();
    fireEvent.click(checkboxFor('Support Desk'));
    expect(checkboxFor('Support Desk').checked).toBe(true);
  });

  it('a refused save shows the server sentence by the Save button and stays on the page', async () => {
    const sentence =
      'Archived team(s) cannot be assigned: Old Desk (#9). Restore the team, or assign the one its work was merged into.';
    updateSpy.mockRejectedValue({ response: { status: 400, data: { success: false, error: sentence } } });
    renderPage();
    await seeded();
    fireEvent.change(screen.getByDisplayValue('Ada'), { target: { value: 'Adah' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(`Not saved: ${sentence}`);
    expect(navigateSpy).not.toHaveBeenCalled();
  });

  it('CONTROL — a member on live teams only sees no switched-off notice', async () => {
    fetchedUser = { ...baseUser, departmentIds: [DEPT_SUPPORT] };
    renderPage();
    await seeded();
    expect(screen.queryByRole('status', { name: 'Switched-off teams' })).not.toBeInTheDocument();
  });
});
