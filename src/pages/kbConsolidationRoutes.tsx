/**
 * Route elements for KB consolidation (#873), kept out of App.tsx (its max-lines budget).
 *
 * The Cases page is removed (KB engine Stage 1): `/knowledge-base/cases` lands on the Questions view.
 * The old merges review page is retired: `/knowledge-base/merges` sends old links to the list, which decides.
 */
import { lazy, Suspense, type ReactElement } from 'react';
import { Navigate, Route } from 'react-router-dom';
import { Spinner } from '@/components/ui/Spinner';
import { AUTO_ACTIONS_HREF } from '@/components/kb/autoActions/kbAutoActionCopy';

// DEV only: the F0 page mock for owner review (deleted in F7).
const KbPageMock = lazy(() =>
  import('./kbMock/KbPageMock').then((mod) => ({ default: mod.KbPageMock }))
);

const Fallback = () => (
  <div className="flex min-h-[60vh] items-center justify-center" role="status" aria-busy="true">
    <Spinner />
  </div>
);

/** The old Automatic actions page. It is now a section of Settings › AI (owner, 2026-10-22). */
export const KB_AUTO_ACTIONS_PATH = '/knowledge-base/automatic';

/**
 * The KB sub-page routes, kept here so App.tsx stays inside its max-lines budget. `wrap` is App's
 * PrivateRoute (signed-in gate); each page's own route element adds the permission gate.
 */
export const kbSubRoutes = (_wrap?: (page: JSX.Element) => ReactElement) => [
  // Removed: the old KB Cases link lands on the Questions view.
  <Route
    key="kb-cases"
    path="/knowledge-base/cases"
    element={<Navigate to="/knowledge-base?view=questions" replace />}
  />,
  // Retired: the Knowledge Base list is the one place to decide (old links and bookmarks land there).
  <Route
    key="kb-merges"
    path="/knowledge-base/merges"
    element={<Navigate to="/knowledge-base?status=suggested_change" replace />}
  />,
  // Moved to Settings › AI: old links and bookmarks land on the section.
  <Route
    key="kb-auto"
    path={KB_AUTO_ACTIONS_PATH}
    element={<Navigate to={AUTO_ACTIONS_HREF} replace />}
  />,
];

/**
 * DEV only: the F0 page mock, OUTSIDE the sign-in gate and the app shell so it can be opened and
 * screenshotted without a login. Renders nothing in a production build. Deleted in F7.
 */
export const kbMockRoutes = () =>
  import.meta.env.DEV
    ? [
        <Route
          key="kb-mock"
          path="/knowledge-base/mock"
          element={
            <Suspense fallback={<Fallback />}>
              <KbPageMock />
            </Suspense>
          }
        />,
      ]
    : [];
