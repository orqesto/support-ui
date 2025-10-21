import { useEffect, useState } from 'react';
import { Layout } from '@/components/layout/Layout';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { usePermissions } from '@/hooks/usePermissions';
import { Permission, roleDisplayNames } from '@/types/roles';
import { PermissionGuard } from '@/components/auth/PermissionGuard';
import { userService } from '@/services/user.service';
import { formatDate } from '@/lib/utils';
import type { User } from '@/types';
import { Users, Plus, Edit2, Shield, RefreshCw } from 'lucide-react';

export const UsersPage = () => {
  const { canManageUsers } = usePermissions();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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

  if (!canManageUsers) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center min-h-[60vh]">
          <Shield className="w-16 h-16 text-gray-400 mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h2>
          <p className="text-gray-600 text-center max-w-md">
            You don't have permission to manage users. Please contact your organization administrator.
          </p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex flex-col gap-4 justify-between items-start sm:flex-row sm:items-center mb-6">
          <div>
            <h2 className="text-2xl font-bold">Users</h2>
            <p className="text-sm text-muted-foreground">
              {loading ? 'Loading...' : `${users.length} user${users.length !== 1 ? 's' : ''}`}
            </p>
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <Button onClick={handleRefresh} disabled={refreshing} variant="outline" className="flex-1 sm:flex-none">
              <RefreshCw className={`mr-2 w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <PermissionGuard permission={Permission.CREATE_USERS}>
              <Button className="flex-1 sm:flex-none">
                <Plus className="mr-2 w-4 h-4" />
                Add User
              </Button>
            </PermissionGuard>
          </div>
        </div>

        {/* Users Table */}
        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-8 text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
                <p className="text-muted-foreground">Loading users...</p>
              </div>
            ) : users.length === 0 ? (
              <div className="p-8 text-center">
                <Users className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">No Users Found</h3>
                <p className="text-muted-foreground">
                  No users in the organization yet.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        User
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Role
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Org Role
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Position
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Joined
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {users.map((user) => (
                      <tr key={user.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className="h-10 w-10 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-sm font-medium">
                              {user.firstName?.charAt(0).toUpperCase()}
                              {user.lastName?.charAt(0).toUpperCase()}
                            </div>
                            <div className="ml-4">
                              <div className="text-sm font-medium text-gray-900">
                                {user.firstName} {user.lastName}
                              </div>
                              <div className="text-sm text-gray-500">{user.email}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>
                            {roleDisplayNames[user.role]}
                          </Badge>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {user.organizationRole ? (
                            <Badge variant="secondary">
                              {roleDisplayNames[user.organizationRole]}
                            </Badge>
                          ) : (
                            <span className="text-sm text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {user.position || '—'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {formatDate(user.createdAt)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <PermissionGuard permission={Permission.MANAGE_USERS}>
                            <Button size="sm" variant="outline">
                              <Edit2 className="w-4 h-4" />
                            </Button>
                          </PermissionGuard>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Role Reference Card */}
        <Card>
          <CardContent className="p-6">
            <h3 className="text-lg font-semibold mb-4">Available Roles</h3>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="p-4 border rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="default">org_admin</Badge>
                </div>
                <p className="text-sm font-medium mb-1">{roleDisplayNames.org_admin}</p>
                <p className="text-xs text-muted-foreground">
                  Full control within organization. Can manage users, settings, and all resources.
                </p>
                <p className="text-xs text-orange-600 mt-2">
                  ⚠️ Cannot create other org_admins
                </p>
              </div>
              <div className="p-4 border rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="secondary">moderator</Badge>
                </div>
                <p className="text-sm font-medium mb-1">{roleDisplayNames.moderator}</p>
                <p className="text-xs text-muted-foreground">
                  Manages integrations, categories, AI settings, tickets, and messages.
                </p>
              </div>
              <div className="p-4 border rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="secondary">support</Badge>
                </div>
                <p className="text-sm font-medium mb-1">{roleDisplayNames.support}</p>
                <p className="text-xs text-muted-foreground">
                  Can manage tickets and messages, view statistics. No access to settings.
                </p>
              </div>
              <div className="p-4 border rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="secondary">associate</Badge>
                </div>
                <p className="text-sm font-medium mb-1">{roleDisplayNames.associate}</p>
                <p className="text-xs text-muted-foreground">
                  Read-only access. Can view tickets and messages, request changes.
                </p>
              </div>
              <div className="p-4 border rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="secondary">member</Badge>
                </div>
                <p className="text-sm font-medium mb-1">{roleDisplayNames.member}</p>
                <p className="text-xs text-muted-foreground">
                  Basic organization member with read-only access to tickets and messages.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};
