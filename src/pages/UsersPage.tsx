import { useEffect, useState } from 'react';
import { Layout } from '@/components/layout/Layout';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { usePermissions } from '@/hooks/usePermissions';
import { Permission, roleDisplayNames } from '@/types/roles';
import { PermissionGuard } from '@/components/auth/PermissionGuard';
import { userService } from '@/services/user.service';
import { invitationService } from '@/services/invitation.service';
import { InviteUserModal } from '@/components/InviteUserModal';
import { EditUserModal } from '@/components/EditUserModal';
import { formatDate } from '@/lib/utils';
import type { User } from '@/types';
import { Users, Edit2, Shield, RefreshCw, Mail } from 'lucide-react';

export const UsersPage = () => {
  const { canManageUsers } = usePermissions();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  const fetchUsers = async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const data = await userService.getAll();
      setUsers(data);
    } catch (error) {
      console.error('Failed to fetch users:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (canManageUsers) {
      fetchUsers();
    }
  }, [canManageUsers]);

  const handleRefresh = () => {
    fetchUsers(true);
  };

  const handleInviteUser = async (email: string, role: string, organizationId: number) => {
    await invitationService.invite(email, role, organizationId);
    // Optionally refresh users list or show a success message
  };

  const handleEditUser = (user: User) => {
    setSelectedUser(user);
    setIsEditModalOpen(true);
  };

  const handleUpdateUser = async (userId: number, data: Partial<User>) => {
    await userService.update(userId, data);
    // Refresh users list
    await fetchUsers();
  };

  if (!canManageUsers) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center min-h-[60vh]">
          <Shield className="mb-4 w-16 h-16 text-gray-400" />
          <h2 className="mb-2 text-2xl font-bold text-gray-900">Access Denied</h2>
          <p className="max-w-md text-center text-gray-600">
            You don't have permission to manage users. Please contact your organization
            administrator.
          </p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="mx-auto space-y-4 max-w-7xl">
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
              <Button className="flex-1 sm:flex-none" onClick={() => setIsInviteModalOpen(true)}>
                <Mail className="mr-2 w-4 h-4" />
                Invite User
              </Button>
            </PermissionGuard>
          </div>
        </div>

        {/* Users Table */}
        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-8 text-center">
                <div className="mx-auto mb-4 w-12 h-12 rounded-full border-b-2 animate-spin border-primary"></div>
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
                  <div className="divide-y divide-gray-200 overflow-auto max-h-[600px]">
                    {users.map((user) => (
                      <div key={user.id} className="p-4 hover:bg-gray-50">
                        <div className="flex gap-3 items-start">
                          <div className="flex flex-shrink-0 justify-center items-center w-12 h-12 text-sm font-medium rounded-full bg-primary text-primary-foreground">
                            {user.firstName?.charAt(0).toUpperCase()}
                            {user.lastName?.charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex gap-2 justify-between items-start mb-2">
                              <div className="flex-1 min-w-0">
                                <h3 className="text-sm font-semibold text-gray-900 truncate">
                                  {user.firstName} {user.lastName}
                                </h3>
                                <p className="text-sm text-gray-500 truncate">{user.email}</p>
                              </div>
                              <PermissionGuard permission={Permission.MANAGE_USERS}>
                                <Button size="sm" variant="outline" className="flex-shrink-0" onClick={() => handleEditUser(user)}>
                                  <Edit2 className="w-4 h-4" />
                                </Button>
                              </PermissionGuard>
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
                    <thead className="bg-gray-50 border-b sticky top-0 z-10">
                      <tr>
                        <th className="px-4 py-3 text-xs font-medium tracking-wider text-left text-gray-500 uppercase">
                          User
                        </th>
                        <th className="px-4 py-3 text-xs font-medium tracking-wider text-left text-gray-500 uppercase">
                          Role
                        </th>
                        <th className="px-4 py-3 text-xs font-medium tracking-wider text-left text-gray-500 uppercase">
                          Org Role
                        </th>
                        <th className="px-4 py-3 text-xs font-medium tracking-wider text-left text-gray-500 uppercase">
                          Position
                        </th>
                        <th className="px-4 py-3 text-xs font-medium tracking-wider text-left text-gray-500 uppercase">
                          Joined
                        </th>
                        <th className="px-4 py-3 text-xs font-medium tracking-wider text-right text-gray-500 uppercase">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {users.map((user) => (
                        <tr key={user.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <div className="flex items-center min-w-0">
                              <div className="flex justify-center items-center w-10 h-10 text-sm font-medium rounded-full bg-primary text-primary-foreground">
                                {user.firstName?.charAt(0).toUpperCase()}
                                {user.lastName?.charAt(0).toUpperCase()}
                              </div>
                              <div className="ml-3 min-w-0 flex-1">
                                <div className="text-sm font-medium text-gray-900 truncate">
                                  {user.firstName} {user.lastName}
                                </div>
                                <div className="text-sm text-gray-500 truncate">{user.email}</div>
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
                          <td className="px-4 py-3 text-sm text-gray-500">
                            {user.position || '—'}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500">
                            {formatDate(user.createdAt)}
                          </td>
                          <td className="px-4 py-3 text-sm font-medium text-right whitespace-nowrap">
                            <PermissionGuard permission={Permission.MANAGE_USERS}>
                              <Button size="sm" variant="outline" onClick={() => handleEditUser(user)}>
                                <Edit2 className="w-4 h-4" />
                              </Button>
                            </PermissionGuard>
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
                <p className="mt-2 text-xs text-orange-600">⚠️ Cannot create other org_admins</p>
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
                  <Badge variant="secondary">member</Badge>
                </div>
                <p className="mb-1 text-sm font-medium">{roleDisplayNames.member}</p>
                <p className="text-xs text-muted-foreground">
                  Basic organization member with read-only access to tickets and messages.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

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
    </Layout>
  );
};
