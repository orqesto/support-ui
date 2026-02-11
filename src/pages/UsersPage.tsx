/* eslint-disable no-console */
import { useEffect, useState, useCallback } from 'react';
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
} from 'lucide-react';
import { PermissionGuard } from '@/components/auth/PermissionGuard';
import { Layout } from '@/components/layout/Layout';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { SearchInput } from '@/components/ui/SearchInput';
import { usePermissions } from '@/hooks/usePermissions';
import { formatDate } from '@/lib/utils';
import { invitationService } from '@/services/invitation.service';
import { userService } from '@/services/user.service';
import { useAuthStore } from '@/stores/authStore';
import { useUsersStore } from '@/stores/usersStore';
import type { User } from '@/types';
import { Permission, roleDisplayNames } from '@/types/roles';
import { RoleInfoCard } from '@/components/admin/RoleInfoCard';
import { InviteUserModal } from '@/components/modals/InviteUserModal';
import { CreateUserModal } from '@/components/modals/CreateUserModal';
import { EditUserModal } from '@/components/modals/EditUserModal';

export const UsersPage = () => {
  const { canManageUsers, isAdmin, hasPermission } = usePermissions();
  const currentUser = useAuthStore((state) => state.user);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; user: User | null }>({
    open: false,
    user: null,
  });

  // Alert dialog state
  const [alertDialog, setAlertDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    variant: 'success' | 'error' | 'warning' | 'info';
  }>({ open: false, title: '', description: '', variant: 'info' });

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
        console.error('Failed to fetch users:', error);
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
        console.error('Failed to fetch users:', error);
      });
    }
  }, [canViewUsers, fetchUsers]);

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
      console.error('Failed to fetch users:', error);
    });
  };

  const handleInviteUser = async (
    email: string,
    role: string,
    departmentRole: string,
    organizationId: number
  ) => {
    await invitationService.invite(email, role, departmentRole, organizationId);
    // Optionally refresh users list or show a success message
  };

  const handleCreateUser = async (data: {
    email: string;
    password: string;
    firstName: string;
    lastName?: string;
    position?: string;
    role?: 'admin' | 'user';
    organizationRole: 'org_admin' | 'moderator' | 'support' | 'associate';
    departmentRole: 'support' | 'sales' | 'billing' | 'general' | 'hr';
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

  const handleEditUser = (user: User) => {
    setSelectedUser(user);
    setIsEditModalOpen(true);
  };

  // Check if current user can edit/delete a specific user
  const canManageUser = (user: User) => {
    // Users can always edit their own profile
    if (currentUser && user.id === currentUser.id) {
      return true;
    }

    // Global admin can manage everyone
    if (isAdmin) {
      return true;
    }

    // Org admin cannot manage global admins
    if (user.role === 'admin') {
      return false;
    }

    // Org admin can manage other users in their organization
    return canManageUsers;
  };

  const handleDeleteUser = (user: User) => {
    console.log('🗑️ Opening delete dialog for:', user.email);
    setDeleteDialog({ open: true, user });
  };

  const confirmDeleteUser = async () => {
    if (!deleteDialog.user) {
      return;
    }

    console.log('User confirmed deletion, calling API...');
    try {
      await userService.delete(deleteDialog.user.id);
      console.log('✅ User deleted successfully');
      setDeleteDialog({ open: false, user: null });
      // Refresh users list
      await fetchUsers();
    } catch (error) {
      console.error('❌ Failed to delete user:', error);
      setAlertDialog({
        open: true,
        title: 'Delete Failed',
        description: 'Failed to delete user. Please try again.',
        variant: 'error',
      });
      setDeleteDialog({ open: false, user: null });
    }
  };

  const canDeleteUser = (user: User) => {
    // Debug logging
    console.log('canDeleteUser check:', {
      targetUser: { id: user.id, email: user.email, role: user.role },
      currentUser: { id: currentUser?.id, email: currentUser?.email, role: currentUser?.role },
      isAdmin,
      canManageUsers,
      hasDeletePermission: hasPermission(Permission.DELETE_USERS),
    });

    // Cannot delete yourself
    if (currentUser && user.id === currentUser.id) {
      console.log('Cannot delete yourself');
      return false;
    }

    // Check if user has delete permission
    if (!hasPermission(Permission.DELETE_USERS)) {
      console.log('No DELETE_USERS permission');
      return false;
    }

    // Global admin can delete anyone
    if (isAdmin) {
      console.log('Global admin - can delete');
      return true;
    }

    // Org admin cannot delete global admins
    if (user.role === 'admin') {
      console.log('Target is global admin - cannot delete');
      return false;
    }

    // Org admin can delete other users in their organization
    console.log('Org admin check, canManageUsers:', canManageUsers);
    return canManageUsers;
  };

  const handleUpdateUser = async (userId: number, data: Partial<User>) => {
    await userService.update(userId, data);
    // Refresh users list
    await fetchUsers();
  };

  if (!canViewUsers) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center min-h-[60vh]">
          <Shield className="mb-4 w-16 h-16 text-gray-400" />
          <h2 className="mb-2 text-2xl font-bold">Access Denied</h2>
          <p className="max-w-md text-center text-muted-foreground">
            You don&apos;t have permission to manage users. Please contact your organization
            administrator.
          </p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="px-4 mx-auto space-y-4 w-full max-w-7xl">
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
          <button
            onClick={() => setShowRoleInfo(!showRoleInfo)}
            className="p-4 w-full text-left transition-colors hover:bg-blue-100/50 dark:hover:bg-blue-900/20"
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
              {showRoleInfo ? 'Hide' : 'View'} detailed permissions for each organization role
            </p>
          </button>
          {showRoleInfo && (
            <div className="px-4 pb-4 space-y-4">
              <RoleInfoCard />
            </div>
          )}
        </Card>

        {/* Search */}
        <SearchInput
          value={pendingSearch}
          onChange={setPendingSearch}
          onSearch={handleSearch}
          onBlur={handleSearchBlur}
          showSearchButton={true}
          placeholder="Search by ID, name, email, position..."
          className="w-full"
          size="sm"
        />

        {/* Users Table */}
        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-8 text-center">
                <div className="mx-auto mb-4 w-12 h-12 rounded-full border-b-2 animate-spin border-primary" />
                <p className="text-muted-foreground">Loading users...</p>
              </div>
            ) : users.length === 0 ? (
              <div className="p-8 text-center">
                <Users className="mx-auto mb-4 w-16 h-16 text-gray-400" />
                <h3 className="mb-2 text-lg font-semibold">No Users Found</h3>
                <p className="text-muted-foreground">No users in the organization yet.</p>
              </div>
            ) : (
              <>
                {/* Mobile/Tablet Card View - Default up to XL */}
                <div className="xl:hidden">
                  <div className="divide-y divide-border overflow-auto max-h-[600px]">
                    {users.map((user) => (
                      <div key={user.id} className="p-4 transition-colors hover:bg-accent">
                        <div className="flex gap-3 items-start">
                          <div className="flex flex-shrink-0 justify-center items-center w-12 h-12 text-sm font-medium rounded-full bg-primary text-primary-foreground">
                            {user.firstName?.charAt(0).toUpperCase()}
                            {user.lastName?.charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex gap-2 justify-between items-start mb-2">
                              <div className="flex-1 min-w-0">
                                <h3 className="text-sm font-semibold truncate">
                                  {user.firstName} {user.lastName}
                                </h3>
                                <p className="text-sm truncate text-muted-foreground">
                                  {user.email}
                                </p>
                              </div>
                              <div className="flex gap-2">
                                {canManageUser(user) && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="flex-shrink-0"
                                    onClick={() => handleEditUser(user)}
                                  >
                                    <Edit2 className="w-4 h-4" />
                                  </Button>
                                )}
                                {canDeleteUser(user) && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="flex-shrink-0 text-red-600 hover:text-red-700 hover:border-red-300"
                                    onClick={() => handleDeleteUser(user)}
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
                                  <Badge variant="secondary">
                                    {roleDisplayNames[user.organizationRole]}
                                  </Badge>
                                )}
                                {user.departmentRoles && user.departmentRoles.length > 0 && (
                                  <>
                                    {user.departmentRoles.map((dept) => (
                                      <Badge
                                        key={dept}
                                        className="text-xs text-blue-700 bg-blue-100 dark:bg-blue-900 dark:text-blue-300"
                                      >
                                        {dept.charAt(0).toUpperCase() + dept.slice(1)}
                                      </Badge>
                                    ))}
                                  </>
                                )}
                              </div>
                              <div className="flex flex-col gap-1 text-xs text-gray-500">
                                {user.position && (
                                  <div>
                                    <span className="font-medium">Position:</span> {user.position}
                                  </div>
                                )}
                                <div>
                                  <span className="font-medium">Joined:</span>{' '}
                                  {formatDate(user.createdAt)}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Desktop Table View - Only on XL+ screens */}
                <div className="hidden xl:block">
                  <div className="overflow-auto max-h-[600px]">
                    <table className="w-full table-auto">
                      <thead className="sticky top-0 z-10 border-b bg-muted border-border">
                        <tr>
                          <th className="px-4 py-3 text-xs font-medium tracking-wider text-left uppercase text-muted-foreground">
                            User
                          </th>
                          <th className="px-4 py-3 text-xs font-medium tracking-wider text-left uppercase text-muted-foreground">
                            Role
                          </th>
                          <th className="px-4 py-3 text-xs font-medium tracking-wider text-left uppercase text-muted-foreground">
                            Org Role
                          </th>
                          <th className="px-4 py-3 text-xs font-medium tracking-wider text-left uppercase text-muted-foreground">
                            Departments
                          </th>
                          <th className="px-4 py-3 text-xs font-medium tracking-wider text-left uppercase text-muted-foreground">
                            Position
                          </th>
                          <th className="px-4 py-3 text-xs font-medium tracking-wider text-left uppercase text-muted-foreground">
                            Joined
                          </th>
                          <th className="px-4 py-3 text-xs font-medium tracking-wider text-right uppercase text-muted-foreground">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y bg-card divide-border">
                        {users.map((user) => (
                          <tr key={user.id} className="transition-colors hover:bg-accent">
                            <td className="px-4 py-3">
                              <div className="flex items-center min-w-0">
                                <div className="flex justify-center items-center w-10 h-10 text-sm font-medium rounded-full bg-primary text-primary-foreground">
                                  {user.firstName?.charAt(0).toUpperCase()}
                                  {user.lastName?.charAt(0).toUpperCase()}
                                </div>
                                <div className="flex-1 ml-3 min-w-0">
                                  <div className="text-sm font-medium truncate">
                                    {user.firstName} {user.lastName}
                                  </div>
                                  <div className="text-sm truncate text-muted-foreground">
                                    {user.email}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>
                                {roleDisplayNames[user.role]}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              {user.organizationRole ? (
                                <Badge variant="secondary">
                                  {roleDisplayNames[user.organizationRole]}
                                </Badge>
                              ) : (
                                <span className="text-sm text-gray-400">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              {user.departmentRoles && user.departmentRoles.length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                  {user.departmentRoles.map((dept) => (
                                    <Badge
                                      key={dept}
                                      className="text-xs text-blue-700 bg-blue-100 dark:bg-blue-900 dark:text-blue-300"
                                    >
                                      {dept.charAt(0).toUpperCase() + dept.slice(1)}
                                    </Badge>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-sm text-gray-400">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-500">
                              {user.position ?? '—'}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-500">
                              {formatDate(user.createdAt)}
                            </td>
                            <td className="px-4 py-3 text-sm font-medium text-right whitespace-nowrap">
                              <div className="flex gap-2 justify-end">
                                {canManageUser(user) && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleEditUser(user)}
                                  >
                                    <Edit2 className="w-4 h-4" />
                                  </Button>
                                )}
                                {canDeleteUser(user) && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleDeleteUser(user)}
                                    className="text-red-600 hover:text-red-700 hover:border-red-300"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                )}
                                {!canManageUser(user) && !canDeleteUser(user) && (
                                  <span className="text-sm text-gray-400">—</span>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Role Reference Card */}
        <Card>
          <CardContent className="p-6">
            <h3 className="mb-4 text-lg font-semibold">Available Roles</h3>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="p-4 rounded-lg border">
                <div className="flex gap-2 items-center mb-2">
                  <Badge variant="default">org_admin</Badge>
                </div>
                <p className="mb-1 text-sm font-medium">{roleDisplayNames.org_admin}</p>
                <p className="text-xs text-muted-foreground">
                  Full control within organization. Can manage users, settings, and all resources.
                </p>
              </div>
              <div className="p-4 rounded-lg border">
                <div className="flex gap-2 items-center mb-2">
                  <Badge variant="secondary">moderator</Badge>
                </div>
                <p className="mb-1 text-sm font-medium">{roleDisplayNames.moderator}</p>
                <p className="text-xs text-muted-foreground">
                  Manages integrations, categories, AI settings, tickets, and messages.
                </p>
              </div>
              <div className="p-4 rounded-lg border">
                <div className="flex gap-2 items-center mb-2">
                  <Badge variant="secondary">support</Badge>
                </div>
                <p className="mb-1 text-sm font-medium">{roleDisplayNames.support}</p>
                <p className="text-xs text-muted-foreground">
                  Can manage tickets and messages, view statistics. No access to settings.
                </p>
              </div>
              <div className="p-4 rounded-lg border">
                <div className="flex gap-2 items-center mb-2">
                  <Badge variant="secondary">associate</Badge>
                </div>
                <p className="mb-1 text-sm font-medium">{roleDisplayNames.associate}</p>
                <p className="text-xs text-muted-foreground">
                  Read-only access. Can view tickets and messages, request changes.
                </p>
              </div>
              <div className="p-4 rounded-lg border">
                <div className="flex gap-2 items-center mb-2">
                  <Badge variant="secondary">associate</Badge>
                </div>
                <p className="mb-1 text-sm font-medium">{roleDisplayNames.associate}</p>
                <p className="text-xs text-muted-foreground">
                  View-only access to tickets and messages with ability to request changes.
                </p>
              </div>
            </div>
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

      {/* Edit User Modal */}
      <EditUserModal
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setSelectedUser(null);
        }}
        onUpdate={handleUpdateUser}
        user={selectedUser}
        allUsers={users}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={deleteDialog.open}
        onOpenChange={(open) => setDeleteDialog({ open, user: null })}
        onConfirm={confirmDeleteUser}
        title="Delete User"
        description={
          deleteDialog.user
            ? `Are you sure you want to delete ${deleteDialog.user.firstName} ${deleteDialog.user.lastName}? This action cannot be undone.`
            : ''
        }
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
      />

      {/* Alert Dialog */}
      <AlertDialog
        open={alertDialog.open}
        onOpenChange={(open) => setAlertDialog({ ...alertDialog, open })}
        title={alertDialog.title}
        description={alertDialog.description}
        variant={alertDialog.variant}
      />
    </Layout>
  );
};
