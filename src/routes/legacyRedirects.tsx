import { Navigate, Route, useLocation, useParams } from 'react-router-dom';
import { slaPerformancePath } from '@/lib/slaPerformancePath';
import { LegacyMessagesRedirect } from '@/components/routing/LegacyMessagesRedirect';
import * as OrgConsole from '@/pages/organisationConsoleRoutes';

/**
 * Old addresses renamed on 2026-10-19 (Messages → Threads, Alliance → Organisation).
 * Each keeps working by redirecting to its new address; ids, query string and hash carry over.
 * `/sla` (2026-11-10): the standalone SLA page was merged into Statistics → Performance; its
 * window (`?days=` or `?from=&to=`) carries over.
 * `/tickets/edit/:id` (2026-11-10): tickets are edited in place on the ticket itself (title,
 * description, status, priority, category, assignee, labels) since 2026-04; the old form page had
 * no link left, so the address opens the ticket.
 * Returned as an array (not a component) so `<Routes>` sees the `<Route>`s directly.
 */
export const LegacySlaRedirect = () => {
  const { search } = useLocation();
  return <Navigate to={slaPerformancePath(search, 30)} replace />;
};

const LegacyTicketEditRedirect = () => {
  const { id } = useParams();
  const { search, hash } = useLocation();
  return <Navigate to={`/tickets/${id ?? ''}${search}${hash}`} replace />;
};

export const legacyRedirectRoutes = () => [
  <Route key="ticket-edit" path="/tickets/edit/:id" element={<LegacyTicketEditRedirect />} />,
  <Route key="sla" path="/sla" element={<LegacySlaRedirect />} />,
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
