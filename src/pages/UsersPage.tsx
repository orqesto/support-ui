import { Fragment, useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { logger } from '@/lib/logger';
import {
  Users,
  Edit2,
  Shield,
  RefreshCw,
  Mail,
  UserPlus,
  Trash2,
  Info,
  ChevronDown,
  ChevronUp,
  Tag,
  Lock,
  ShieldAlert,
} from 'lucide-react';
import { PermissionGuard } from '@/components/auth/PermissionGuard';
import { Layout } from '@/components/layout/Layout';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DataTable, type ColumnDef } from '@/components/ui/DataTable';
import { usePermissions } from '@/hooks/usePermissions';
import { formatDate } from '@/lib/utils';
import { departmentService, type Department } from '@/services/department.service';
import { invitationService } from '@/services/invitation.service';
import { userService } from '@/services/user.service';
import { useAuthStore } from '@/stores/authStore';
import { useUsersStore } from '@/stores/usersStore';
import type { User } from '@/types';
import { Permission, roleDisplayNames } from '@/types/roles';
import type { OrganizationRole } from '@/types/roles';
import { getUserRowCapabilities } from '@/utils/userListCapabilities';
import { Tooltip } from '@/components/ui/Tooltip';
import { RoleInfoCard } from '@/components/admin/RoleInfoCard';
import { InviteUserModal } from '@/components/modals/InviteUserModal';
import { CreateUserModal } from '@/components/modals/CreateUserModal';
import { UserSkillsModal } from '@/components/modals/UserSkillsModal';

/** Match the console tables' page size so every user/workspace list paginates identically. */
const PAGE_SIZE = 25;

