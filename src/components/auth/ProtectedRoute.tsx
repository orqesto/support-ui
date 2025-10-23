import { Navigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { hasPermission, type Permission } from '@/types/roles';

type ProtectedRouteProps = {
  children: React.ReactNode;
  requiredPermission?: Permission;
  fallbackPath?: string;
};

/**
 * Route guard component
 * Redirects to login if not authenticated
 * Redirects to fallback if missing required permission
 */
export const ProtectedRoute = ({
  children,
  requiredPermission,
  fallbackPath = '/dashboard',
}: ProtectedRouteProps) => {
  const user = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  // Not authenticated - redirect to login
  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }

  // Check permission if required
  if (requiredPermission) {
    const hasRequiredPermission = hasPermission(
      user.role,
      user.organizationRole,
      requiredPermission
    );

    if (!hasRequiredPermission) {
      return <Navigate to={fallbackPath} replace />;
    }
  }

  return <>{children}</>;
};
