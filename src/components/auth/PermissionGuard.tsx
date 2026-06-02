import { usePermissions } from '@/hooks/usePermissions';
import { logger } from '@/lib/logger';
import type { Permission } from '@/types/roles';

type PermissionGuardProps = {
  children: React.ReactNode;
  permission?: Permission;
  permissions?: Permission[];
  requireAll?: boolean; // If true, requires ALL permissions. If false, requires ANY
  fallback?: React.ReactNode;
};

/**
 * Component that conditionally renders children based on user permissions
 *
 * @example
 * // Single permission
 * <PermissionGuard permission={Permission.MANAGE_TICKETS}>
 *   <Button>Delete Ticket</Button>
 * </PermissionGuard>
 *
 * @example
 * // Multiple permissions (ANY)
 * <PermissionGuard permissions={[Permission.MANAGE_TICKETS, Permission.MANAGE_ORGANIZATION]}>
 *   <Button>Edit</Button>
 * </PermissionGuard>
 *
 * @example
 * // Multiple permissions (ALL)
 * <PermissionGuard
 *   permissions={[Permission.MANAGE_TICKETS, Permission.DELETE_TICKETS]}
 *   requireAll
 * >
 *   <Button>Delete</Button>
 * </PermissionGuard>
 */
export const PermissionGuard = ({
  children,
  permission,
  permissions,
  requireAll = false,
  fallback = null,
}: PermissionGuardProps) => {
  const { hasPermission, hasAnyPermission, hasAllPermissions } = usePermissions();

  let hasAccess = false;

  if (permission) {
    // Single permission check
    hasAccess = hasPermission(permission);
  } else if (permissions && permissions.length > 0) {
    // Multiple permissions check
    hasAccess = requireAll ? hasAllPermissions(permissions) : hasAnyPermission(permissions);
  } else {
    // No permissions specified — fail closed in all environments to prevent accidental exposure.
    logger.error('PermissionGuard rendered without permission or permissions prop — access denied');
    hasAccess = false;
  }

  if (!hasAccess) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
};
