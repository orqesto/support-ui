import { Navigate } from 'react-router-dom';
import { ALLIANCE_CONSOLE_ENABLED } from '@/lib/config';

/**
 * Route guard for the alliance console.
 *
 * The alliance console is hidden product-wide until a real multi-workspace customer
 * exists (see {@link ALLIANCE_CONSOLE_ENABLED}). The nav hides its entry, but the
 * routes must be guarded too so a hand-typed `/console` URL can't reach a dormant
 * surface — bounce to the dashboard when the flag is off. Mirrors the `BillingRoute`
 * pattern in `App.tsx`.
 */
export const AllianceConsoleRoute = ({ children }: { children: JSX.Element }) =>
  ALLIANCE_CONSOLE_ENABLED ? children : <Navigate to="/dashboard" replace />;
