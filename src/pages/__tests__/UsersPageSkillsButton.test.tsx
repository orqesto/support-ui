/**
 * Setting other members' skills needs manage_users or manage_routing_rules on the backend. A
 * support agent (view_users only) saw the "Manage skills" button and got a dialog that failed to
 * load (staging 2026-11-03).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

type Perms = {
  canManageUsers: boolean;
  isAdmin: boolean;
  hasPermission: (perm: string) => boolean;
};
let perms: Perms;
vi.mock('@/hooks/usePermissions', () => ({ usePermissions: () => perms }));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn(), useParams: () => ({}) }));
vi.mock('@/services/user.service', () => ({
  userService: {
    getAllPages: () =>
      Promise.resolve({
        data: [
          {
            id: 7,
            email: 'agent@example.test',
            firstName: 'Ann',
            lastName: 'Agent',
            role: 'user',
            organizationRole: 'support',
            departmentIds: [],
            createdAt: '2026-11-01T00:00:00Z',
          },
        ],
        total: 1,
      }),
  },
}));
vi.mock('@/services/department.service', () => ({
  departmentService: { getAll: () => Promise.resolve([]) },
}));
vi.mock('@/services/invitation.service', () => ({ invitationService: {} }));
vi.mock('@/components/modals/UserSkillsModal', () => ({ UserSkillsModal: () => null }));
vi.mock('@/components/modals/InviteUserModal', () => ({ InviteUserModal: () => null }));
vi.mock('@/components/modals/CreateUserModal', () => ({ CreateUserModal: () => null }));
vi.mock('@/features/subscription/components/PlanOverLimitNote', () => ({
  PlanOverLimitNote: () => null,
}));
vi.mock('@/components/admin/RoleInfoCard', () => ({ RoleInfoCard: () => null }));
vi.mock('@/components/auth/PermissionGuard', () => ({ PermissionGuard: () => null }));

const { UsersPage } = await import('../UsersPage');

beforeEach(() => {
  perms = {
    canManageUsers: false,
    isAdmin: false,
    hasPermission: (perm) => perm === 'view_users',
  };
});
afterEach(cleanup);

describe('Users page: Manage skills button', () => {
  it('is not shown to a support agent (view_users only)', async () => {
    render(<UsersPage />);
    expect(await screen.findAllByText('agent@example.test')).not.toHaveLength(0);
    expect(screen.queryByRole('button', { name: 'Manage skills' })).toBeNull();
  });

  it('is shown to a moderator (manage_routing_rules)', async () => {
    perms = {
      canManageUsers: false,
      isAdmin: false,
      hasPermission: (perm) => perm === 'view_users' || perm === 'manage_routing_rules',
    };
    render(<UsersPage />);
    expect(await screen.findAllByRole('button', { name: 'Manage skills' })).not.toHaveLength(0);
  });

  it('is shown to a user manager (manage_users)', async () => {
    perms = { canManageUsers: true, isAdmin: false, hasPermission: (perm) => perm === 'view_users' };
    render(<UsersPage />);
    expect(await screen.findAllByRole('button', { name: 'Manage skills' })).not.toHaveLength(0);
  });
});