export const UsersPage = ({ embedded = false }: { embedded?: boolean } = {}) => {
  // When embedded in the WorkspaceShell (which supplies its own chrome), render
  // straight into it via a Fragment; standalone, wrap in the org-scoped Layout.
  const Wrap = embedded ? Fragment : Layout;
  const navigate = useNavigate();
  const { orgId } = useParams<{ orgId: string }>();
  const { canManageUsers, isAdmin, hasPermission } = usePermissions();
  const currentUser = useAuthStore((state) => state.user);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; user: User | null }>({
    open: false,
    user: null,
  });
  const [skillsUser, setSkillsUser] = useState<User | null>(null);

  // Alert dialog state
  const [alertDialog, setAlertDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    variant: 'success' | 'error' | 'warning' | 'info';
  }>({ open: false, title: '', description: '', variant: 'info' });

  const [departments, setDepartments] = useState<Department[]>([]);

  // Use users store
  const usersFromStore = useUsersStore((state) => state.users);
  const users = Array.isArray(usersFromStore) ? usersFromStore : [];
  const searchUser = useUsersStore((state) => state.searchQuery);
  const setSearchUser = useUsersStore((state) => state.setSearchQuery);
  const setUsers = useUsersStore((state) => state.setUsers);

  // Local pending search state
  const [pendingSearch, setPendingSearch] = useState(searchUser || '');
  const [showRoleInfo, setShowRoleInfo] = useState(false);

  const fetchUsers = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      try {
        const result = await userService.getAll(searchUser || undefined);
        setUsers(result.data); // Service returns { data: User[], pagination }
      } catch (error) {
        logger.error('Failed to fetch users:', error);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [searchUser, setUsers]
  );

  const canViewUsers = hasPermission(Permission.VIEW_USERS);

  useEffect(() => {
    if (canViewUsers) {
      fetchUsers().catch((error) => {
        logger.error('Failed to fetch users:', error);
      });
      departmentService
        .getAll()
        .then(setDepartments)
        .catch(() => setDepartments([]));
    }
  }, [canViewUsers, fetchUsers]);

  const deptNameById = (id: number) => {
    const found = departments.find((dep) => dep.id === id);
    return found?.name ?? `Department ${id}`;
  };

  const handleSearch = () => {
    // Trigger actual search when button clicked or Enter pressed
    setSearchUser(pendingSearch);
  };

  const handleSearchBlur = () => {
    // If search is empty on blur, clear the search filter to show all data
    if (!pendingSearch.trim() && searchUser) {
      setSearchUser('');
    }
  };

  const handleRefresh = () => {
    fetchUsers(true).catch((error) => {
      logger.error('Failed to fetch users:', error);
    });
  };

  const handleInviteUser = async (
    email: string,
    role: OrganizationRole,
    departmentIds: number[],
    organizationId: number,
    senderIntegrationId?: number
  ) => {
    await invitationService.invite(email, role, departmentIds, organizationId, senderIntegrationId);
    // Optionally refresh users list or show a success message
  };

  const handleCreateUser = async (data: {
    email: string;
    password: string;
    firstName: string;
    lastName?: string;
    position?: string;
    role?: 'admin' | 'user';
    organizationRole: OrganizationRole;
    departmentIds: number[];
  }) => {
    await userService.create(data);
    await fetchUsers();
    setAlertDialog({
      open: true,
      title: 'User Created',
      description: `User ${data.email} has been created successfully.`,
      variant: 'success',
    });
  };

  // Editing is a page — the form covers profile, role, departments, permission overrides
  // and routing skills, which outgrew a dialog. Inside the per-workspace console shell it
  // must stay under /console/workspace/:orgId, or the edit would leave the org context
  // WorkspaceShell established and act on the caller's home workspace instead.
  const handleEditUser = (user: User) => {
    navigate(
      embedded && orgId
        ? `/console/workspace/${orgId}/users/${user.id}/edit`
        : `/users/${user.id}/edit`
    );
  };

  // Who can edit/remove a given row — delegated to the shared capability model so the
  // workspace and platform surfaces reason about authority the same way (see
  // utils/userListCapabilities; "remove" here is membership-scoped per §5).
  const rowCapabilities = (user: User) =>
    getUserRowCapabilities(
      'workspace',
      {
        userId: currentUser?.id,
        isGlobalAdmin: isAdmin,
        canManageUsers,
        canDeleteUsers: hasPermission(Permission.DELETE_USERS),
      },
      { userId: user.id, globalRole: user.role, scimManaged: user.scimManaged }
    );

  const canManageUser = (user: User) => rowCapabilities(user).canEdit;

  const handleDeleteUser = (user: User) => {
    setDeleteDialog({ open: true, user });
  };

  const confirmDeleteUser = async () => {
    if (!deleteDialog.user) {
      return;
    }

    try {
      await userService.delete(deleteDialog.user.id);
      setDeleteDialog({ open: false, user: null });
      // Refresh users list
      await fetchUsers();
    } catch (error) {
      logger.error('❌ Failed to delete user:', error);
      setAlertDialog({
        open: true,
        title: 'Delete Failed',
        description: 'Failed to delete user. Please try again.',
        variant: 'error',
      });
      setDeleteDialog({ open: false, user: null });
    }
  };

  const canDeleteUser = (user: User) => rowCapabilities(user).canRemove;

  if (!canViewUsers) {
    return (
      <Wrap>
        <div className="flex flex-col items-center justify-center min-h-[60vh]">
          <Shield className="mb-4 w-16 h-16 text-gray-400" />
          <h2 className="mb-2 text-2xl font-bold">Access Denied</h2>
          <p className="max-w-md text-center text-muted-foreground">
            You don&apos;t have permission to manage users. Please contact your workspace
            administrator.
          </p>
        </div>
      </Wrap>
    );
  }

  // Delete/remove copy is scope-accurate (see utils/userListCapabilities + the BE
  // userController.deleteUser): an org admin removes only this workspace's membership
  // (the account and any other workspace access are kept), while a global admin deletes
  // the whole account across every workspace. Label the dialog to match what will happen.
  const deleteIsAccount = deleteDialog.user
    ? rowCapabilities(deleteDialog.user).removeKind === 'account'
    : false;
  const deleteName = deleteDialog.user
    ? `${deleteDialog.user.firstName} ${deleteDialog.user.lastName}`.trim()
    : 'this user';

  const initials = (user: User) =>
    `${user.firstName?.charAt(0) ?? ''}${user.lastName?.charAt(0) ?? ''}`.toUpperCase();

  const deptBadges = (user: User) =>
    user.departmentIds?.map((deptId) => (
      <Badge
        key={deptId}
        className="text-xs text-blue-700 bg-blue-100 dark:bg-blue-900 dark:text-blue-300"
      >
        {deptNameById(deptId)}
      </Badge>
    )) ?? null;

  const scimBadge = (user: User) =>
    user.scimManaged ? (
      <Badge className="flex gap-1 items-center text-xs text-amber-700 bg-amber-100 dark:bg-amber-900 dark:text-amber-300">
        <Lock className="w-3 h-3" />
        IdP-managed
      </Badge>
    ) : null;

  /**
   * A platform admin cannot be provisioned by SCIM at all (the connector refuses to take over
   * a platform-admin account), and nothing said so until the IdP had already failed. One
   * customer pushed the same account 39 times over 17 days before anyone connected the two.
   *
   * ⛔ Shown only to a global admin: it names a platform-wide tier and a remedy only they can
   * apply, and to everyone else it is an unexplained warning about someone else's account.
   */
  const idpBlockedBadge = (user: User) =>
    isAdmin && user.role === 'admin' ? (
      <Tooltip content="Your identity provider cannot provision or manage this account while it is a platform administrator. Change their platform role to User in the platform console to let SCIM manage them.">
        <Badge variant="secondary" className="flex gap-1 items-center text-xs">
          <ShieldAlert className="w-3 h-3" />
          Not IdP-manageable
        </Badge>
      </Tooltip>
    ) : null;

  // Desktop columns (< xl falls back to the mobile card list below via renderCard).
  const columns: ColumnDef<User>[] = [
    {
      id: 'user',
      header: 'User',
      cell: (user) => (
        <div className="flex items-center min-w-0">
          <div className="flex justify-center items-center w-10 h-10 text-sm font-medium rounded-full bg-primary text-primary-foreground">
            {initials(user)}
          </div>
          <div className="flex-1 ml-3 min-w-0">
            <div className="text-sm font-medium truncate">
              {user.firstName} {user.lastName}
            </div>
            <div className="text-sm truncate text-muted-foreground">{user.email}</div>
          </div>
        </div>
      ),
    },
    {
      id: 'role',
      header: 'Role',
      cell: (user) => (
        <Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>
          {roleDisplayNames[user.role]}
        </Badge>
      ),
    },
    {
      id: 'orgRole',
      header: 'Org Role',
      cell: (user) => (
        <div className="flex flex-wrap gap-1 items-center">
          {user.organizationRole ? (
            <Badge variant="secondary">{roleDisplayNames[user.organizationRole]}</Badge>
          ) : (
            <span className="text-sm text-gray-400">—</span>
          )}
          {scimBadge(user)}
          {idpBlockedBadge(user)}
        </div>
      ),
    },
    {
      id: 'departments',
      header: 'Departments',
      cell: (user) =>
        user.departmentIds && user.departmentIds.length > 0 ? (
          <div className="flex flex-wrap gap-1">{deptBadges(user)}</div>
        ) : (
          <span className="text-sm text-gray-400">—</span>
        ),
    },
    {
      id: 'position',
      header: 'Position',
      cell: (user) => <span className="text-sm text-gray-500">{user.position ?? '—'}</span>,
    },
    {
      id: 'joined',
      header: 'Joined',
      cell: (user) => <span className="text-sm text-gray-500">{formatDate(user.createdAt)}</span>,
    },
    {
      id: 'skills',
      header: 'Skills',
      cell: (user) => (
        <Button
          size="sm"
          variant="outline"
          onClick={() => setSkillsUser(user)}
          title="Manage skills"
          aria-label="Manage skills"
        >
          <Tag className="w-4 h-4" />
        </Button>
      ),
    },
  ];

  const rowActions = (user: User) => {
    const caps = rowCapabilities(user);
    const canEdit = caps.canEdit;
    const canRemove = caps.canRemove;
    // A blocked Remove still renders — as a disabled control that says why. Omitting it is
    // what made the rule invisible: the backend's 409 explains the remedy and never reaches
    // anyone, because no request is ever made.
    const blockedReason = caps.removeBlockedReason;
    if (!canEdit && !canRemove && !blockedReason) {
      return <span className="text-sm text-gray-400">—</span>;
    }
    return (
      <div className="flex gap-2 justify-end">
        {canEdit && (
          <Button
            aria-label="Edit user"
            title="Edit user"
            size="sm"
            variant="outline"
            onClick={() => handleEditUser(user)}
          >
            <Edit2 className="w-4 h-4" />
          </Button>
        )}
        {canRemove && (
          <Button
            aria-label="Delete user"
            title="Delete user"
            size="sm"
            variant="outline"
            onClick={() => handleDeleteUser(user)}
            className="text-red-600 hover:text-red-700 hover:border-red-300"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        )}
        {!canRemove && blockedReason && (
          <Tooltip content={blockedReason}>
            {/*
              `aria-disabled`, not `disabled`: a disabled button swallows pointer events in
              every browser, so the tooltip explaining it would never open — the button would
              be present and still say nothing. `title` covers the touch case.
            */}
            <Button
              aria-label="Delete user — managed by your identity provider"
              aria-disabled
              title={blockedReason}
              size="sm"
              variant="outline"
              onClick={(event) => event.preventDefault()}
              className="opacity-50 cursor-not-allowed"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </Tooltip>
        )}
      </div>
    );
  };

  // Mobile (< xl) card — DataTable stacks one per row (divide-y). Mirrors the desktop columns
  // but folds Skills into the action group, as the previous responsive layout did.
  const renderUserCard = (user: User) => (
    <div className="p-4 transition-colors hover:bg-accent">
      <div className="flex gap-3 items-start">
        <div className="flex flex-shrink-0 justify-center items-center w-12 h-12 text-sm font-medium rounded-full bg-primary text-primary-foreground">
          {initials(user)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex gap-2 justify-between items-start mb-2">
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold truncate">
                {user.firstName} {user.lastName}
              </h3>
              <p className="text-sm truncate text-muted-foreground">{user.email}</p>
            </div>
            <div className="flex gap-2">
              {canManageUser(user) && (
                <Button
                  aria-label="Edit user"
                  title="Edit user"
                  size="sm"
                  variant="outline"
                  className="flex-shrink-0"
                  onClick={() => handleEditUser(user)}
                >
                  <Edit2 className="w-4 h-4" />
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                className="flex-shrink-0"
                onClick={() => setSkillsUser(user)}
                title="Manage skills"
                aria-label="Manage skills"
              >
                <Tag className="w-4 h-4" />
              </Button>
              {canDeleteUser(user) && (
                <Button
                  aria-label="Delete user"
                  title="Delete user"
                  size="sm"
                  variant="outline"
                  className="flex-shrink-0 text-red-600 hover:text-red-700 hover:border-red-300"
                  onClick={() => handleDeleteUser(user)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
              {/* Same rule as the desktop row: blocked is shown and explained, never hidden. */}
              {!canDeleteUser(user) && rowCapabilities(user).removeBlockedReason && (
                <Button
                  aria-label="Delete user — managed by your identity provider"
                  aria-disabled
                  title={rowCapabilities(user).removeBlockedReason}
                  size="sm"
                  variant="outline"
                  className="flex-shrink-0 opacity-50 cursor-not-allowed"
                  onClick={(event) => event.preventDefault()}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              <Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>
                {roleDisplayNames[user.role]}
              </Badge>
              {user.organizationRole && (
                <Badge variant="secondary">{roleDisplayNames[user.organizationRole]}</Badge>
              )}
              {scimBadge(user)}
              {idpBlockedBadge(user)}
              {deptBadges(user)}
            </div>
            <div className="flex flex-col gap-1 text-xs text-gray-500">
              {user.position && (
                <div>
                  <span className="font-medium">Position:</span> {user.position}
                </div>
              )}
              <div>
                <span className="font-medium">Joined:</span> {formatDate(user.createdAt)}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <Wrap>
      <div className="px-4 mx-auto space-y-4 w-full">
        {/* Header */}
        <div className="flex flex-col gap-4 justify-between items-start mb-6 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-2xl font-bold">Users</h2>
            <p className="text-sm text-muted-foreground">
              {loading ? 'Loading...' : `${users.length} user${users.length !== 1 ? 's' : ''}`}
            </p>
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <Button
              onClick={handleRefresh}
              disabled={refreshing}
              variant="outline"
              className="flex-1 sm:flex-none"
            >
              <RefreshCw className={`mr-2 w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <PermissionGuard permission={Permission.CREATE_USERS}>
              <Button className="flex-1 sm:flex-none" onClick={() => setIsCreateModalOpen(true)}>
                <UserPlus className="mr-2 w-4 h-4" />
                Create User
              </Button>
              <Button
                className="flex-1 sm:flex-none"
                variant="outline"
                onClick={() => setIsInviteModalOpen(true)}
              >
                <Mail className="mr-2 w-4 h-4" />
                Invite User
              </Button>
            </PermissionGuard>
          </div>
        </div>

        {/* Role Information Panel */}
        <Card className="border-blue-200 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-950/20">
          <Button
            variant="ghost"
            onClick={() => setShowRoleInfo(!showRoleInfo)}
            className="block p-4 w-full h-auto text-left rounded-none hover:bg-blue-100/50 dark:hover:bg-blue-900/20"
          >
            <div className="flex justify-between items-center">
              <div className="flex gap-2 items-center">
                <Info className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                <h3 className="font-semibold text-blue-900 dark:text-blue-100">
                  Role Permissions Guide
                </h3>
              </div>
              {showRoleInfo ? (
                <ChevronUp className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              ) : (
                <ChevronDown className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              )}
            </div>
            <p className="mt-1 text-sm text-blue-700 dark:text-blue-300">
              {showRoleInfo ? 'Hide' : 'View'} detailed permissions for each workspace role
            </p>
          </Button>
          {showRoleInfo && (
            <div className="px-4 pb-4 space-y-4">
              <RoleInfoCard />
            </div>
          )}
        </Card>

        {/* Users Table */}
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            {loading ? (
              <div className="p-8 text-center">
                <div className="mx-auto mb-4 w-12 h-12 rounded-full border-b-2 animate-spin border-primary" />
                <p className="text-muted-foreground">Loading users...</p>
              </div>
            ) : (
              <DataTable
                rows={users}
                rowKey={(user) => user.id}
                columns={columns}
                actions={rowActions}
                renderCard={renderUserCard}
                search={{
                  value: pendingSearch,
                  onChange: setPendingSearch,
                  onCommit: handleSearch,
                  onBlur: handleSearchBlur,
                  showButton: true,
                  placeholder: 'Search by ID, name, email, position…',
                }}
                pagination={{ mode: 'client', pageSize: PAGE_SIZE }}
                resetPageKey={searchUser}
                empty={{
                  icon: Users,
                  message: 'No users in the workspace yet.',
                  filteredMessage: 'No users match your search.',
                }}
              />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Create User Modal */}
      <CreateUserModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreate={handleCreateUser}
      />

      {/* Invite User Modal */}
      <InviteUserModal
        isOpen={isInviteModalOpen}
        onClose={() => setIsInviteModalOpen(false)}
        onInvite={handleInviteUser}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={deleteDialog.open}
        onOpenChange={(open) => setDeleteDialog({ open, user: null })}
        onConfirm={confirmDeleteUser}
        title={deleteIsAccount ? 'Delete account' : 'Remove from workspace'}
        description={
          deleteIsAccount
            ? `Delete ${deleteName}? This permanently removes their account across ALL workspaces and cannot be undone.`
            : `Remove ${deleteName} from this workspace? Their account and any access to other workspaces are kept.`
        }
        confirmText={deleteIsAccount ? 'Delete account' : 'Remove'}
        cancelText="Cancel"
        variant={deleteIsAccount ? 'danger' : 'warning'}
      />

      {/* User Skills Modal */}
      <UserSkillsModal
        isOpen={skillsUser !== null}
        onClose={() => setSkillsUser(null)}
        user={skillsUser}
      />

      {/* Alert Dialog */}
      <AlertDialog
        open={alertDialog.open}
        onOpenChange={(open) => setAlertDialog({ ...alertDialog, open })}
        title={alertDialog.title}
        description={alertDialog.description}
        variant={alertDialog.variant}
      />
    </Wrap>
  );
};
