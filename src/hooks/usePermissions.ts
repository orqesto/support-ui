import { useMemo } from 'react';
import { useWorkspaceScope } from '@/contexts/WorkspaceScopeContext';
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
  // Inside a per-workspace management shell, evaluate permissions against the
  // caller's effective role in THAT workspace, not their frozen home-org role (F3).
  // The scope's org_admin comes from D-04 (alliance_admin→org_admin); home-org
  // permissionOverrides do not apply to a different org, so they are dropped here.
  const workspaceScope = useWorkspaceScope();

  const userRole: GlobalRole = user?.role ?? 'user';
  const orgRole: OrganizationRole | undefined =
    workspaceScope?.orgRole ?? user?.organizationRole;
  const overrides: PermissionOverrides | null = workspaceScope
    ? null
    : user?.permissionOverrides ?? null;

  // Alliance-console gate (D-ADM-shell-A): a global admin, or a user with any
  // alliance_admin membership in the payload, may open the console shell. UX-only —
  // the BE re-validates on every /api/alliances call. The precise per-alliance list
  // (and the switcher target) comes from the useAllianceAdmin "my alliances" query
  // (05-01 Task 3); this predicate just decides whether the "Manage" affordance shows.
  const isAllianceAdmin =
    userRole === 'admin' ||
    (user?.allianceMemberships?.some((membership) => membership.role === 'alliance_admin') ?? false);

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
      isAllianceAdmin,
      canManageUsers: canManageUsers(userRole, orgRole, overrides),
      canAccessSettings: canAccessSettings(userRole, orgRole, overrides),
      canManageOrganization: isOrgAdminOrHigher(userRole, orgRole),

      // User info
      userRole,
      orgRole,
      user,
    }),
    [userRole, orgRole, overrides, user, isAllianceAdmin]
  );
};
