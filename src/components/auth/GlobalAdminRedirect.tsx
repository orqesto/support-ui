import { Navigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';

type GlobalAdminRedirectProps = {
  /** Consolidated platform-console path a global admin is sent to instead. */
  to: string;
  children: React.ReactNode;
};

/**
 * P3 route-consolidation guard. Global admins (`users.role === 'admin'`) are
 * redirected into the unified platform console, which now supersedes the old
 * scattered `/admin` and `/organization` surfaces. Everyone else — notably org
 * admins who reach `/organization` via the MANAGE_ORGANIZATION permission rather
 * than a global role — still gets the original page.
 *
 * The old page components stay mounted behind this wrapper as a one-release
 * fallback: removing the wrapper restores direct access with no other change.
 */
export const GlobalAdminRedirect = ({ to, children }: GlobalAdminRedirectProps) => {
  const user = useAuthStore((state) => state.user);

  if (user?.role === 'admin') {
    return <Navigate to={to} replace />;
  }

  return <>{children}</>;
};
