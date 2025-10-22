import { useMemo } from 'react';
import { useAuthStore } from '@/stores/authStore';
import {
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
  canManageUsers,
  canAccessSettings,
  isOrgAdminOrHigher,
  type Permission,
  type GlobalRole,
  type OrganizationRole,
} from '@/types/roles';

/**
 * Hook for checking user permissions
 */
export const usePermissions = () => {
  const user = useAuthStore(state => state.user);

  const userRole: GlobalRole = user?.role || 'user';
  const orgRole: OrganizationRole | undefined = user?.organizationRole;

  return useMemo(
    () => ({
      // Check single permission
      hasPermission: (permission: Permission) => hasPermission(userRole, orgRole, permission),

      // Check if user has ANY of the permissions
      hasAnyPermission: (permissions: Permission[]) =>
        hasAnyPermission(userRole, orgRole, permissions),

      // Check if user has ALL permissions
      hasAllPermissions: (permissions: Permission[]) =>
        hasAllPermissions(userRole, orgRole, permissions),

      // Role checks
      isAdmin: userRole === 'admin',
      isOrgAdmin: isOrgAdminOrHigher(userRole, orgRole),
      canManageUsers: canManageUsers(userRole, orgRole),
      canAccessSettings: canAccessSettings(userRole, orgRole),
      canManageOrganization: isOrgAdminOrHigher(userRole, orgRole),

      // User info
      userRole,
      orgRole,
      user,
    }),
    [userRole, orgRole, user]
  );
};
