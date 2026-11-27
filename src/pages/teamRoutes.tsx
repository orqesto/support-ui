/**
 * Route elements for the team builder pages, kept out of App.tsx (its max-lines budget), like
 * customApiRoutes. The page chunks load lazily.
 */
import { lazy, Suspense } from 'react';
import { Route } from 'react-router-dom';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { RouteFallback } from './routeFallback';
import { TEAM_NEW_ROUTE, TEAM_PAGE_ROUTE } from '@/features/settings/shell';

const loadTeamPages = () => import('./teamPages');
const NewTeamPage = lazy(() => loadTeamPages().then((mod) => ({ default: mod.NewTeamPage })));
const TeamDetailPage = lazy(() =>
  loadTeamPages().then((mod) => ({ default: mod.TeamDetailPage }))
);

const teamRoute = (key: string, path: string, Page: typeof NewTeamPage) => (
  <Route
    key={key}
    path={path}
    element={
      <ProtectedRoute>
        <Suspense fallback={<RouteFallback />}>
          <Page />
        </Suspense>
      </ProtectedRoute>
    }
  />
);

export const teamSubRoutes = () => [
  teamRoute('team-new', TEAM_NEW_ROUTE, NewTeamPage),
  teamRoute('team-page', TEAM_PAGE_ROUTE, TeamDetailPage),
];
