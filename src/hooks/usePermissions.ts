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
  type PermissionOverrides,
} from '@/types/roles';

/**
 * Hook for checking user permissions. Wave 5 B (Model A): the user's
 * permissionOverrides are now consumed here so the UI hides/shows features
 * to match what the BE will allow — without this, a granted override on
 * MANAGE_KB would let the BE accept the call but the FE wouldn't render the
 * entry point for the user to make it.
 */
export const usePermissions = () => {
  const user = useAuthStore((state) => state.user);

  const userRole: GlobalRole = user?.role ?? 'user';
  const orgRole: OrganizationRole | undefined = user?.organizationRole;
  const overrides: PermissionOverrides | null = user?.permissionOverrides ?? null;

  return useMemo(
    () => ({
      // Check single permission
      hasPermission: (permission: Permission) =>
        hasPermission(userRole, orgRole, permission, overrides),

      // Check if user has ANY of the permissions
      hasAnyPermission: (permissions: Permission[]) =>
        hasAnyPermission(userRole, orgRole, permissions, overrides),

      // Check if user has ALL permissions
      hasAllPermissions: (permissions: Permission[]) =>
        hasAllPermissions(userRole, orgRole, permissions, overrides),

      // Role checks (overrides cannot grant/revoke roles themselves, but
      // can affect derived "can X" predicates that resolve to permission checks)
      isAdmin: userRole === 'admin',
      isOrgAdmin: isOrgAdminOrHigher(userRole, orgRole),
      canManageUsers: canManageUsers(userRole, orgRole, overrides),
      canAccessSettings: canAccessSettings(userRole, orgRole, overrides),
      canManageOrganization: isOrgAdminOrHigher(userRole, orgRole),

      // User info
      userRole,
      orgRole,
      user,
    }),
    [userRole, orgRole, overrides, user]
  );
};
