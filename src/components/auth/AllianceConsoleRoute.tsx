import { Navigate } from 'react-router-dom';
import { ALLIANCE_CONSOLE_ENABLED } from '@/lib/config';
import { useAuthStore } from '@/stores/authStore';

/**
 * Route guard for the alliance console.
 *
 * The alliance console is deferred for CUSTOMERS until a real multi-workspace customer
 * exists (see {@link ALLIANCE_CONSOLE_ENABLED}): the customer-facing nav entry hides and a
 * hand-typed `/console` URL bounces to the dashboard.
 *
 * Global admins (Odly staff) are NOT gated — the flag controls customer exposure, not
 * ops. Global admins provision and manage alliances from the platform console (Platform ›
 * Alliances → Create / Manage), which drills into this same alliance console, so they must
 * always be able to reach it even while it's deferred for customers (otherwise the feature
 * could never be turned on for the first customer). Mirrors the `BillingRoute` pattern in
 * `App.tsx`.
 */
export const AllianceConsoleRoute = ({ children }: { children: JSX.Element }) => {
  const isGlobalAdmin = useAuthStore((state) => state.user?.role === 'admin');
  return ALLIANCE_CONSOLE_ENABLED || isGlobalAdmin ? (
    children
  ) : (
    <Navigate to="/dashboard" replace />
  );
};
