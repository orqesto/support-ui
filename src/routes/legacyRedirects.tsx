import { Navigate, Route } from 'react-router-dom';
import { LegacyMessagesRedirect } from '@/components/routing/LegacyMessagesRedirect';
import * as OrgConsole from '@/pages/organisationConsoleRoutes';

/**
 * Old addresses renamed on 2026-10-19 (Messages → Threads, Alliance → Organisation).
 * Each keeps working by redirecting to its new address; ids, query string and hash carry over.
 * Returned as an array (not a component) so `<Routes>` sees the `<Route>`s directly.
 */
export const legacyRedirectRoutes = () => [
  <Route key="messages" path="/messages/*" element={<LegacyMessagesRedirect />} />,
  <Route
    key="alliance-console"
    path={OrgConsole.LEGACY_ROUTE}
    element={<OrgConsole.LegacyAllianceConsoleRedirect />}
  />,
  <Route
    key="platform-alliances"
    path="/console/platform/alliances"
    element={<Navigate to="/console/platform/organisations" replace />}
  />,
];
