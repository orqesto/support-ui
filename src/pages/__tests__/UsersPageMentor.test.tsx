/**
 * Mentors (1.1.330, owner): a workspace admin marks a member mentor in Settings → Members (the
 * console's per-workspace Members view is the same page). Marking never unassigns; the row says how
 * many open tickets the member still owns.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

type Perms = {
  canManageUsers: boolean;
  isAdmin: boolean;
  hasPermission: (perm: string) => boolean;
};
let perms: Perms;
vi.mock('@/hooks/usePermissions', () => ({ usePermissions: () => perms }));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn(), useParams: () => ({}) }));
let member: { isMentor?: boolean };
const setMentor = vi.fn();
/*
  The REAL user service reads the list (its old-backend normalising is what is under test); only
  the HTTP call is stood in for, with the backend's own shape. An older backend sends no isMentor.
*/
const usersResponse = () => ({
  data: {
    success: true,
    data: {
      users: [
        {
          id: 7,
          email: 'agent@example.test',
          firstName: 'Ann',
          lastName: 'Agent',
          role: 'user',
          organizationRole: 'support',
          departmentIds: [],
          createdAt: '2026-11-01T00:00:00Z',
          ...member,
        },
      ],
      pagination: { page: 1, limit: 100, total: 1, totalPages: 1, hasMore: false },
    },
  },
});
vi.mock('@/lib/api-client', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  apiClient: {
    get: (url: string) =>
      url.startsWith('/api/users?')
        ? Promise.resolve(usersResponse())
        : Promise.reject(new Error(`unexpected GET ${url}`)),
    patch: (url: string, body: { isMentor: boolean }) =>
      Promise.resolve({
        data: {
          success: true,
          data: setMentor(Number(url.split('/')[3]), body.isMentor) as unknown,
        },
      }),
  },
}));
vi.mock('@/services/department.service', () => ({
  departmentService: { getAll: () => Promise.resolve([]) },
}));
vi.mock('@/features/settings/services/invitation.service', () => ({ invitationService: {} }));
vi.mock('@/features/settings/components/modals/UserSkillsModal', () => ({
  UserSkillsModal: () => null,
}));
vi.mock('@/features/settings/components/modals/InviteUserModal', () => ({
  InviteUserModal: () => null,
}));
vi.mock('@/features/settings/components/modals/CreateUserModal', () => ({
  CreateUserModal: () => null,
}));
vi.mock('@/features/subscription/components/PlanOverLimitNote', () => ({
  PlanOverLimitNote: () => null,
}));
vi.mock('@/components/admin/RoleInfoCard', () => ({ RoleInfoCard: () => null }));
vi.mock('@/components/auth/PermissionGuard', () => ({ PermissionGuard: () => null }));
let workspaceSkills: Record<string, Record<string, string[]>> | null | undefined;
vi.mock('@/features/settings/hooks/useWorkspaceSkills', () => ({
  useWorkspaceSkills: () => ({
    skills: workspaceSkills,
    skillsOf: (userId: number) =>
      workspaceSkills === undefined || workspaceSkills === null
        ? workspaceSkills
        : (workspaceSkills[String(userId)] ?? {}),
    refresh: vi.fn(),
  }),
  sameSkillKey: (left: string, right: string) => left === right,
  sameSkillValue: (left: string, right: string) => left === right,
}));

const { UsersPage } = await import('../UsersPage');

const manager: Perms = {
  canManageUsers: true,
  isAdmin: false,
  hasPermission: (perm) => perm === 'view_users',
};
const switches = () => screen.queryAllByRole('switch', { name: 'Mentor: Ann Agent' });

beforeEach(() => {
  workspaceSkills = {};
  member = { isMentor: false };
  setMentor.mockReset();
  perms = manager;
});
afterEach(cleanup);

describe('Settings → Members: the mentor mark (1.1.330)', () => {
  it('an admin marks a member mentor; the row says how many open tickets they still own', async () => {
    setMentor.mockReturnValue({ isMentor: true, openAssigned: 3 });
    render(<UsersPage />);
    await screen.findAllByText('agent@example.test');
    expect(switches()[0]).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(switches()[0]);
    await waitFor(() => expect(setMentor).toHaveBeenCalledWith(7, true));
    expect((await screen.findAllByText('Has 3 open tickets')).length).toBeGreaterThan(0);
    expect(switches()[0]).toHaveAttribute('aria-checked', 'true');
  });

  it('control: no open tickets ⇒ no count line', async () => {
    setMentor.mockReturnValue({ isMentor: true, openAssigned: 0 });
    render(<UsersPage />);
    await screen.findAllByText('agent@example.test');
    fireEvent.click(switches()[0]);
    await waitFor(() => expect(switches()[0]).toHaveAttribute('aria-checked', 'true'));
    expect(screen.queryByText(/open ticket/)).toBeNull();
  });

  it('a failed save puts the switch back and says why', async () => {
    setMentor.mockImplementation(() => {
      throw new Error('Not allowed');
    });
    render(<UsersPage />);
    await screen.findAllByText('agent@example.test');
    fireEvent.click(switches()[0]);
    expect((await screen.findAllByText('Not allowed')).length).toBeGreaterThan(0);
    expect(switches()[0]).toHaveAttribute('aria-checked', 'false');
  });

  it('a moderator (manage_routing_rules) gets the switch — the can-edit-skills gate', async () => {
    perms = {
      canManageUsers: false,
      isAdmin: false,
      hasPermission: (perm) => perm === 'view_users' || perm === 'manage_routing_rules',
    };
    render(<UsersPage />);
    await screen.findAllByText('agent@example.test');
    expect(switches().length).toBeGreaterThan(0);
  });

  it('a support agent gets no switch, and sees a mentor marked', async () => {
    perms = {
      canManageUsers: false,
      isAdmin: false,
      hasPermission: (perm) => perm === 'view_users',
    };
    member = { isMentor: true };
    render(<UsersPage />);
    await screen.findAllByText('agent@example.test');
    expect(switches()).toHaveLength(0);
    expect(screen.getAllByText('Mentor').length).toBeGreaterThan(0);
  });

  it('an older backend (no isMentor on the rows) shows no Mentor column — its switch would 404 (F4)', async () => {
    member = {};
    render(<UsersPage />);
    await screen.findAllByText('agent@example.test');
    expect(switches()).toHaveLength(0);
    expect(screen.queryByRole('columnheader', { name: 'Mentor' })).toBeNull();
  });

  it('control: a backend that sends isMentor:false shows the column and the switch', async () => {
    render(<UsersPage />);
    await screen.findAllByText('agent@example.test');
    expect(switches().length).toBeGreaterThan(0);
    expect(screen.getByRole('columnheader', { name: 'Mentor' })).toBeInTheDocument();
  });

  it('control: a support agent sees no mark on a working agent', async () => {
    perms = {
      canManageUsers: false,
      isAdmin: false,
      hasPermission: (perm) => perm === 'view_users',
    };
    render(<UsersPage />);
    await screen.findAllByText('agent@example.test');
    // Only the column heading says Mentor.
    expect(screen.queryAllByText('Mentor').filter((el) => el.tagName !== 'TH')).toHaveLength(0);
  });
});
